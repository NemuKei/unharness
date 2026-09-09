// Immutable private record validation. Never use today's preparation to validate history.
import { isDeepStrictEqual } from 'node:util';
import { loadRecord, loadSnapshot, loadNormal, scopeWorkspace } from '../sources/records.mjs';
import { preparationMetadata, projectObservation, validUtc } from '../sources/observation-record.mjs';
import { verification, fail } from '../sources/errors.mjs';
import { validateMeasurement } from './measurement.mjs';
import { exactKeys, boundedText, validateAssessment, deriveAcceptance } from './assessment.mjs';
export const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
export const SOURCE_ISSUES = Object.freeze(['source-conflict', 'recovery-required', 'preparation-boundary-unavailable', 'preparation-metadata-invalid', 'source-observation-unavailable', 'source-preparation-required']);
export function freezeSourceContext(w) {
  return { snapshotId: w.state.snapshotId, normalId: w.state.normalId ?? w.reg.normalId,
    revision: w.state.revision, preparedMode: w.state.preparedMode,
    preparation: preparationMetadata(w.state).preparation };
}
function validateContext(context) {
  exactKeys(context, ['snapshotId', 'normalId', 'revision', 'preparedMode', 'preparation']);
  if (!hash(context.snapshotId) || !hash(context.normalId) || !Number.isSafeInteger(context.revision) || context.revision < 0 || !['normal', 'unseal', 'trueform'].includes(context.preparedMode)) fail('comparison-record-invalid');
  if (context.preparation !== null && preparationMetadata({ preparation: context.preparation }).issue) fail('comparison-record-invalid');
  return structuredClone(context);
}
export function associationFor(w, context) {
  return { scopeId: w.scopeId, snapshotId: context.snapshotId, normalId: context.normalId,
    revision: context.revision, preparationId: context.preparation?.id ?? null,
    preparedMode: context.preparedMode, coverage: 'initial-turn-only' };
}
export async function loadReview(w, reviewId) {
  try {
    if (!hash(reviewId)) fail('comparison-record-invalid');
    const p = await loadRecord(w.workspace, 'application', reviewId);
    w = scopeWorkspace(w, p.scopeId);
    exactKeys(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'capturedAt', 'collectedOn', 'measurement', 'outputText', 'source', 'sourceContext']);
    if (p.role !== 'run-review' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !validUtc(p.capturedAt)) fail('comparison-record-invalid');
    exactKeys(p.collectedOn, ['platform', 'kernelRelease', 'architecture', 'nodeVersion']);
    const collectedOn = Object.fromEntries(Object.entries(p.collectedOn).map(([key, value]) => [key, boundedText(value, 160, false, 'comparison-record-invalid')]));
    const measurement = validateMeasurement(p.measurement), context = validateContext(p.sourceContext);
    if (measurement.output.available ? typeof p.outputText !== 'string' || Buffer.byteLength(p.outputText) !== measurement.output.bytes || Buffer.byteLength(p.outputText) > 65536 : p.outputText !== null) fail('comparison-record-invalid');
    await loadSnapshot(w.workspace, w.reg, context.snapshotId);
    await loadNormal(w.workspace, w.reg, context.normalId);
    exactKeys(p.source, ['association', 'observationId', 'issue']);
    if (p.source.issue !== null && !SOURCE_ISSUES.includes(p.source.issue)) fail('comparison-record-invalid');
    let observation = null;
    if (p.source.observationId !== null) {
      if (!hash(p.source.observationId)) fail('comparison-record-invalid');
      const historical = { ...w, state: { ...context, ...(context.preparation === null ? { preparation: undefined } : {}) } };
      observation = projectObservation(await loadRecord(w.workspace, 'observation', p.source.observationId), p.source.observationId, historical);
      if (observation.taskId !== measurement.taskId || observation.observedAt !== p.capturedAt || p.source.issue !== null) fail('comparison-record-invalid');
    }
    const expected = observation?.status === 'matched-record' ? associationFor(w, context) : null;
    if (!isDeepStrictEqual(p.source.association, expected)) fail('comparison-record-invalid');
    if (expected && (measurement.createdAt === null || Date.parse(measurement.createdAt) < Date.parse(context.preparation.preparedAt) || Date.parse(measurement.createdAt) > Date.parse(p.capturedAt))) fail('comparison-record-invalid');
    if (!observation && p.source.issue === null) fail('comparison-record-invalid');
    return { reviewId, scopeId: p.scopeId, capturedAt: p.capturedAt, collectedOn, measurement,
      source: { association: expected, observation, issue: p.source.issue }, sourceContext: context, outputText: p.outputText };
  } catch { fail('comparison-record-invalid'); }
}
export function reviewSummary(review) {
  return { reviewId: review.reviewId, scopeId: review.scopeId, capturedAt: review.capturedAt,
    collectedOn: review.collectedOn, measurementKind: 'observational', measurement: review.measurement,
    source: review.source, verification: { ...verification } };
}
async function runPayload(w, runId) {
  if (!hash(runId)) fail('comparison-record-invalid');
  const p = await loadRecord(w.workspace, 'observation', runId);
  exactKeys(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'reviewId', 'title', 'assessment', 'previousRunId']);
  scopeWorkspace(w, p.scopeId);
  if (p.role !== 'comparison-run' || p.schemaVersion !== 1 || !hash(p.reviewId) || (p.previousRunId !== null && !hash(p.previousRunId))) fail('comparison-record-invalid');
  if (p.title !== null) boundedText(p.title, 120, false, 'comparison-record-invalid');
  return { ...p, assessment: validateAssessment(p.assessment, 'comparison-record-invalid') };
}
export async function loadRun(w, runId) {
  try {
    const p = await runPayload(w, runId), review = await loadReview(w, p.reviewId);
    if (p.scopeId !== review.scopeId) fail('comparison-record-invalid');
    let previousId = p.previousRunId;
    const visited = new Set([runId]);
    while (previousId !== null) {
      if (visited.has(previousId) || visited.size >= 1000) fail('comparison-record-invalid');
      visited.add(previousId);
      const previous = await runPayload(w, previousId);
      if (previous.reviewId !== p.reviewId || previous.scopeId !== p.scopeId) fail('comparison-record-invalid');
      previousId = previous.previousRunId;
    }
    return { payload: p, review, summary: { ...reviewSummary(review), runId, title: p.title,
      previousRunId: p.previousRunId, assessment: p.assessment, acceptance: deriveAcceptance(p.assessment) } };
  } catch { fail('comparison-record-invalid'); }
}
