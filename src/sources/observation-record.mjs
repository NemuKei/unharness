// Pure persisted-observation validation. Status/recovery must not load native or YAML code.
import { verification } from './errors.mjs';
export const OBSERVATION_REASONS = Object.freeze([
  'preparation-boundary-unavailable', 'preparation-metadata-invalid',
  'task-record-unavailable', 'task-record-invalid', 'task-identity-mismatch',
  'task-origin-unqualified', 'task-route-unqualified', 'task-forked',
  'task-project-mismatch', 'task-before-preparation', 'task-start-in-future',
  'task-incomplete', 'unsupported-codex-version', 'initial-world-state-unavailable',
  'instruction-field-unavailable', 'instruction-prefix-mismatch',
  'skill-catalog-unavailable', 'skill-state-unavailable', 'skill-catalog-mismatch',
]);
// Claude Code records a different startup surface, so its projection uses a
// separate schema version. Codex observations keep schemaVersion 1 and the
// exact reason vocabulary they were written with; nothing here migrates them.
export const CLAUDE_OBSERVATION_REASONS = Object.freeze([
  'preparation-boundary-unavailable', 'preparation-metadata-invalid',
  'task-record-unavailable', 'task-record-invalid', 'task-identity-mismatch',
  'task-origin-unqualified', 'task-route-unqualified', 'task-forked',
  'task-project-mismatch', 'task-before-preparation', 'task-start-in-future',
  'task-incomplete', 'unsupported-claude-version', 'session-header-unavailable',
  'instruction-field-unavailable', 'instruction-prefix-mismatch',
  'skill-catalog-unavailable', 'skill-state-unavailable', 'skill-catalog-mismatch',
]);
// Only a runtime whose recorded startup grammar has been checked can support a
// matched claim. A newer build stays observable but reports unknown.
export const QUALIFIED_CLAUDE_VERSIONS = Object.freeze(['2.1.260']);
const CLAUDE_EFFORTS = [null, 'low', 'medium', 'high', 'xhigh', 'max'];

const hash = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const validUtc = v => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().replace('.000Z', 'Z') === v.replace('.000Z', 'Z');
export const validUuid = v => typeof v === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(v);
export function preparationMetadata(state) {
  if (state.preparation === undefined) return { preparation: null, issue: 'preparation-boundary-unavailable' };
  const p = state.preparation;
  if (!object(p) ||
      Object.keys(p).sort().join(',') !== 'id,preparedAt' ||
      typeof p.id !== 'string' ||
      !/^[0-9a-f]{32}$/.test(p.id) ||
      !validUtc(p.preparedAt))
    return { preparation: null, issue: 'preparation-metadata-invalid' };
  return { preparation: { id: p.id, preparedAt: p.preparedAt }, issue: null };
}
export const conditionId = v => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,127}$/.test(v) ? v : null;
export function projectObservation(p, observationId, w) {
  if (p?.schemaVersion === 2) return projectClaudeObservation(p, observationId, w);
  const boundary = preparationMetadata(w.state);
  const ids = new Map([...(w.reg.instructions ? [[w.reg.instructions.id, 'instructions']] : []), ...w.reg.skills.map(s => [s.id, 'skill'])]);
  const reject = () => { throw Error('observation-invalid'); };
  if (!object(p) ||
      p.kind !== 'unharness-user-source' ||
      p.role !== 'task-observation' ||
      p.schemaVersion !== 1 ||
      !hash(observationId) ||
      !validUuid(p.taskId) ||
      p.taskId !== p.taskId.toLowerCase() ||
      p.scopeId !== w.scopeId ||
      p.snapshotId !== w.state.snapshotId ||
      p.preparationId !== (boundary.preparation?.id ?? null) ||
      p.preparedMode !== w.state.preparedMode ||
      !validUtc(p.observedAt) ||
      !['normal', 'unseal', 'trueform'].includes(p.preparedMode) ||
      !['matched-record', 'not-matched-record', 'unqualified-record', 'unknown-record'].includes(p.status) ||
      !Array.isArray(p.reasons) ||
      p.reasons.length > OBSERVATION_REASONS.length ||
      new Set(p.reasons).size !== p.reasons.length ||
      p.reasons.some(r => !OBSERVATION_REASONS.includes(r))) reject();
  if (!Array.isArray(p.sources) ||
      p.sources.length !== ids.size ||
      new Set(p.sources.map(s => s?.sourceId)).size !== ids.size) reject();
  const sources = p.sources.map(s => {
    if (!object(s) || !ids.has(s.sourceId) || ids.get(s.sourceId) !== s.category ||
      !['saved-instructions', 'minimal-guide', 'inert-instructions', 'automatic-catalog', 'manual-only', 'disabled', 'unknown'].includes(s.expected) ||
      !['matching-prefix', 'different-prefix', 'present', 'absent', 'unknown'].includes(s.recorded) ||
      !['matched', 'not-matched', 'unknown'].includes(s.status)) reject();
    const instruction = s.category === 'instructions';
    if (!(instruction ? ['saved-instructions', 'minimal-guide', 'inert-instructions', 'unknown'] : ['automatic-catalog', 'manual-only', 'disabled', 'unknown']).includes(s.expected) ||
      !(instruction ? ['matching-prefix', 'different-prefix', 'unknown'] : ['present', 'absent', 'unknown']).includes(s.recorded)) reject();
    const expectedStatus = s.expected === 'unknown' ||
      s.recorded === 'unknown' ? 'unknown'
      : (instruction ? s.recorded === 'matching-prefix' : (s.recorded === 'present') === (s.expected === 'automatic-catalog')) ? 'matched' : 'not-matched';
    if (s.status !== expectedStatus) reject();
    return { sourceId: s.sourceId, category: s.category, expected: s.expected, recorded: s.recorded, status: s.status };
  });
  const c = p.conditions;
  if (!object(c) ||
      (c.codexVersion !== null && !/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(c.codexVersion)) ||
      (c.model !== null && conditionId(c.model) !== c.model) ||
      ![null, 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(c.reasoningEffort) ||
      ![c.executionPolicyDigest, c.projectInstructionsDigest].every(v => v === null || hash(v)) ||
      typeof c.memoryGuidanceRecorded !== 'boolean') reject();
  if (!object(p.verification) ||
      Object.entries(verification).some(([k, v]) => p.verification[k] !== v)) reject();
  if (p.status === 'matched-record' && (!boundary.preparation ||
      c.codexVersion !== '0.153.4' ||
      p.reasons.length || sources.some(s => s.status !== 'matched'))) reject();
  return {
    observationId, taskId: p.taskId, scopeId: p.scopeId,
    snapshotId: p.snapshotId, preparationId: p.preparationId,
    preparedMode: p.preparedMode, observedAt: p.observedAt,
    status: p.status, reasons: [...p.reasons], sources,
    conditions: {
      codexVersion: c.codexVersion, model: c.model,
      reasoningEffort: c.reasoningEffort,
      executionPolicyDigest: c.executionPolicyDigest,
      projectInstructionsDigest: c.projectInstructionsDigest,
      memoryGuidanceRecorded: c.memoryGuidanceRecorded,
    },
    verification: { ...verification },
  };
}
function projectClaudeObservation(p, observationId, w) {
  const boundary = preparationMetadata(w.state);
  const ids = new Map([...(w.reg.instructions ? [[w.reg.instructions.id, 'instructions']] : []), ...w.reg.skills.map(s => [s.id, 'skill'])]);
  const reject = () => { throw Error('observation-invalid'); };
  if (!object(p) ||
      p.kind !== 'unharness-user-source' ||
      p.role !== 'task-observation' ||
      p.schemaVersion !== 2 ||
      p.application !== 'claude' ||
      !hash(observationId) ||
      !validUuid(p.taskId) ||
      p.taskId !== p.taskId.toLowerCase() ||
      p.scopeId !== w.scopeId ||
      p.snapshotId !== w.state.snapshotId ||
      p.preparationId !== (boundary.preparation?.id ?? null) ||
      p.preparedMode !== w.state.preparedMode ||
      !validUtc(p.observedAt) ||
      !['normal', 'unseal', 'trueform'].includes(p.preparedMode) ||
      !['matched-record', 'not-matched-record', 'unqualified-record', 'unknown-record'].includes(p.status) ||
      !Array.isArray(p.reasons) ||
      p.reasons.length > CLAUDE_OBSERVATION_REASONS.length ||
      new Set(p.reasons).size !== p.reasons.length ||
      p.reasons.some(r => !CLAUDE_OBSERVATION_REASONS.includes(r))) reject();
  if (!Array.isArray(p.sources) ||
      p.sources.length !== ids.size ||
      new Set(p.sources.map(s => s?.sourceId)).size !== ids.size) reject();
  const sources = p.sources.map(s => {
    if (!object(s) || !ids.has(s.sourceId) || ids.get(s.sourceId) !== s.category ||
      !['matched', 'not-matched', 'unknown'].includes(s.status)) reject();
    const instruction = s.category === 'instructions';
    if (!(instruction ? ['saved-instructions', 'minimal-guide', 'inert-instructions', 'unknown'] : ['automatic-catalog', 'manual-only', 'disabled', 'unknown']).includes(s.expected) ||
      !(instruction ? ['matching-prefix', 'different-prefix', 'absent', 'unknown'] : ['present', 'absent', 'unknown']).includes(s.recorded)) reject();
    // An absent user-scope instruction file and an inert one are the same
    // observable outcome: no selected global instruction text in context.
    const expectedStatus = s.expected === 'unknown' || s.recorded === 'unknown' ? 'unknown'
      : instruction
        ? (s.recorded === 'matching-prefix' || (s.recorded === 'absent' && s.expected === 'inert-instructions')) ? 'matched' : 'not-matched'
        : (s.recorded === 'present') === (s.expected === 'automatic-catalog') ? 'matched' : 'not-matched';
    if (s.status !== expectedStatus) reject();
    return { sourceId: s.sourceId, category: s.category, expected: s.expected, recorded: s.recorded, status: s.status };
  });
  const c = p.conditions;
  const versionValue = v => v === null || (typeof v === 'string' && /^\d{1,8}(\.\d{1,8}){1,3}$/.test(v));
  if (!object(c) ||
      !versionValue(c.runtimeVersion) ||
      !versionValue(c.desktopVersion) ||
      (c.model !== null && conditionId(c.model) !== c.model) ||
      !CLAUDE_EFFORTS.includes(c.reasoningEffort) ||
      ![c.executionPolicyDigest, c.projectInstructionsDigest].every(v => v === null || hash(v)) ||
      typeof c.memoryGuidanceRecorded !== 'boolean') reject();
  if (!object(p.verification) ||
      Object.entries(verification).some(([k, v]) => p.verification[k] !== v)) reject();
  if (p.status === 'matched-record' && (!boundary.preparation ||
      !QUALIFIED_CLAUDE_VERSIONS.includes(c.runtimeVersion) ||
      p.reasons.length || sources.some(s => s.status !== 'matched'))) reject();
  return {
    observationId, taskId: p.taskId, scopeId: p.scopeId, application: 'claude',
    snapshotId: p.snapshotId, preparationId: p.preparationId,
    preparedMode: p.preparedMode, observedAt: p.observedAt,
    status: p.status, reasons: [...p.reasons], sources,
    conditions: {
      runtimeVersion: c.runtimeVersion, desktopVersion: c.desktopVersion,
      model: c.model, reasoningEffort: c.reasoningEffort,
      executionPolicyDigest: c.executionPolicyDigest,
      projectInstructionsDigest: c.projectInstructionsDigest,
      memoryGuidanceRecorded: c.memoryGuidanceRecorded,
    },
    verification: { ...verification },
  };
}

export async function currentObservation(w, loadRecord, { conflict, pending }) {
  const boundary = preparationMetadata(w.state);
  const result = { preparation: boundary.preparation, observation: null, observationIssue: boundary.issue };
  if (w.state.scopePreparationRequired) return { ...result, observationIssue: 'source-preparation-required' };
  const id = w.state.lastObservationId;
  if (id === undefined || id === null) return result;
  if (!hash(id)) return { ...result, observationIssue: 'observation-pointer-invalid' };
  if (boundary.issue === 'preparation-metadata-invalid') return result;
  if (conflict || pending) return { ...result, observationIssue: pending ? 'recovery-required' : 'source-conflict' };
  try {
    result.observation = projectObservation(await loadRecord(w.workspace, 'observation', id), id, w);
  } catch { result.observationIssue = 'observation-record-invalid'; }
  return result;
}
