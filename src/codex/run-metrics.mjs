import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { posix, win32 } from 'node:path';

import {
  MEASUREMENT_REASONS,
  USAGE_FIELDS,
  sumCounters,
  validateMeasurement,
} from '../comparisons/measurement.mjs';

export const RUN_METRIC_ERROR_KINDS = Object.freeze([
  'comparison-run-input-invalid',
  'comparison-run-task-mismatch',
  'comparison-run-project-mismatch',
  'comparison-run-cutoff-invalid',
]);

export const RUN_METRIC_REASONS = MEASUREMENT_REASONS;

const PARSER_VERSION = 'codex-desktop-0.153.4/v1';
const SUPPORTED_RUNTIME = '0.153.4';
const MAX_TURNS = 200;
const MAX_OUTPUT_BYTES = 64 * 1024;
const POLICY_FIELDS = Object.freeze([
  'approval_policy', 'approvals_reviewer', 'sandbox_policy',
  'permission_profile', 'active_permission_profile',
]);
const CONDITION_FIELDS = Object.freeze(['model', 'reasoningEffort', 'executionPolicy']);
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const NATIVE_USAGE_FIELDS = Object.freeze({
  totalTokens: 'total_tokens',
  inputTokens: 'input_tokens',
  cachedInputTokens: 'cached_input_tokens',
  cacheWriteInputTokens: 'cache_write_input_tokens',
  outputTokens: 'output_tokens',
  reasoningOutputTokens: 'reasoning_output_tokens',
});

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validCounter = value => Number.isSafeInteger(value) && value >= 0;
const boundedId = value => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
const validUuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const validUtc = value => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const conditionId = value => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value) ? value : null;
const emptyTotals = () => Object.fromEntries(USAGE_FIELDS.map(field => [field, null]));

function fail(kind) {
  throw Object.assign(new Error(kind), { kind });
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function pathApi(path) {
  return /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? win32 : posix;
}

function absolutePath(path) {
  return typeof path === 'string' && path.length <= 4096 && !/[\0\r\n]/.test(path)
    && pathApi(path).isAbsolute(path) && pathApi(path).normalize(path) === path;
}

function samePath(left, right) {
  return absolutePath(left) && absolutePath(right)
    && pathApi(left) === pathApi(right)
    && pathApi(left).normalize(left) === pathApi(right).normalize(right);
}

function validateInput(records, options) {
  if (!Array.isArray(records) || !object(options)) fail('comparison-run-input-invalid');
  const keys = Object.keys(options);
  if (keys.some(key => !['taskId', 'expectedProject', 'throughTurnId', 'recordRead'].includes(key))
    || !validUuid(options.taskId)
    || !absolutePath(options.expectedProject)
    || !(options.throughTurnId === undefined || boundedId(options.throughTurnId))
    || !object(options.recordRead)
    || Object.keys(options.recordRead).sort().join(',') !== 'incompleteTrailingLine,snapshotBytes'
    || typeof options.recordRead.incompleteTrailingLine !== 'boolean'
    || !validCounter(options.recordRead.snapshotBytes)) fail('comparison-run-input-invalid');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

const APPROVAL_POLICIES = new Set(['untrusted', 'on-request', 'never']);
const APPROVAL_REVIEWERS = new Set(['user', 'auto_review', 'guardian_subagent']);
const SANDBOX_TYPES = new Set([
  'danger-full-access', 'read-only', 'external-sandbox', 'workspace-write',
]);

function exactObject(value, keys) {
  return object(value) && Object.keys(value).every(key => keys.includes(key));
}

function validSandboxPolicy(value) {
  if (!exactObject(value, [
    'type', 'network_access', 'exclude_slash_tmp', 'exclude_tmpdir_env_var', 'writable_roots',
  ]) || !SANDBOX_TYPES.has(value.type)) return false;
  if (value.type === 'danger-full-access') return Object.keys(value).length === 1;
  if (value.type === 'read-only') {
    return Object.keys(value).every(key => ['type', 'network_access'].includes(key))
      && (value.network_access === undefined || typeof value.network_access === 'boolean');
  }
  if (value.type === 'external-sandbox') {
    return Object.keys(value).every(key => ['type', 'network_access'].includes(key))
      && (value.network_access === undefined || ['restricted', 'enabled'].includes(value.network_access));
  }
  return (value.network_access === undefined || typeof value.network_access === 'boolean')
    && (value.exclude_slash_tmp === undefined || typeof value.exclude_slash_tmp === 'boolean')
    && (value.exclude_tmpdir_env_var === undefined || typeof value.exclude_tmpdir_env_var === 'boolean')
    && (value.writable_roots === undefined || (Array.isArray(value.writable_roots)
      && value.writable_roots.length <= 64 && value.writable_roots.every(absolutePath)));
}

function validPolicyValue(key, value) {
  if (key === 'approval_policy') return APPROVAL_POLICIES.has(value);
  if (key === 'approvals_reviewer') return APPROVAL_REVIEWERS.has(value);
  if (key === 'sandbox_policy') return validSandboxPolicy(value);
  if (key === 'permission_profile') {
    return exactObject(value, ['type']) && Object.keys(value).length === 1 && value.type === 'disabled';
  }
  return exactObject(value, ['id', 'extends'])
    && typeof value.id === 'string' && /^:[A-Za-z0-9][A-Za-z0-9._:/-]{0,126}$/.test(value.id)
    && (value.extends === undefined || value.extends === null || boundedId(value.extends));
}

function policyDigest(context) {
  if (!object(context)) return null;
  const entries = POLICY_FIELDS.filter(key => Object.hasOwn(context, key)).map(key => [key, context[key]]);
  if (!entries.length || entries.some(([key, value]) => !validPolicyValue(key, value))) return null;
  return createHash('sha256').update(JSON.stringify(canonical(Object.fromEntries(entries)))).digest('hex');
}

function recordedTimestamp(record) {
  return validUtc(record?.timestamp) ? record.timestamp : null;
}

function terminalProjection(record) {
  const payload = record.payload;
  return {
    completedAt: recordedTimestamp(record),
    durationMs: validCounter(payload.duration_ms) ? payload.duration_ms : null,
    firstResponseMs: validCounter(payload.time_to_first_token_ms) ? payload.time_to_first_token_ms : null,
    output: typeof payload.last_agent_message === 'string' ? payload.last_agent_message : null,
  };
}

function timeline(records) {
  const turns = [];
  const byId = new Map();
  let conflict = false;
  const ensure = turnId => {
    let turn = byId.get(turnId);
    if (!turn) {
      if (turns.length && turns.at(-1).terminal === null) conflict = true;
      turn = {
        turnId,
        startedAt: null,
        startSeen: false,
        starts: [],
        contextRecords: [],
        contexts: [],
        terminalRecord: null,
        terminal: null,
        terminalConflict: false,
      };
      byId.set(turnId, turn);
      turns.push(turn);
    }
    return turn;
  };
  for (const record of records) {
    const payload = record?.payload;
    const recognized = record?.type === 'turn_context'
      || (record?.type === 'event_msg' && ['task_started', 'task_complete'].includes(payload?.type));
    if (!recognized) continue;
    if (!object(payload) || !boundedId(payload.turn_id)) { conflict = true; continue; }
    const turn = ensure(payload.turn_id);
    if (record.type === 'turn_context') {
      const projected = {
        observedAt: recordedTimestamp(record),
        cwd: payload.cwd,
        model: conditionId(payload.model),
        reasoningEffort: REASONING_EFFORTS.has(payload.effort) ? payload.effort : null,
        executionPolicyDigest: policyDigest(payload),
      };
      const replay = turn.contextRecords.some(value => isDeepStrictEqual(value, record));
      if (turn.terminal !== null && !replay) conflict = true;
      if (!replay) {
        turn.contextRecords.push(record);
        turn.contexts.push(projected);
      }
      if (!turn.startSeen && turn.startedAt === null) turn.startedAt = recordedTimestamp(record);
      continue;
    }
    if (payload.type === 'task_started') {
      const start = { startedAt: recordedTimestamp(record) };
      const replay = turn.starts.some(value => isDeepStrictEqual(value, record));
      if (turn.terminal !== null && !replay) conflict = true;
      turn.startSeen = true;
      if (!replay) turn.starts.push(record);
      if (turn.starts.length > 1) conflict = true;
      turn.startedAt = start.startedAt;
      continue;
    }
    const terminal = terminalProjection(record);
    if (turn.terminal === null) {
      turn.terminalRecord = record;
      turn.terminal = terminal;
    } else if (!isDeepStrictEqual(turn.terminalRecord, record)) turn.terminalConflict = true;
  }
  if (turns.length > MAX_TURNS) return { turns: [], issue: 'timeline-too-large' };
  if (!turns.length) return { turns: [], issue: 'timeline-unavailable' };
  return { turns, issue: conflict ? 'timeline-conflict' : null };
}

function responseProjection(payload) {
  return {
    threadId: payload.thread_id,
    turnId: payload.turn_id,
    sessionId: payload.session_id,
    rootTurnId: payload.root_turn_id,
    responseId: payload.response_id,
    usage: object(payload.usage) ? canonical(payload.usage) : payload.usage,
    turnUsage: object(payload.turn_token_usage) ? canonical(payload.turn_token_usage) : payload.turn_token_usage,
    threadUsage: object(payload.thread_token_usage) ? canonical(payload.thread_token_usage) : payload.thread_token_usage,
  };
}

function nativeField(container, field, reasons, missingReason, invalidReason) {
  if (!object(container)) {
    addReason(reasons, missingReason);
    return null;
  }
  const value = container[NATIVE_USAGE_FIELDS[field]];
  if (value === undefined) {
    addReason(reasons, missingReason);
    return null;
  }
  if (!validCounter(value)) {
    addReason(reasons, invalidReason);
    return null;
  }
  return value;
}

function aggregateResponseTotals(responses, reasons) {
  if (!responses.length) return emptyTotals();
  const result = {};
  for (const field of USAGE_FIELDS) {
    const values = responses.map(response => nativeField(
      response.usage, field, reasons, 'response-usage-missing-field', 'response-usage-invalid',
    ));
    const sum = sumCounters(values);
    if (values.every(validCounter) && sum === null) addReason(reasons, 'response-usage-overflow');
    result[field] = sum;
  }
  return result;
}

function inspectCumulative(responses, turnIds, responseTotalsByTurn, reasons) {
  for (const turnId of turnIds) {
    const turnResponses = responses.filter(response => response.turn_id === turnId);
    if (!turnResponses.length) continue;
    for (const field of USAGE_FIELDS) {
      const values = turnResponses.map(response => nativeField(
        response.turn_token_usage, field, reasons, 'turn-cumulative-missing', 'turn-cumulative-invalid',
      ));
      if (values.every(validCounter)) {
        if (values.some((value, index) => index > 0 && value < values[index - 1])) {
          addReason(reasons, 'turn-cumulative-decreased');
        }
        const responseTotal = responseTotalsByTurn.get(turnId)[field];
        if (responseTotal !== null && values.at(-1) !== responseTotal) {
          addReason(reasons, 'turn-cumulative-inconsistent');
        }
      }
    }
  }
  for (const field of USAGE_FIELDS) {
    const values = responses.map(response => nativeField(
      response.thread_token_usage, field, reasons, 'thread-cumulative-missing', 'thread-cumulative-invalid',
    ));
    if (values.length && values.every(validCounter)
      && values.some((value, index) => index > 0 && value < values[index - 1])) {
      addReason(reasons, 'thread-cumulative-decreased');
    }
  }
}

function analyzeUsage(records, selectedTurnIds, taskId, { incompleteTrailingLine = false } = {}) {
  const selected = new Set(selectedTurnIds);
  const reasons = [];
  const responses = [];
  const seen = new Map();
  let duplicateCount = 0;
  let excludedCount = 0;
  let replayConflict = false;
  for (const record of records) {
    if (record?.type !== 'token_usage_record') continue;
    const payload = record.payload;
    if (!object(payload)) continue;
    if (!boundedId(payload.turn_id)) {
      excludedCount += 1;
      addReason(reasons, 'response-attribution-unknown');
      continue;
    }
    if (!selected.has(payload.turn_id)) continue;
    const attributionFields = [payload.thread_id, payload.session_id, payload.root_turn_id];
    if (attributionFields.some(value => value === undefined || value === null || typeof value !== 'string')) {
      excludedCount += 1;
      addReason(reasons, 'response-attribution-unknown');
      continue;
    }
    if (payload.thread_id !== taskId || payload.session_id !== taskId || payload.root_turn_id !== payload.turn_id) {
      excludedCount += 1;
      continue;
    }
    if (!boundedId(payload.response_id)) {
      excludedCount += 1;
      addReason(reasons, 'response-id-missing');
      continue;
    }
    const projected = responseProjection(payload);
    if (seen.has(payload.response_id)) {
      duplicateCount += 1;
      if (!isDeepStrictEqual(seen.get(payload.response_id).projection, projected)) {
        replayConflict = true;
        addReason(reasons, 'response-replay-conflict');
      }
      continue;
    }
    const response = {
      response_id: payload.response_id,
      turn_id: payload.turn_id,
      usage: payload.usage,
      turn_token_usage: payload.turn_token_usage,
      thread_token_usage: payload.thread_token_usage,
      projection: projected,
    };
    seen.set(payload.response_id, response);
    responses.push(response);
  }
  if (incompleteTrailingLine) addReason(reasons, 'incomplete-record-read');
  if (responses.some(response => !object(response.usage))) addReason(reasons, 'response-usage-missing');
  const responseTotalsByTurn = new Map();
  for (const turnId of selectedTurnIds) {
    responseTotalsByTurn.set(turnId, aggregateResponseTotals(
      responses.filter(response => response.turn_id === turnId), reasons,
    ));
  }
  let totals = aggregateResponseTotals(responses, reasons);
  if (responses.length && selectedTurnIds.some(turnId => !responses.some(response => response.turn_id === turnId))) {
    totals = emptyTotals();
    addReason(reasons, 'selected-turn-usage-unavailable');
  }
  inspectCumulative(responses, selectedTurnIds, responseTotalsByTurn, reasons);
  if (replayConflict) totals = emptyTotals();
  if (!responses.length) {
    totals = emptyTotals();
    addReason(reasons, 'no-attributable-usage');
  }
  const finalReportedThreadTotals = replayConflict || !responses.length
    ? emptyTotals()
    : Object.fromEntries(USAGE_FIELDS.map(field => [field, nativeField(
      responses.at(-1).thread_token_usage, field, [], 'thread-cumulative-missing', 'thread-cumulative-invalid',
    )]));
  const known = USAGE_FIELDS.filter(field => totals[field] !== null).length;
  const availability = known === 0 ? 'unavailable'
    : reasons.length ? 'partial' : 'available';
  return {
    availability,
    totals,
    responseCount: responses.length,
    duplicateCount,
    excludedCount,
    coverage: 'recorded-root-responses',
    completeness: 'unknown',
    childCoverage: 'unknown',
    finalReportedThreadTotals,
    reasons,
  };
}

function conditionsFor(turns) {
  const contexts = turns.flatMap(turn => turn.contexts);
  const first = contexts[0] ?? {
    model: null, reasoningEffort: null, executionPolicyDigest: null,
  };
  const values = {
    model: contexts.map(context => context.model),
    reasoningEffort: contexts.map(context => context.reasoningEffort),
    executionPolicy: contexts.map(context => context.executionPolicyDigest),
  };
  const changes = CONDITION_FIELDS.filter(field => {
    const known = values[field].filter(value => value !== null);
    return new Set(known).size > 1;
  });
  const unknown = CONDITION_FIELDS.filter(field => !values[field].length || values[field].some(value => value === null));
  return {
    model: first.model,
    reasoningEffort: first.reasoningEffort,
    executionPolicyDigest: first.executionPolicyDigest,
    changes,
    unknown,
    executionPlatform: null,
    osVersion: null,
    desktopVersion: null,
    toolState: 'unknown',
    memoryInputs: 'unknown',
    request: 'unrecorded',
    startingFiles: 'unrecorded',
    criteriaTiming: 'retrospective',
  };
}

function outputFor(turn) {
  if (!turn?.terminal || turn.terminalConflict) {
    const reason = turn?.terminalConflict ? 'output-conflict'
      : turn ? 'output-turn-incomplete' : 'output-missing';
    return { outputText: null, output: { available: false, bytes: null, reason } };
  }
  const text = turn.terminal.output;
  if (typeof text !== 'string' || text.length === 0) {
    return { outputText: null, output: { available: false, bytes: null, reason: 'output-missing' } };
  }
  const bytes = Buffer.byteLength(text);
  if (bytes > MAX_OUTPUT_BYTES) {
    return { outputText: null, output: { available: false, bytes: null, reason: 'output-too-large' } };
  }
  return { outputText: text, output: { available: true, bytes, reason: null } };
}

function unavailableMeasurement(taskId, { createdAt = null, issues = [] } = {}) {
  return validateMeasurement({
    schemaVersion: 1,
    app: 'codex-desktop',
    parserVersion: PARSER_VERSION,
    taskId,
    createdAt,
    runtimeVersion: null,
    throughTurnId: null,
    selectedTurnIds: [],
    availableTurns: [],
    usage: {
      availability: 'unavailable',
      totals: emptyTotals(),
      responseCount: 0,
      duplicateCount: 0,
      excludedCount: 0,
      coverage: 'recorded-root-responses',
      completeness: 'unknown',
      childCoverage: 'unknown',
      finalReportedThreadTotals: emptyTotals(),
      reasons: ['no-attributable-usage'],
    },
    time: {
      recordedTurnDurationMs: null,
      firstResponseMs: null,
      activeExecutionMs: null,
      humanWaitMs: null,
    },
    conditions: conditionsFor([]),
    output: { available: false, bytes: null, reason: 'output-missing' },
    issues,
  });
}

export function projectCodexRun(records, options) {
  validateInput(records, options);
  const { taskId, expectedProject, throughTurnId, recordRead } = options;
  const metas = records.filter(record => record?.type === 'session_meta');
  if (metas.length !== 1 || !object(metas[0].payload)) {
    return { measurement: unavailableMeasurement(taskId, { issues: ['session-metadata-invalid'] }), outputText: null };
  }
  const meta = metas[0].payload;
  if (typeof meta.id === 'string' && meta.id !== taskId) fail('comparison-run-task-mismatch');
  if (meta.id !== taskId) {
    return { measurement: unavailableMeasurement(taskId, { issues: ['session-metadata-invalid'] }), outputText: null };
  }
  if (absolutePath(meta.cwd) && !samePath(meta.cwd, expectedProject)) fail('comparison-run-project-mismatch');
  if (!samePath(meta.cwd, expectedProject)) {
    return { measurement: unavailableMeasurement(taskId, { issues: ['session-metadata-invalid'] }), outputText: null };
  }
  const createdAt = validUtc(meta.timestamp) ? meta.timestamp : null;
  const formatIssues = [];
  if (meta.cli_version !== SUPPORTED_RUNTIME) addReason(formatIssues, 'unsupported-runtime-version');
  if (meta.originator !== 'Codex Desktop') addReason(formatIssues, 'unsupported-origin');
  const forked = meta.forked_from_id != null || meta.forked_from_thread_id != null
    || meta.thread_source === 'agent_forked_thread';
  if (forked) addReason(formatIssues, 'forked-recording');
  else if (!['user', 'agent_created_thread'].includes(meta.thread_source)) addReason(formatIssues, 'unsupported-route');
  if (formatIssues.length) {
    return { measurement: unavailableMeasurement(taskId, { createdAt, issues: formatIssues }), outputText: null };
  }

  const projectedTimeline = timeline(records);
  if (projectedTimeline.issue) {
    return {
      measurement: unavailableMeasurement(taskId, { createdAt, issues: [projectedTimeline.issue] }),
      outputText: null,
    };
  }
  const turns = projectedTimeline.turns;
  const cutoffIndex = throughTurnId === undefined ? 0 : turns.findIndex(turn => turn.turnId === throughTurnId);
  if (cutoffIndex < 0) fail('comparison-run-cutoff-invalid');
  const selectedTurns = turns.slice(0, cutoffIndex + 1);
  for (const turn of selectedTurns) {
    if (!turn.contexts.length || turn.contexts.some(context => !samePath(context.cwd, expectedProject))) {
      fail('comparison-run-project-mismatch');
    }
  }

  const turnAnalyses = new Map(turns.map(turn => [
    turn.turnId,
    analyzeUsage(records, [turn.turnId], taskId),
  ]));
  const availableTurns = turns.map((turn, index) => ({
    turnId: turn.turnId,
    ordinal: index + 1,
    completed: turn.terminal !== null,
    startedAt: turn.startedAt,
    completedAt: turn.terminalConflict ? null : turn.terminal?.completedAt ?? null,
    durationMs: turn.terminalConflict ? null : turn.terminal?.durationMs ?? null,
    responseCount: turnAnalyses.get(turn.turnId).responseCount,
    totals: turnAnalyses.get(turn.turnId).totals,
  }));
  const selectedTurnIds = selectedTurns.map(turn => turn.turnId);
  const usage = analyzeUsage(records, selectedTurnIds, taskId, recordRead);
  if (selectedTurns.some(turn => turn.terminal === null)) {
    addReason(usage.reasons, 'turn-incomplete');
    if (usage.availability === 'available') usage.availability = 'partial';
  }
  const selectedLast = selectedTurns.at(-1);
  const selectedOutput = outputFor(selectedLast);
  const issues = [];
  if (selectedTurns.some(turn => turn.terminalConflict)) addReason(issues, 'terminal-conflict');
  for (const turn of selectedTurns) {
    if (turn.startedAt === null) addReason(issues, 'turn-start-time-unavailable');
    if (turn.terminal && !turn.terminalConflict && turn.terminal.completedAt === null) {
      addReason(issues, 'turn-completion-time-unavailable');
    }
    if (turn.terminal && !turn.terminalConflict && turn.terminal.durationMs === null) {
      addReason(issues, 'turn-duration-unavailable');
    }
  }
  if (selectedTurns[0].terminal && !selectedTurns[0].terminalConflict
    && selectedTurns[0].terminal.firstResponseMs === null) {
    addReason(issues, 'first-response-time-unavailable');
  }
  const selectedSummaries = availableTurns.slice(0, selectedTurns.length);
  const durationValues = selectedSummaries.map(turn => turn.durationMs);
  const recordedTurnDurationMs = selectedSummaries.every(turn => turn.completed)
    ? sumCounters(durationValues) : null;
  const measurement = validateMeasurement({
    schemaVersion: 1,
    app: 'codex-desktop',
    parserVersion: PARSER_VERSION,
    taskId,
    createdAt,
    runtimeVersion: SUPPORTED_RUNTIME,
    throughTurnId: selectedTurnIds.at(-1),
    selectedTurnIds,
    availableTurns,
    usage,
    time: {
      recordedTurnDurationMs,
      firstResponseMs: selectedTurns[0].terminalConflict ? null
        : selectedTurns[0].terminal?.firstResponseMs ?? null,
      activeExecutionMs: null,
      humanWaitMs: null,
    },
    conditions: conditionsFor(selectedTurns),
    output: selectedOutput.output,
    issues,
  });
  return { measurement, outputText: selectedOutput.outputText };
}
