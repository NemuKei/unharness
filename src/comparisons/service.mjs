import { platform, release as kernelRelease, arch } from 'node:os';
import { isDeepStrictEqual } from 'node:util';
import { openWorkspace, record, loadSnapshot } from '../sources/records.mjs';
import { acquire, assertCurrent, pending, sourceTransactionHook } from '../sources/transaction.mjs';
import { projectRegisteredTaskObservation } from '../sources/observation.mjs';
import { preparationMetadata, projectObservation, validUuid } from '../sources/observation-record.mjs';
import { findCurrentDesktopSession, readDesktopRecords } from '../codex/desktop-record.mjs';
import { projectCodexRun } from '../codex/run-metrics.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { listRecordPage } from '../core/local-store.mjs';
import { sumCounters } from './measurement.mjs';
import { exactKeys, validateAssessment, boundedText } from './assessment.mjs';
import { freezeSourceContext, associationFor, loadReview, loadRun, reviewSummary, hash } from './records.mjs';
const request = (args, required, optional = []) => exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
async function locked(workspace, action) {
  const opened = await openWorkspace(workspace), release = await acquire(opened);
  try { return await action(await openWorkspace(workspace)); } finally { await release(); }
}
async function sourceGuard(w) {
  try {
    if (await pending(w.workspace)) return 'recovery-required';
    const current = await openWorkspace(w.workspace);
    if (current.scopeId !== w.scopeId || !isDeepStrictEqual(current.reg, w.reg) || !isDeepStrictEqual(current.state, w.state)) return 'source-conflict';
    await assertCurrent(current, await loadSnapshot(w.workspace, w.reg, w.state.snapshotId));
    return null;
  } catch { return 'source-conflict'; }
}
async function captureMatchingInitialSourceEvidence(w, records, capturedAt) {
  const issue = w.captureIssue ?? await sourceGuard(w);
  if (issue) return { association: null, observation: null, issue };
  const boundary = preparationMetadata(w.state);
  if (boundary.issue === 'preparation-metadata-invalid') return { association: null, observation: null, issue: boundary.issue };
  const taskId = w.selectedTaskId;
  let payload;
  try { payload = await projectRegisteredTaskObservation(w, taskId, records, capturedAt, w.readIssue); }
  catch { return { association: null, observation: null, issue: 'source-observation-unavailable' }; }
  let changed = await sourceGuard(w);
  if (changed) return { association: null, observation: null, issue: changed };
  const observationId = await record(w.workspace, 'observation', payload);
  await sourceTransactionHook('comparison-observation');
  const observation = projectObservation({ kind: 'unharness-user-source', ...payload }, observationId, w);
  changed = await sourceGuard(w);
  if (changed) return { association: null, observation: null, issue: changed };
  return { association: observation.status === 'matched-record' ? associationFor(w, freezeSourceContext(w)) : null, observation, issue: null };
}
export async function reviewUserRun(args) {
  request(args, ['taskId'], ['throughTurnId']);
  if (!validUuid(args.taskId)) fail('invalid-request');
  const taskId = args.taskId.toLowerCase();
  return locked(args.workspace, async w => {
    const captureIssue = await sourceGuard(w), sourceContext = freezeSourceContext(w);
    let read;
    try { read = await readDesktopRecords(await findCurrentDesktopSession({ sessionId: taskId, codexHome: w.reg.context.codexHome })); }
    catch (e) { fail(e.kind === 'current-session-unavailable' ? 'comparison-task-record-unavailable' : 'comparison-task-record-invalid'); }
    await sourceTransactionHook('comparison-read');
    const { measurement, outputText } = projectCodexRun(read.records, { taskId, expectedProject: w.reg.context.project, ...(args.throughTurnId === undefined ? {} : { throughTurnId: args.throughTurnId }), recordRead: read.recordRead });
    const capturedAt = new Date().toISOString();
    const source = await captureMatchingInitialSourceEvidence({ ...w, selectedTaskId: taskId, captureIssue, readIssue: read.recordRead.incompleteTrailingLine ? 'task-record-invalid' : null }, read.records, capturedAt);
    const reviewId = await record(w.workspace, 'application', { role: 'run-review', schemaVersion: 1, scopeId: w.scopeId,
      capturedAt, collectedOn: { platform: platform(), kernelRelease: kernelRelease(), architecture: arch(), nodeVersion: process.versions.node },
      measurement, outputText, sourceContext,
      source: { association: source.association, observationId: source.observation?.observationId ?? null, issue: source.issue } });
    return reviewSummary(await loadReview(w, reviewId));
  });
}
export async function saveUserRun(args) {
  request(args, ['reviewId', 'assessment'], ['title', 'previousRunId']);
  const assessment = validateAssessment(args.assessment);
  const title = args.title === undefined ? null : boundedText(args.title, 120);
  return locked(args.workspace, async w => {
    const review = await loadReview(w, args.reviewId);
    if (args.previousRunId !== undefined) {
      const previous = await loadRun(w, args.previousRunId);
      if (previous.review.reviewId !== review.reviewId || previous.review.measurement.taskId !== review.measurement.taskId) fail('comparison-record-invalid');
    }
    const runId = await record(w.workspace, 'observation', { role: 'comparison-run', schemaVersion: 1, scopeId: w.scopeId,
      reviewId: args.reviewId, title, assessment, previousRunId: args.previousRunId ?? null });
    return (await loadRun(w, runId)).summary;
  });
}
export async function readUserRun(args) {
  request(args, ['runId']);
  return (await loadRun(await openWorkspace(args.workspace), args.runId)).summary;
}
export async function readUserRunOutput(args) {
  request(args, ['runId']);
  const { review } = await loadRun(await openWorkspace(args.workspace), args.runId);
  return { runId: args.runId, available: review.measurement.output.available, text: review.outputText, reason: review.measurement.output.reason };
}
export async function listUserRuns(args) {
  request(args, [], ['after']);
  if (args.after !== undefined && !hash(args.after)) fail('invalid-request');
  const w = await openWorkspace(args.workspace), runs = [];
  let after = args.after;
  try {
    do {
      const page = await listRecordPage({ store: w.workspace, type: 'observation', ...(after === undefined ? {} : { after }) });
      for (const [index, entry] of page.records.entries()) {
        if (entry.payload.role !== 'comparison-run') continue;
        runs.push((await loadRun(w, entry.id)).summary);
        if (runs.length === 20) return { runs, nextCursor: index < page.records.length - 1 || page.nextCursor !== null ? entry.id : null };
      }
      after = page.nextCursor;
    } while (after !== null);
    return { runs, nextCursor: null };
  } catch { fail('comparison-record-invalid'); }
}
export async function compareUserRuns(args) {
  request(args, ['runIds']);
  if (!Array.isArray(args.runIds) || args.runIds.length < 1 || args.runIds.length > 3 || new Set(args.runIds).size !== args.runIds.length || !args.runIds.every(hash)) fail('invalid-request');
  const w = await openWorkspace(args.workspace), runs = [];
  for (const runId of args.runIds) runs.push((await loadRun(w, runId)).summary);
  const distinctTaskCount = new Set(runs.map(r => r.measurement.taskId)).size;
  const acceptedCount = runs.filter(r => r.acceptance.accepted).length;
  const outcomeCounts = Object.fromEntries(['accepted', 'failed', 'abandoned', 'unknown'].map(outcome => [outcome, runs.filter(r => r.assessment.outcome === outcome).length]));
  const reasons = [];
  if (distinctTaskCount !== runs.length) reasons.push('overlapping-task-records');
  if (runs.some(r => r.measurement.usage.availability !== 'available' || r.measurement.usage.totals.totalTokens === null)) reasons.push('usage-unavailable-or-partial');
  const totalTokens = reasons.length ? null : sumCounters(runs.map(r => r.measurement.usage.totals.totalTokens));
  if (!reasons.length && totalTokens === null) reasons.push('usage-total-overflow');
  if (acceptedCount === 0) reasons.push('no-accepted-runs');
  const tokensPerAcceptedRun = totalTokens !== null && acceptedCount > 0 ? totalTokens / acceptedCount : null;
  return { runs, measurementKind: 'observational',
    aggregate: { recordCount: runs.length, distinctTaskCount, acceptedCount, outcomeCounts, totalTokens, tokensPerAcceptedRun, reasons },
    assessment: 'neutral', creationEligible: false, reasons: ['predeclared-comparable-evidence-required'] };
}
export async function saveUserRunFavorite(args) {
  request(args, ['runId'], ['name']);
  const suppliedName = args.name === undefined ? null : boundedText(args.name, 120);
  return locked(args.workspace, async w => {
    const { summary } = await loadRun(w, args.runId), a = summary.source.association;
    if (!a || summary.source.observation?.status !== 'matched-record') fail('comparison-source-unavailable');
    const name = suppliedName ?? `Run ${args.runId.slice(0, 12)}`;
    const favoriteId = await record(w.workspace, 'favorite', { role: 'favorite', scopeId: w.scopeId,
      name, snapshotId: a.snapshotId, normalId: a.normalId, preparedMode: a.preparedMode, revision: a.revision, comparisonRunId: args.runId });
    return { favoriteId, name, preparedMode: a.preparedMode, comparisonRunId: args.runId, verification: { ...verification } };
  });
}
