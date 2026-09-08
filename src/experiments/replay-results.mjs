import { isDeepStrictEqual } from 'node:util';
import { recordId } from '../core/local-store.mjs';
import { openWorkspace, record } from '../sources/records.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { validUuid } from '../sources/observation-record.mjs';
import { fail, USER_SOURCE_ERROR_KINDS } from '../sources/errors.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { findCurrentDesktopSession, readDesktopRecords } from '../codex/desktop-record.mjs';
import { projectReplayTask } from '../codex/replay-observation.mjs';
import { loadReplayIndex } from './replay-index.mjs';
import { loadReplayAttempts, loadReplayNative } from './replay-records.mjs';
import { withReplayLock, assertReplayReviewCurrent, transitionReplay, replayStatePayload } from './replay-service.mjs';
import { hash } from './start-records.mjs';
import { inventoryStartingFiles } from './inventory.mjs';
import { captureStartingFiles, assertStartingFilesCurrent, digestBytes } from './files.mjs';
import { readStartingManifest, writeStartingManifest } from './records.mjs';
import { readReplayWorkLocation } from './work-location.mjs';
import { assessReplay } from './replay-assessment.mjs';
import { loadReplayResultReview, replayResultReviewSummary, loadReplayResult } from './replay-result-records.mjs';

const request = (args, required, optional = []) => exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
const now = () => new Date().toISOString();
const selected = (attempts, id) => { const a = attempts.find(x => x.attemptId === id); if (!a) fail('replay-attempt-unavailable'); return a; };
async function sourceIssue(w, review) {
  try { await assertReplayReviewCurrent(w, review); return null; }
  catch (e) { return USER_SOURCE_ERROR_KINDS.includes(e.kind) ? e.kind : 'operation-failed'; }
}
async function bindingFor(w, attempt, taskId, read, observedAt) {
  const native = await loadReplayNative(w, attempt.nativeId, attempt.review.project);
  const manifest = await readStartingManifest({ store: w.workspace, manifestId: attempt.review.variant.manifestId, withBytes: true });
  const global = attempt.review.snapshot.override?.text.trim() ? attempt.review.snapshot.override.text : attempt.review.snapshot.base?.text ?? '';
  const text = path => {
    const file = manifest.files.find(f => f.path === path && f.present);
    if (!file) return '';
    const value = file.bytes.toString('utf8');
    return Buffer.from(value).equals(file.bytes) ? value : null;
  };
  const fallbacks = native.config.project_doc_fallback_filenames ?? [];
  let projectInstructions = '', instructions = null;
  if (Array.isArray(fallbacks) && fallbacks.every(p => typeof p === 'string' && !/[\\/\0\r\n]/.test(p))) {
    for (const path of ['AGENTS.override.md', 'AGENTS.md', ...fallbacks]) {
      const value = text(path);
      if (value === null) { projectInstructions = null; break; }
      if (value.trim()) { projectInstructions = value.trim(); break; }
    }
    if (projectInstructions !== null) {
      instructions = [global.replaceAll('\r\n', '\n').trim(), projectInstructions.replaceAll('\r\n', '\n').trim()].filter(Boolean).join('\n\n--- project-doc ---\n\n');
      const limit = native.config.project_doc_max_bytes ?? 32768;
      if (!Number.isSafeInteger(limit) || limit < 0 || Buffer.byteLength(instructions) > limit) instructions = null;
    }
  }
  const expectedSources = attempt.review.variant.expectedSources.map(s => {
    const mapping = attempt.review.variant.sourceMappings.find(m => m.sourceId === s.sourceId);
    return mapping ? { ...s, path: mapping.path } : s;
  });
  return { taskId, project: attempt.review.project, readyAt: attempt.readyAt, observedAt,
    request: attempt.review.saved.review.declaration.request, expectedSources, nativeConfig: native.config, instructions, recordRead: read.recordRead };
}
async function captureOutcome(w, attempt) {
  try {
    const location = await readReplayWorkLocation({ store: w.workspace, locationId: attempt.review.locationId });
    if (location.phase !== 'created' || location.project !== attempt.review.project) throw Error();
    // Actual work may legitimately edit files or Git state. This is a new
    // outcome snapshot, not the pre-handoff tree/index assertion.
    const args = { project: location.project, additionalPaths: attempt.review.manifest.files.map(f => f.path) };
    const before = await inventoryStartingFiles(args);
    const capture = await captureStartingFiles({ project: location.project, paths: before.paths });
    if (!isDeepStrictEqual(before.guards, capture.guards)) throw Error();
    const manifestId = await writeStartingManifest({ store: w.workspace, capture });
    await sourceTransactionHook('replay-outcome-captured');
    await assertStartingFilesCurrent({ project: location.project, capture });
    const after = await inventoryStartingFiles(args);
    if (!isDeepStrictEqual(before.paths, after.paths) || !isDeepStrictEqual(before.guards, after.guards)
      || !isDeepStrictEqual(location, await readReplayWorkLocation({ store: w.workspace, locationId: attempt.review.locationId }))) throw Error();
    return { manifestId, capturedAt: now(), ignoredFiles: before.selection.ignoredFiles, issue: null };
  } catch { return { manifestId: null, capturedAt: null, ignoredFiles: 'unknown', issue: 'replay-outcome-files-unavailable' }; }
}
async function recordingChanged(w, taskId, read) {
  try {
    const latest = await readDesktopRecords(await findCurrentDesktopSession({ sessionId: taskId, codexHome: w.reg.context.codexHome }));
    return !isDeepStrictEqual(latest, read);
  } catch { return true; }
}
function changedRecording(payload) {
  payload.readIssue = 'replay-task-record-changed';
  if (payload.qualification.status === 'matched-record') payload.qualification.status = 'unknown-record';
  if (!payload.qualification.reasons.includes('task-record-changed-during-collection'))
    payload.qualification.reasons.push('task-record-changed-during-collection');
}
export async function observeUserReplay(args) {
  request(args, ['attemptId', 'taskId']);
  if (!hash(args.attemptId) || !validUuid(args.taskId)) fail('invalid-request');
  const taskId = args.taskId.toLowerCase();
  return withReplayLock(args.workspace, async w => {
    const index = await loadReplayIndex(w), attempt = selected(await loadReplayAttempts(w, index), args.attemptId);
    if (!['ready', 'cancelled'].includes(attempt.phase) || !attempt.readyAt) fail('replay-attempt-unavailable');
    let read = { records: [], recordRead: { incompleteTrailingLine: false, snapshotBytes: 0 } }, readIssue = null;
    const firstIssue = await sourceIssue(w, attempt.review);
    try { read = await readDesktopRecords(await findCurrentDesktopSession({ sessionId: taskId, codexHome: w.reg.context.codexHome })); }
    catch (e) { readIssue = e.kind === 'current-session-unavailable' ? 'replay-task-record-unavailable' : 'replay-task-record-invalid'; }
    const files = await captureOutcome(w, attempt), capturedAt = now();
    const binding = await bindingFor(w, attempt, taskId, read, capturedAt);
    const projection = projectReplayTask(read.records, binding);
    if (readIssue) { projection.measurement = null; projection.outputText = null; }
    const payload = { role: 'replay-result-review', schemaVersion: 1, scopeId: w.scopeId, attemptId: attempt.attemptId,
      attemptStateId: attempt.stateId, taskId, capturedAt, recordRead: read.recordRead,
      recordingDigest: readIssue ? null : digestBytes(Buffer.from(JSON.stringify(read.records))), readIssue,
      sourceIssue: firstIssue ?? await sourceIssue(w, attempt.review), ...projection, files };
    if (readIssue === null && await recordingChanged(w, taskId, read)) changedRecording(payload);
    let resultReviewId = await record(w.workspace, 'application', payload);
    try {
      await sourceTransactionHook('replay-result-reviewed');
      const lateIssue = payload.sourceIssue ?? await sourceIssue(w, attempt.review);
      const lateReadChange = payload.readIssue === null && await recordingChanged(w, taskId, read);
      if (lateIssue !== payload.sourceIssue || lateReadChange) {
        payload.sourceIssue = lateIssue;
        if (lateReadChange) changedRecording(payload);
        resultReviewId = await record(w.workspace, 'application', payload);
      }
      return replayResultReviewSummary(await loadReplayResultReview(w, resultReviewId));
    } catch { fail('replay-publication-uncertain'); }
  });
}
export async function saveUserReplayResult(args) {
  request(args, ['resultReviewId', 'assessment'], ['previousResultId']);
  if (!hash(args.resultReviewId) || args.previousResultId !== undefined && !hash(args.previousResultId)) fail('invalid-request');
  return withReplayLock(args.workspace, async w => {
    const review = await loadReplayResultReview(w, args.resultReviewId);
    const expanded = assessReplay(args.assessment, review.attempt.review.saved.review.declaration);
    const assessment = { ...expanded, requirements: expanded.requirements.map(({ id, result }) => ({ id, result })),
      ratings: expanded.ratings.map(({ id, score, reason }) => ({ id, score, reason })) };
    const payload = { kind: 'unharness-user-source', role: 'replay-result', schemaVersion: 1, scopeId: w.scopeId,
      attemptId: review.attemptId, resultReviewId: review.resultReviewId, assessment, previousResultId: args.previousResultId ?? null };
    const resultId = recordId('application', payload), index = await loadReplayIndex(w);
    const attempt = selected(await loadReplayAttempts(w, index), review.attemptId);
    if (attempt.phase === 'recorded' && attempt.resultId === resultId)
      return { ...(await loadReplayResult(w, resultId)).summary, duplicate: true };
    if (args.previousResultId !== undefined) {
      if (attempt.phase !== 'recorded' || attempt.resultId !== args.previousResultId) fail('replay-assessment-conflict');
      const previous = await loadReplayResult(w, args.previousResultId);
      if (previous.review.resultReviewId !== review.resultReviewId || previous.review.attemptId !== review.attemptId) fail('replay-assessment-conflict');
    } else if (attempt.stateId !== review.attemptStateId || !['ready', 'cancelled'].includes(attempt.phase)) fail('replay-assessment-conflict');
    try {
      await record(w.workspace, 'application', payload);
      await sourceTransactionHook('replay-result-recorded');
      await loadReplayResult(w, resultId);
      await transitionReplay(w, index, { ...replayStatePayload(attempt), schemaVersion: 2, previousStateId: attempt.stateId,
        phase: 'recorded', updatedAt: now(), resultId }, false);
      return { ...(await loadReplayResult(w, resultId)).summary, duplicate: false };
    } catch (e) { if (e.kind === 'replay-assessment-conflict') throw e; fail('replay-publication-uncertain'); }
  });
}
export async function readUserReplayResult(args) {
  request(args, ['resultId']);
  if (!hash(args.resultId)) fail('invalid-request');
  return (await loadReplayResult(await openWorkspace(args.workspace), args.resultId)).summary;
}
