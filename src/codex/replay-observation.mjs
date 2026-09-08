import { isDeepStrictEqual } from 'node:util';
import { parseSkillCatalog } from '../sources/observation.mjs';
import { validUtc } from '../sources/observation-record.mjs';
import { projectCodexRun } from './run-metrics.mjs';
import { projectReplayRequest } from './replay-request.mjs';
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const normalize = text => text.replaceAll('\r\n', '\n').trim();

function initial(records) {
  let state = null, context = null, worldSeen = false, conflict = false;
  for (const r of records) {
    const p = r?.payload;
    if (!object(p)) continue;
    if (r.type === 'world_state' && p.full === true) {
      if (!worldSeen) { worldSeen = true; state = object(p.state) ? p.state : null; }
      else if (!isDeepStrictEqual(state, p.state)) conflict = true;
    }
    if (r.type === 'turn_context') { if (context === null) context = p; }
    if (r.type === 'response_item' && !(p.type === 'message' && ['developer', 'system', 'user'].includes(p.role))) break;
    if (r.type === 'event_msg' && (['agent_message', 'agent_reasoning', 'exec_command_begin', 'task_complete'].includes(p.type)
      || p.type === 'item_completed' && !['UserMessage', 'FunctionCallOutput'].includes(p.item?.type))) break;
  }
  return { state: conflict ? null : state, context };
}
function sourcesFor(expected, state) {
  const catalog = parseSkillCatalog(state?.host_skills);
  return expected.map(s => {
    let status = 'unknown';
    if (s.category === 'instructions' && typeof state?.agents_md?.text === 'string') {
      const text = normalize(state.agents_md.text), prefix = normalize(s.text);
      status = text === prefix || text.startsWith(prefix + '\n\n--- project-doc ---\n\n') ? 'matched' : 'not-matched';
    } else if (s.category === 'skill' && catalog !== null) {
      const related = catalog.filter(e => e.name === s.name || e.path === s.path);
      if (!related.some(e => e.name !== s.name || e.path !== s.path))
        status = (related.length === 1) === (s.expected === 'automatic-catalog') ? 'matched' : 'not-matched';
    }
    return { sourceId: s.sourceId, category: s.category, expected: s.expected, status };
  });
}
function runtimeFor(config, context) {
  const checks = [];
  for (const [field, key] of [['model', 'model'], ['reasoningEffort', 'model_reasoning_effort']]) {
    const expected = config[key], value = context?.[field === 'model' ? 'model' : 'effort'];
    checks.push({ field, status: expected == null ? 'not-configured'
      : typeof expected !== 'string' || typeof value !== 'string' ? 'unknown' : value === expected ? 'matched' : 'not-matched' });
  }
  for (const [field, expected, value, allowed] of [
    ['approvalPolicy', config.approval_policy, context?.approval_policy, ['never', 'on-request', 'untrusted']],
    ['sandboxMode', config.sandbox_mode, context?.sandbox_policy?.type, ['read-only', 'workspace-write', 'danger-full-access', 'external-sandbox']],
  ]) checks.push({ field, status: !allowed.includes(expected) || !allowed.includes(value) ? 'unknown' : expected === value ? 'matched' : 'not-matched' });
  if (config.approvals_reviewer != null) checks.push({ field: 'approvalsReviewer', status:
    typeof context?.approvals_reviewer !== 'string' ? 'unknown' : config.approvals_reviewer === context.approvals_reviewer ? 'matched' : 'not-matched' });
  // Named/custom permission profiles need their own native mapping. A sandbox
  // type match alone cannot qualify an unimplemented permission configuration.
  if (config.permissions != null || config.sandbox_mode === 'workspace-write') checks.push({ field: 'permissionDetails', status: 'unknown' });
  return { status: checks.some(c => c.status === 'not-matched') ? 'not-matched'
    : checks.some(c => c.status === 'unknown') ? 'unknown' : 'matched', checks,
    permissionDetails: 'recorded-only', memoryInputs: 'unknown', toolState: 'unknown' };
}
function nativeSourceChange(records) {
  const fields = ['agents_md', 'host_skills', 'permissions', 'managed_developer_instructions', 'skills', 'orchestrator_skills', 'model'];
  let baseline = null;
  for (const r of records) {
    if (r?.type !== 'world_state') continue;
    const p = r.payload;
    if (!object(p) || typeof p.full !== 'boolean' || !object(p.state)) return 'unknown';
    if (baseline === null) { if (!p.full) return 'unknown'; baseline = p.state; continue; }
    for (const key of fields) if ((p.full || Object.hasOwn(p.state, key)) && !isDeepStrictEqual(p.state[key], baseline[key])) return 'changed';
  }
  return null;
}
// Caller is the registered replay service. It derives every binding below from
// validated private attempt records; no ordinary-observer project override.
export function projectReplayTask(records, binding) {
  const { taskId, project, readyAt, observedAt, request, expectedSources, nativeConfig, instructions, recordRead } = binding;
  const input = projectReplayRequest(records, { taskId, request });
  const { state, context } = initial(records), sources = sourcesFor(expectedSources, state);
  const runtime = runtimeFor(nativeConfig, context);
  let measurement = null, outputText = null;
  const reasons = [], add = reason => { if (!reasons.includes(reason)) reasons.push(reason); };
  let unqualified = false, unknown = false, mismatch = false;
  try {
    let run = projectCodexRun(records, { taskId, expectedProject: project, recordRead });
    const last = run.measurement.availableTurns.at(-1);
    if (last && run.measurement.throughTurnId !== last.turnId)
      run = projectCodexRun(records, { taskId, expectedProject: project, recordRead, throughTurnId: last.turnId });
    ({ measurement, outputText } = run);
  } catch (e) { add(e.kind === 'comparison-run-task-mismatch' ? 'task-identity-mismatch' : 'task-project-or-timeline-mismatch'); unqualified = true; }
  if (!measurement || !measurement.availableTurns.length) { add('task-timeline-unavailable'); unknown = true; }
  else {
    if (measurement.runtimeVersion !== '0.153.4') { add('unsupported-recording'); unknown = true; }
    if (!validUtc(readyAt) || !validUtc(observedAt) || !validUtc(measurement.createdAt)) { add('task-boundary-unavailable'); unknown = true; }
    else if (Date.parse(measurement.createdAt) < Date.parse(readyAt) || Date.parse(measurement.createdAt) > Date.parse(observedAt)) {
      add('task-outside-readiness-boundary'); unqualified = true;
    }
    if (measurement.availableTurns.some(t => !t.completed)) { add('task-incomplete'); unqualified = true; }
    if (measurement.availableTurns.some(t => !validUtc(t.startedAt) || !validUtc(t.completedAt)
      || Date.parse(t.startedAt) < Date.parse(measurement.createdAt) || Date.parse(t.completedAt) < Date.parse(t.startedAt)
      || Date.parse(t.completedAt) > Date.parse(observedAt))) { add('task-time-unavailable'); unknown = true; }
    if (measurement.conditions.unknown.length) { add('runtime-condition-unavailable'); unknown = true; }
    if (measurement.conditions.changes.length) { add('runtime-condition-changed'); mismatch = true; }
    if (measurement.issues.includes('terminal-conflict')) { add('task-terminal-conflict'); unknown = true; }
  }
  if (recordRead.incompleteTrailingLine) { add('incomplete-record-read'); unknown = true; }
  if (input.status === 'unknown') { add(input.reason); unknown = true; }
  if (input.status === 'not-matched') { add('request-mismatch'); mismatch = true; }
  if (!state || state.agents_md?.directory !== project || typeof state.agents_md.text !== 'string' || typeof instructions !== 'string') {
    add('project-instructions-unavailable'); unknown = true;
  } else if (normalize(state.agents_md.text) !== normalize(instructions)) { add('project-instructions-mismatch'); mismatch = true; }
  if (sources.some(s => s.status === 'unknown')) { add('selected-source-unavailable'); unknown = true; }
  if (sources.some(s => s.status === 'not-matched')) { add('selected-source-mismatch'); mismatch = true; }
  if (runtime.status === 'unknown') { add('retained-runtime-unavailable'); unknown = true; }
  if (runtime.status === 'not-matched') { add('retained-runtime-mismatch'); mismatch = true; }
  const laterSources = nativeSourceChange(records);
  if (laterSources === 'changed') { add('native-source-changed'); mismatch = true; }
  if (laterSources === 'unknown') { add('native-source-change-unavailable'); unknown = true; }
  return { measurement, outputText, qualification: {
    parserVersion: 'codex-desktop-replay-0.153.4/v1', status: unqualified ? 'unqualified-record' : mismatch ? 'not-matched-record' : unknown ? 'unknown-record' : 'matched-record',
    reasons, request: input, sources, runtime,
    startingFilesAtTaskStart: 'not-recorded', startingFilesAtHandoff: 'verified',
    completeIsolationVerified: false,
  } };
}
