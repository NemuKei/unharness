import { loadRecord } from '../sources/records.mjs';
import { validUuid, validUtc } from '../sources/observation-record.mjs';
import { fail, USER_SOURCE_ERROR_KINDS } from '../sources/errors.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { validateMeasurement } from '../comparisons/measurement.mjs';
import { hash } from './start-records.mjs';
import { loadReplayAttempt } from './replay-records.mjs';
import { readStartingManifest } from './records.mjs';
import { digestBytes } from './files.mjs';
import { assessReplay, replayBudget, replayAcceptance } from './replay-assessment.mjs';
const invalid = () => fail('replay-record-invalid');
const shape = (x, keys, optional = []) => exactKeys(x, keys, optional, 'replay-record-invalid');
const statuses = ['matched', 'not-matched', 'unknown'];
const reasons = new Set(['task-identity-mismatch', 'task-project-or-timeline-mismatch', 'task-timeline-unavailable',
  'unsupported-recording', 'task-boundary-unavailable', 'task-outside-readiness-boundary', 'task-incomplete',
  'task-time-unavailable', 'runtime-condition-unavailable', 'runtime-condition-changed', 'task-terminal-conflict',
  'incomplete-record-read', 'request-route-unavailable', 'request-evidence-unavailable', 'request-evidence-conflict',
  'request-envelope-unavailable', 'request-mismatch', 'project-instructions-unavailable', 'project-instructions-mismatch',
  'selected-source-unavailable', 'selected-source-mismatch', 'retained-runtime-unavailable', 'retained-runtime-mismatch',
  'native-source-changed', 'native-source-change-unavailable', 'task-record-changed-during-collection']);
function qualification(q, attempt, measurement) {
  shape(q, ['parserVersion', 'status', 'reasons', 'request', 'sources', 'runtime', 'startingFilesAtTaskStart', 'startingFilesAtHandoff', 'completeIsolationVerified']);
  if (q.parserVersion !== 'codex-desktop-replay-0.153.4/v1' || !['matched-record', 'not-matched-record', 'unknown-record', 'unqualified-record'].includes(q.status)
    || !Array.isArray(q.reasons) || q.reasons.length > reasons.size || new Set(q.reasons).size !== q.reasons.length || q.reasons.some(r => !reasons.has(r))
    || q.startingFilesAtTaskStart !== 'not-recorded' || q.startingFilesAtHandoff !== 'verified' || q.completeIsolationVerified !== false) invalid();
  shape(q.request, ['status', 'reason', 'route', 'bytes', 'digest']);
  if (!statuses.includes(q.request.status) || ![null, 'user-created', 'agent-created'].includes(q.request.route)
    || !(q.request.reason === null || reasons.has(q.request.reason))
    || !(q.request.bytes === null || Number.isInteger(q.request.bytes) && q.request.bytes >= 0 && q.request.bytes <= 65536)
    || !(q.request.digest === null || hash(q.request.digest))) invalid();
  if (q.request.status === 'matched' && (q.request.reason !== null || q.request.route === null
    || q.request.bytes !== Buffer.byteLength(attempt.review.saved.review.declaration.request)
    || q.request.digest !== digestBytes(Buffer.from(attempt.review.saved.review.declaration.request)))) invalid();
  const expected = attempt.review.variant.expectedSources;
  if (!Array.isArray(q.sources) || q.sources.length !== expected.length) invalid();
  for (const [i, s] of q.sources.entries()) {
    shape(s, ['sourceId', 'category', 'expected', 'status']);
    if (s.sourceId !== expected[i].sourceId || s.category !== expected[i].category || s.expected !== expected[i].expected || !statuses.includes(s.status)) invalid();
  }
  shape(q.runtime, ['status', 'checks', 'permissionDetails', 'memoryInputs', 'toolState']);
  if (!statuses.includes(q.runtime.status) || q.runtime.permissionDetails !== 'recorded-only' || q.runtime.memoryInputs !== 'unknown' || q.runtime.toolState !== 'unknown'
    || !Array.isArray(q.runtime.checks) || q.runtime.checks.length < 4 || q.runtime.checks.length > 6) invalid();
  const fields = ['model', 'reasoningEffort', 'approvalPolicy', 'sandboxMode', 'approvalsReviewer', 'permissionDetails'];
  for (const [i, check] of q.runtime.checks.entries()) {
    shape(check, ['field', 'status']);
    if (!fields.includes(check.field) || i < 4 && check.field !== fields[i]
      || ![...statuses, 'not-configured'].includes(check.status) || i >= 2 && check.status === 'not-configured') invalid();
  }
  if (new Set(q.runtime.checks.map(c => c.field)).size !== q.runtime.checks.length) invalid();
  const runtimeStatus = q.runtime.checks.some(c => c.status === 'not-matched') ? 'not-matched'
    : q.runtime.checks.some(c => c.status === 'unknown') ? 'unknown' : 'matched';
  if (runtimeStatus !== q.runtime.status) invalid();
  if (q.status === 'matched-record' && (q.reasons.length || q.request.status !== 'matched' || q.sources.some(s => s.status !== 'matched')
    || q.runtime.status !== 'matched' || !measurement?.selectedTurnIds.length || measurement.selectedTurnIds.length !== measurement.availableTurns.length
    || measurement.availableTurns.some(t => !t.completed) || measurement.conditions.unknown.length || measurement.conditions.changes.length)) invalid();
  if (q.status !== 'matched-record' && !q.reasons.length) invalid();
}
export async function loadReplayResultReview(w, resultReviewId) {
  try {
    const p = await loadRecord(w.workspace, 'application', resultReviewId);
    shape(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'attemptId', 'attemptStateId', 'taskId', 'capturedAt', 'recordRead', 'recordingDigest',
      'readIssue', 'sourceIssue', 'measurement', 'outputText', 'qualification', 'files']);
    if (p.role !== 'replay-result-review' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !hash(p.attemptId) || !hash(p.attemptStateId)
      || !validUuid(p.taskId) || !validUtc(p.capturedAt) || !(p.recordingDigest === null || hash(p.recordingDigest))
      || ![null, 'replay-task-record-unavailable', 'replay-task-record-invalid', 'replay-task-record-changed'].includes(p.readIssue)
      || !(p.sourceIssue === null || USER_SOURCE_ERROR_KINDS.includes(p.sourceIssue))) invalid();
    shape(p.recordRead, ['incompleteTrailingLine', 'snapshotBytes']);
    if (typeof p.recordRead.incompleteTrailingLine !== 'boolean' || !Number.isSafeInteger(p.recordRead.snapshotBytes) || p.recordRead.snapshotBytes < 0) invalid();
    const attempt = await loadReplayAttempt(w, { attemptId: p.attemptId, stateId: p.attemptStateId });
    if (!['ready', 'cancelled'].includes(attempt.phase) || !attempt.readyAt || Date.parse(p.capturedAt) < Date.parse(attempt.readyAt)) invalid();
    const measurement = p.measurement === null ? null : validateMeasurement(p.measurement);
    if (measurement && measurement.taskId !== p.taskId
      || ['replay-task-record-unavailable', 'replay-task-record-invalid'].includes(p.readIssue) && (measurement !== null || p.recordingDigest !== null)) invalid();
    if (p.outputText !== null && (typeof p.outputText !== 'string' || Buffer.byteLength(p.outputText) > 65536
      || measurement?.output.available !== true || measurement.output.bytes !== Buffer.byteLength(p.outputText))) invalid();
    if (measurement?.output.available === true && p.outputText === null) invalid();
    qualification(p.qualification, attempt, measurement);
    if (p.readIssue === 'replay-task-record-changed' && (p.qualification.status === 'matched-record'
      || !p.qualification.reasons.includes('task-record-changed-during-collection') || !hash(p.recordingDigest))) invalid();
    shape(p.files, ['manifestId', 'capturedAt', 'ignoredFiles', 'issue']);
    let files;
    if (p.files.issue === null) {
      if (!hash(p.files.manifestId) || !validUtc(p.files.capturedAt) || Date.parse(p.files.capturedAt) > Date.parse(p.capturedAt)
        || !['excluded', 'not-applicable'].includes(p.files.ignoredFiles)) invalid();
      const manifest = await readStartingManifest({ store: w.workspace, manifestId: p.files.manifestId });
      files = { ...p.files, fileCount: manifest.files.filter(f => f.present).length, totalBytes: manifest.totalBytes,
        selection: 'working-files-at-collection', gitMetadata: 'excluded' };
    } else {
      if (p.files.issue !== 'replay-outcome-files-unavailable' || p.files.manifestId !== null || p.files.capturedAt !== null || p.files.ignoredFiles !== 'unknown') invalid();
      files = { ...p.files, fileCount: null, totalBytes: null, selection: 'working-files-at-collection', gitMetadata: 'excluded' };
    }
    const budget = replayBudget(attempt.review.saved.review.declaration, measurement);
    return { ...p, resultReviewId, attempt, measurement, budget, files };
  } catch { invalid(); }
}
export function replayResultReviewSummary(review) {
  return { resultReviewId: review.resultReviewId, attemptId: review.attemptId, taskId: review.taskId,
    capturedAt: review.capturedAt, preparedMode: review.attempt.review.sourceBinding.preparedMode,
    startId: review.attempt.review.startId, scopeId: review.scopeId, readIssue: review.readIssue, sourceIssue: review.sourceIssue,
    measurement: review.measurement, outputText: review.outputText, qualification: review.qualification, files: review.files, budget: review.budget,
    criteria: review.attempt.review.saved.review.declaration, assessment: 'neutral', creationEligible: false };
}
export async function loadReplayResult(w, resultId) {
  try {
    const p = await loadRecord(w.workspace, 'application', resultId);
    shape(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'attemptId', 'resultReviewId', 'assessment', 'previousResultId']);
    if (p.role !== 'replay-result' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !hash(p.attemptId)
      || !hash(p.resultReviewId) || !(p.previousResultId === null || hash(p.previousResultId))) invalid();
    const review = await loadReplayResultReview(w, p.resultReviewId);
    if (review.attemptId !== p.attemptId) invalid();
    const assessment = assessReplay(p.assessment, review.attempt.review.saved.review.declaration);
    const seen = new Set([resultId]); let previousId = p.previousResultId;
    while (previousId !== null) {
      if (seen.has(previousId) || seen.size >= 128) invalid(); seen.add(previousId);
      const previous = await loadRecord(w.workspace, 'application', previousId);
      if (previous.role !== 'replay-result' || previous.schemaVersion !== 1 || previous.scopeId !== w.scopeId || previous.attemptId !== p.attemptId
        || previous.resultReviewId !== p.resultReviewId || !(previous.previousResultId === null || hash(previous.previousResultId))) invalid();
      previousId = previous.previousResultId;
    }
    return { payload: p, review, summary: { ...replayResultReviewSummary(review), resultId, previousResultId: p.previousResultId,
      assessment, acceptance: replayAcceptance(assessment, review) } };
  } catch { invalid(); }
}
