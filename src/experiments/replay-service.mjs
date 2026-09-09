import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { openWorkspace, loadSnapshot, record } from '../sources/records.mjs';
import { acquire, pending, assertCurrent, sourceTransactionHook } from '../sources/transaction.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail, USER_SOURCE_ERROR_KINDS } from '../sources/errors.mjs';
import { readReplayConditions, compareReplayConditions, replayConditionsIdentity } from '../codex/replay-conditions.mjs';
import { loadSavedStart, hash, START_CONDITIONS } from './start-records.mjs';
import { assertReplayRepository, inspectReplayRepository } from './repository.mjs';
import { createReplayWorkLocation, readReplayWorkLocation } from './work-location.mjs';
import { materializeStartingFiles } from './materialize.mjs';
import { buildReplayVariant } from './variant.mjs';
import { captureReplayRetainedInputs, assertReplayRetainedInputs, assertReplayStartingTree } from './replay-inputs.mjs';
import { loadReplayIndex, publishReplayIndex } from './replay-index.mjs';
import { captureReplayGitGuard, assertReplayGitGuard } from './replay-git.mjs';
import { loadReplaySeries, loadReplayReview, loadReplayAttempts, replaySourceBinding, replayReviewSummary } from './replay-records.mjs';

const request = (args, required, optional = []) => {
  exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
  for (const key of [...required, ...optional]) if (args[key] !== undefined && !hash(args[key])) fail('invalid-request');
};
const now = () => new Date().toISOString();
async function locked(workspace, action) {
  const opened = await openWorkspace(workspace), release = await acquire(opened);
  try { return await action(await openWorkspace(workspace)); } finally { await release(); }
}
async function ensureSources(w, binding = replaySourceBinding(w)) {
  const current = await openWorkspace(w.workspace);
  if (!isDeepStrictEqual(current.reg, w.reg) || !isDeepStrictEqual(replaySourceBinding(current), binding)) fail('replay-preparation-stale');
  if (await pending(w.workspace)) fail('recovery-required');
  await assertCurrent(current, await loadSnapshot(w.workspace, w.reg, binding.snapshotId, binding.snapshotVersion));
  return current;
}
async function nativeRecord(w, value) {
  return record(w.workspace, 'observation', { role: 'replay-native', schemaVersion: 1, scopeId: w.scopeId, value });
}
async function assertReviewCurrent(w, review) {
  await ensureSources(w, review.sourceBinding);
  await assertReplayRepository(review.series.repository);
  await assertReplayRetainedInputs(w, review.retainedGuard);
  const native = await readReplayConditions(w.reg.context);
  if (replayConditionsIdentity(native) !== replayConditionsIdentity(review.native)) fail('replay-retained-conditions-changed');
  await ensureSources(w, review.sourceBinding);
  await assertReplayRetainedInputs(w, review.retainedGuard);
  return native;
}
function stripLoaded(attempt) {
  const { stateId, review, ...value } = attempt;
  return value;
}
async function transition(w, index, payload, active) {
  const stateId = await record(w.workspace, 'experiment', payload);
  const attempts = index.data.attempts.filter(a => a.attemptId !== payload.attemptId);
  attempts.push({ attemptId: payload.attemptId, stateId });
  return publishReplayIndex(w, index, { ...index.data, revision: index.data.revision + 1, attempts,
    activeAttemptId: active ? payload.attemptId
      : index.data.activeAttemptId === payload.attemptId ? null : index.data.activeAttemptId });
}
async function attemptSummary(w, attempt) {
  let conditionIssue = null, locationIssue = null, project = null;
  try { await ensureSources(w, attempt.review.sourceBinding); }
  catch (e) { conditionIssue = USER_SOURCE_ERROR_KINDS.includes(e.kind) ? e.kind : 'source-conflict'; }
  try {
    const location = await readReplayWorkLocation({ store: w.workspace, locationId: attempt.review.locationId });
    if (location.phase === 'created') project = location.project;
    else locationIssue = 'replay-location-incomplete';
  } catch { locationIssue = 'replay-location-invalid'; }
  return { attemptId: attempt.attemptId, reviewId: attempt.reviewId, startId: attempt.review.startId, scopeId: w.scopeId,
    phase: attempt.phase, preparedMode: attempt.review.sourceBinding.preparedMode, snapshotId: attempt.review.sourceBinding.snapshotId,
    createdAt: attempt.createdAt, preparedAt: attempt.preparedAt, readyAt: attempt.readyAt, cancelledAt: attempt.cancelledAt,
    failure: attempt.failure, conditionIssue, locationIssue, project,
    resultId: attempt.resultId ?? null,
    budget: { ...attempt.review.saved.review.declaration.budget },
    handoffAvailable: ['prepared', 'ready'].includes(attempt.phase) && !conditionIssue && !locationIssue,
    conditions: { ...START_CONDITIONS, gitObjectsAndRefs: attempt.review.series.repository.kind === 'git' ? 'shared' : 'not-applicable' },
    desktopRuntimeVerified: false, desktopTaskStopped: false };
}
function selected(attempts, id) {
  const value = attempts.find(a => a.attemptId === id);
  if (!value) fail('replay-attempt-unavailable');
  return value;
}
// Sequential replay needs a runtime-authoritative conditions report and a
// desktop project-open command. An application without both is refused here,
// with its own reason, instead of running another application's native path.
export function assertReplaySupported(w) {
  const support = applicationFor(w.reg.context).sequentialReplay;
  if (!support.supported) fail('replay-application-unsupported');
  return support;
}
export function replaySupportOf(w) {
  return applicationFor(w.reg.context).sequentialReplay;
}

export async function reviewUserReplay(args) {
  request(args, ['startId']);
  return locked(args.workspace, async w => {
    assertReplaySupported(w);
    await ensureSources(w);
    const saved = await loadSavedStart(w, args.startId);
    let index = await loadReplayIndex(w);
    await loadReplayAttempts(w, index);
    let seriesId = index.data.series.find(s => s.startId === args.startId)?.seriesId;
    if (!seriesId) {
      const repository = await inspectReplayRepository({ project: w.reg.context.project });
      seriesId = await record(w.workspace, 'experiment', { role: 'replay-series', schemaVersion: 1, scopeId: w.scopeId,
        startId: args.startId, pinnedAt: now(), repository });
      index = await publishReplayIndex(w, index, { ...index.data, revision: index.data.revision + 1,
        series: [...index.data.series, { startId: args.startId, seriesId }] });
    }
    const series = await loadReplaySeries(w, seriesId);
    await assertReplayRepository(series.repository);
    const locationId = randomBytes(32).toString('hex'), project = join(w.workspace, 'replays', locationId, 'work');
    const sourceBinding = replaySourceBinding(w), native = await readReplayConditions(w.reg.context);
    const variant = await buildReplayVariant({ w, manifestId: saved.review.manifestId, project });
    const retainedGuard = await captureReplayRetainedInputs(w, saved.review.manifestId, native);
    await ensureSources(w, sourceBinding);
    const nativeId = await nativeRecord(w, native);
    const reviewId = await record(w.workspace, 'experiment', { role: 'replay-review', schemaVersion: 1, scopeId: w.scopeId,
      startId: args.startId, seriesId, createdAt: now(), locationId, sourceBinding, nativeId, variant, retainedGuard });
    return replayReviewSummary(await loadReplayReview(w, reviewId));
  });
}
export async function prepareUserReplay(args) {
  request(args, ['reviewId']);
  return locked(args.workspace, async w => {
    assertReplaySupported(w);
    let index = await loadReplayIndex(w), attempts = await loadReplayAttempts(w, index);
    const duplicate = attempts.find(a => a.attemptId === args.reviewId);
    if (duplicate) return { ...await attemptSummary(w, duplicate), duplicate: true };
    if (index.data.activeAttemptId !== null) fail('replay-active-attempt');
    const review = await loadReplayReview(w, args.reviewId);
    await loadSavedStart(w, review.startId); // Verify immutable bytes before reserving a destination.
    await assertReviewCurrent(w, review);
    const at = now(), payload = { role: 'replay-attempt', schemaVersion: 1, scopeId: w.scopeId,
      attemptId: review.reviewId, reviewId: review.reviewId, previousStateId: null, phase: 'preparing',
      createdAt: at, updatedAt: at, preparedAt: null, readyAt: null, cancelledAt: null, failure: null,
      captureGuard: null, gitGuard: null, nativeId: null, match: null };
    index = await transition(w, index, payload, true);
    try { await sourceTransactionHook('replay-attempt-reserved'); }
    catch { fail('replay-publication-uncertain'); }
    let completed;
    try {
      const location = await createReplayWorkLocation({ store: w.workspace, repository: review.series.repository, locationId: review.locationId });
      const gitGuard = await captureReplayGitGuard(location);
      const { manifestId, ...captureGuard } = await materializeStartingFiles({ store: w.workspace,
        manifestId: review.variant.manifestId, project: location.project, ...(location.gitMarker ? { gitMarker: location.gitMarker } : {}) });
      const original = await assertReviewCurrent(w, review);
      const derived = await readReplayConditions({ ...w.reg.context, project: location.project });
      const match = compareReplayConditions({ original, derived, sourceMappings: review.variant.sourceMappings, expectedSources: review.variant.expectedSources });
      await ensureSources(w, review.sourceBinding);
      await assertReplayRetainedInputs(w, review.retainedGuard);
      if (!isDeepStrictEqual(await readReplayWorkLocation({ store: w.workspace, locationId: review.locationId }), location)) fail('replay-destination-changed');
      await assertReplayStartingTree(location, captureGuard);
      await assertReplayGitGuard(location, gitGuard);
      const nativeId = await nativeRecord(w, derived), preparedAt = now();
      completed = { ...payload, previousStateId: index.data.attempts.at(-1).stateId, phase: 'prepared',
        updatedAt: preparedAt, preparedAt, captureGuard, gitGuard, nativeId, match };
    } catch (e) {
      const failure = USER_SOURCE_ERROR_KINDS.includes(e.kind) ? e.kind : 'operation-failed';
      await transition(w, index, { ...payload, previousStateId: index.data.attempts.at(-1).stateId,
        phase: 'preparation-failed', updatedAt: now(), failure }, false);
      fail(failure);
    }
    await transition(w, index, completed, true);
    attempts = await loadReplayAttempts(w, await loadReplayIndex(w));
    return { ...await attemptSummary(w, selected(attempts, args.reviewId)), duplicate: false };
  });
}
export async function handoffUserReplay(args) {
  request(args, ['attemptId']);
  return locked(args.workspace, w => checkedHandoff(w, args.attemptId));
}
async function checkedHandoff(w, attemptId) {
  assertReplaySupported(w);
    let index = await loadReplayIndex(w), attempts = await loadReplayAttempts(w, index);
    let attempt = selected(attempts, attemptId);
    if (!['prepared', 'ready'].includes(attempt.phase) || index.data.activeAttemptId !== attempt.attemptId) fail('replay-attempt-unavailable');
    const review = attempt.review;
    const used = attempts.filter(a => a.review.startId === review.startId
      && a.review.sourceBinding.preparedMode === review.sourceBinding.preparedMode && a.readyAt !== null).length;
    if (attempt.readyAt === null && used >= review.saved.review.declaration.budget.maxAttempts) fail('replay-attempt-budget-exhausted');
    const original = await assertReviewCurrent(w, review);
    const location = await readReplayWorkLocation({ store: w.workspace, locationId: review.locationId });
    if (location.phase !== 'created' || location.project !== review.project) fail('replay-location-invalid');
    await assertReplayStartingTree(location, attempt.captureGuard);
    await assertReplayGitGuard(location, attempt.gitGuard);
    const derived = await readReplayConditions({ ...w.reg.context, project: location.project });
    const match = compareReplayConditions({ original, derived, sourceMappings: review.variant.sourceMappings, expectedSources: review.variant.expectedSources });
    if (match.retainedConditionsDigest !== attempt.match.retainedConditionsDigest) fail('replay-retained-conditions-changed');
    await ensureSources(w, review.sourceBinding);
    await assertReplayRetainedInputs(w, review.retainedGuard);
    await readReplayWorkLocation({ store: w.workspace, locationId: review.locationId });
    await assertReplayStartingTree(location, attempt.captureGuard);
    await assertReplayGitGuard(location, attempt.gitGuard);
    if (attempt.readyAt === null) {
      const readyAt = now();
      index = await transition(w, index, { ...stripLoaded(attempt), previousStateId: attempt.stateId, phase: 'ready', updatedAt: readyAt, readyAt }, true);
      attempt = selected(await loadReplayAttempts(w, index), attemptId);
    }
    // Publication is another interruption boundary. Do not return a usable
    // request after a source/file edit while its readiness receipt was written.
    await ensureSources(w, review.sourceBinding);
    await assertReplayRetainedInputs(w, review.retainedGuard);
    await assertReplayStartingTree(location, attempt.captureGuard);
    await assertReplayGitGuard(location, attempt.gitGuard);
    return { ...await attemptSummary(w, attempt), request: review.saved.review.declaration.request,
      project: location.project, submission: 'user-starts-fresh-desktop-task' };
}
export async function openUserReplay(args) {
  request(args, ['attemptId']);
  return locked(args.workspace, async w => {
    assertReplaySupported(w);
    const handoff = await checkedHandoff(w, args.attemptId);
    const { openReplayDesktop } = await import('../codex/replay-desktop.mjs');
    return { ...handoff, ...await openReplayDesktop(w.reg.context, handoff.project) };
  });
}
export async function readUserReplay(args) {
  request(args, ['attemptId']);
  const w = await openWorkspace(args.workspace), attempts = await loadReplayAttempts(w, await loadReplayIndex(w));
  return attemptSummary(w, selected(attempts, args.attemptId));
}
export async function listUserReplays(args) {
  request(args, [], ['after']);
  const w = await openWorkspace(args.workspace), index = await loadReplayIndex(w);
  const attempts = (await loadReplayAttempts(w, index)).reverse();
  const offset = args.after === undefined ? 0 : attempts.findIndex(a => a.attemptId === args.after) + 1;
  if (args.after !== undefined && offset === 0) fail('invalid-request');
  const page = attempts.slice(offset, offset + 20), summaries = [];
  for (const a of page) summaries.push(await attemptSummary(w, a));
  const active = attempts.find(a => a.attemptId === index.data.activeAttemptId);
  return { scopeId: w.scopeId, activeAttemptId: index.data.activeAttemptId, activeAttempt: active ? await attemptSummary(w, active) : null, attempts: summaries,
    nextCursor: offset + page.length < attempts.length ? page.at(-1).attemptId : null };
}
export async function cancelUserReplay(args) {
  request(args, ['attemptId']);
  return locked(args.workspace, async w => {
    const index = await loadReplayIndex(w), attempts = await loadReplayAttempts(w, index);
    const attempt = selected(attempts, args.attemptId);
    if (attempt.phase === 'cancelled') return { ...await attemptSummary(w, attempt), duplicate: true };
    if (attempt.phase === 'recorded') fail('replay-attempt-unavailable');
    const at = now();
    await transition(w, index, { ...stripLoaded(attempt), previousStateId: attempt.stateId, phase: 'cancelled', updatedAt: at, cancelledAt: at }, false);
    const latest = selected(await loadReplayAttempts(w, await loadReplayIndex(w)), args.attemptId);
    return { ...await attemptSummary(w, latest), duplicate: false };
  });
}
// Internal coordination for collection. These do not add public request fields.
export { locked as withReplayLock, assertReviewCurrent as assertReplayReviewCurrent,
  transition as transitionReplay, stripLoaded as replayStatePayload };
