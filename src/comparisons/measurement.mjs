export const USAGE_FIELDS = Object.freeze([
  'totalTokens',
  'inputTokens',
  'cachedInputTokens',
  'cacheWriteInputTokens',
  'outputTokens',
  'reasoningOutputTokens',
]);

export const MEASUREMENT_ERROR_KINDS = Object.freeze([
  'comparison-measurement-invalid',
]);

export const MEASUREMENT_REASONS = Object.freeze([
  'session-metadata-invalid',
  'unsupported-runtime-version',
  'unsupported-origin',
  'unsupported-route',
  'forked-recording',
  'timeline-unavailable',
  'timeline-conflict',
  'timeline-too-large',
  'terminal-conflict',
  'turn-start-time-unavailable',
  'turn-completion-time-unavailable',
  'turn-duration-unavailable',
  'first-response-time-unavailable',
  'turn-incomplete',
  'incomplete-record-read',
  'no-attributable-usage',
  'response-id-missing',
  'response-replay-conflict',
  'response-attribution-unknown',
  'response-usage-missing',
  'response-usage-missing-field',
  'response-usage-invalid',
  'response-usage-overflow',
  'turn-cumulative-missing',
  'turn-cumulative-invalid',
  'turn-cumulative-decreased',
  'turn-cumulative-inconsistent',
  'thread-cumulative-missing',
  'thread-cumulative-invalid',
  'thread-cumulative-decreased',
  'output-turn-incomplete',
  'output-missing',
  'output-too-large',
  'output-conflict',
]);

const USAGE_REASONS = new Set([
  'turn-incomplete', 'incomplete-record-read', 'no-attributable-usage',
  'response-id-missing', 'response-replay-conflict', 'response-attribution-unknown',
  'response-usage-missing', 'response-usage-missing-field', 'response-usage-invalid',
  'response-usage-overflow', 'turn-cumulative-missing', 'turn-cumulative-invalid',
  'turn-cumulative-decreased', 'turn-cumulative-inconsistent', 'thread-cumulative-missing',
  'thread-cumulative-invalid', 'thread-cumulative-decreased',
]);
const OUTPUT_REASONS = new Set([
  'output-turn-incomplete', 'output-missing', 'output-too-large', 'output-conflict',
]);
const CONDITION_FIELDS = Object.freeze(['model', 'reasoningEffort', 'executionPolicy']);
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const UNAVAILABLE_ISSUES = new Set([
  'session-metadata-invalid', 'unsupported-runtime-version', 'unsupported-origin',
  'unsupported-route', 'forked-recording', 'timeline-unavailable',
  'timeline-conflict', 'timeline-too-large',
]);

const validCounter = value => Number.isSafeInteger(value) && value >= 0;
const nullableCounter = value => value === null || validCounter(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedId = value => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
const uuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const utc = value => typeof value === 'string'
  && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const identifier = value => typeof value === 'string'
  && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function fail() {
  const kind = MEASUREMENT_ERROR_KINDS[0];
  throw Object.assign(new Error(kind), { kind });
}

function exactKeys(value, keys) {
  if (!object(value)) fail();
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail();
}

function fixedArray(value, allowed, maximum) {
  if (!Array.isArray(value) || value.length > maximum || new Set(value).size !== value.length
    || value.some(item => !allowed.has(item))) fail();
  return [...value];
}

function totalsCopy(value) {
  exactKeys(value, USAGE_FIELDS);
  const result = {};
  for (const field of USAGE_FIELDS) {
    if (!nullableCounter(value[field])) fail();
    result[field] = value[field];
  }
  return result;
}

export function sumCounters(values) {
  if (!Array.isArray(values) || !values.length || !values.every(validCounter)) return null;
  let sum = 0;
  for (const value of values) {
    sum += value;
    if (!Number.isSafeInteger(sum)) return null;
  }
  return sum;
}

function turnCopy(value, index) {
  exactKeys(value, [
    'turnId', 'ordinal', 'completed', 'startedAt', 'completedAt',
    'durationMs', 'responseCount', 'totals',
  ]);
  if (!boundedId(value.turnId) || value.ordinal !== index + 1
    || typeof value.completed !== 'boolean'
    || !(value.startedAt === null || utc(value.startedAt))
    || !(value.completedAt === null || utc(value.completedAt))
    || !nullableCounter(value.durationMs)
    || !validCounter(value.responseCount)) fail();
  if (!value.completed && (value.completedAt !== null || value.durationMs !== null)) fail();
  const totals = totalsCopy(value.totals);
  if (value.responseCount === 0 && USAGE_FIELDS.some(field => totals[field] !== null)) fail();
  return {
    turnId: value.turnId,
    ordinal: value.ordinal,
    completed: value.completed,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    durationMs: value.durationMs,
    responseCount: value.responseCount,
    totals,
  };
}

function expectedSelectedTotal(turns, field) {
  if (!turns.length || turns.reduce((sum, turn) => sum + turn.responseCount, 0) === 0) return null;
  return sumCounters(turns.map(turn => turn.totals[field]));
}

export function validateMeasurement(value) {
  exactKeys(value, [
    'schemaVersion', 'app', 'parserVersion', 'taskId', 'createdAt', 'runtimeVersion',
    'throughTurnId', 'selectedTurnIds', 'availableTurns', 'usage', 'time',
    'conditions', 'output', 'issues',
  ]);
  if (value.schemaVersion !== 1 || value.app !== 'codex-desktop'
    || value.parserVersion !== 'codex-desktop-0.153.4/v1'
    || !uuid(value.taskId)
    || !(value.createdAt === null || utc(value.createdAt))
    || !(value.runtimeVersion === null || identifier(value.runtimeVersion))
    || !(value.throughTurnId === null || boundedId(value.throughTurnId))
    || !Array.isArray(value.availableTurns) || value.availableTurns.length > 200
    || !Array.isArray(value.selectedTurnIds) || value.selectedTurnIds.length > 200
    || new Set(value.selectedTurnIds).size !== value.selectedTurnIds.length
    || value.selectedTurnIds.some(turnId => !boundedId(turnId))) fail();

  const issues = fixedArray(value.issues, new Set(MEASUREMENT_REASONS), MEASUREMENT_REASONS.length);
  const unavailableIssue = issues.some(issue => UNAVAILABLE_ISSUES.has(issue));
  const availableTurns = value.availableTurns.map(turnCopy);
  if (new Set(availableTurns.map(turn => turn.turnId)).size !== availableTurns.length) fail();
  const prefix = availableTurns.slice(0, value.selectedTurnIds.length).map(turn => turn.turnId);
  if (prefix.some((turnId, index) => turnId !== value.selectedTurnIds[index])) fail();
  if ((value.selectedTurnIds.at(-1) ?? null) !== value.throughTurnId) fail();
  const selectedTurns = availableTurns.slice(0, value.selectedTurnIds.length);
  if (selectedTurns.length) {
    if (value.runtimeVersion !== '0.153.4' || unavailableIssue) fail();
  } else if (value.runtimeVersion !== null || !unavailableIssue || availableTurns.length) fail();

  exactKeys(value.usage, [
    'availability', 'totals', 'responseCount', 'duplicateCount', 'excludedCount',
    'coverage', 'completeness', 'childCoverage', 'finalReportedThreadTotals', 'reasons',
  ]);
  if (!['available', 'partial', 'unavailable'].includes(value.usage.availability)
    || !validCounter(value.usage.responseCount)
    || !validCounter(value.usage.duplicateCount)
    || !validCounter(value.usage.excludedCount)
    || value.usage.coverage !== 'recorded-root-responses'
    || value.usage.completeness !== 'unknown'
    || value.usage.childCoverage !== 'unknown') fail();
  const usageTotals = totalsCopy(value.usage.totals);
  const finalReportedThreadTotals = totalsCopy(value.usage.finalReportedThreadTotals);
  const usageReasons = fixedArray(value.usage.reasons, USAGE_REASONS, USAGE_REASONS.size);
  const summarizedResponseCount = selectedTurns.reduce((sum, turn) => sum + turn.responseCount, 0);
  const replayConflict = usageReasons.includes('response-replay-conflict');
  if (replayConflict) {
    if (value.usage.responseCount === 0 || value.usage.duplicateCount === 0
      || value.usage.responseCount > summarizedResponseCount
      || USAGE_FIELDS.some(field => usageTotals[field] !== null
        || finalReportedThreadTotals[field] !== null)) fail();
  } else {
    if (summarizedResponseCount !== value.usage.responseCount) fail();
    for (const field of USAGE_FIELDS) {
      if (usageTotals[field] !== expectedSelectedTotal(selectedTurns, field)) fail();
    }
  }
  const knownTotals = USAGE_FIELDS.filter(field => usageTotals[field] !== null).length;
  if (value.usage.availability === 'available'
    && (value.usage.responseCount === 0 || knownTotals !== USAGE_FIELDS.length || usageReasons.length !== 0)) fail();
  if (value.usage.availability === 'partial'
    && (value.usage.responseCount === 0 || knownTotals === 0 || usageReasons.length === 0)) fail();
  if (value.usage.availability === 'unavailable' && knownTotals !== 0) fail();
  if ((value.usage.responseCount === 0) !== usageReasons.includes('no-attributable-usage')) fail();

  exactKeys(value.time, [
    'recordedTurnDurationMs', 'firstResponseMs', 'activeExecutionMs', 'humanWaitMs',
  ]);
  if (!nullableCounter(value.time.recordedTurnDurationMs)
    || !nullableCounter(value.time.firstResponseMs)
    || value.time.activeExecutionMs !== null || value.time.humanWaitMs !== null) fail();
  const expectedDuration = selectedTurns.length && selectedTurns.every(turn => turn.completed)
    ? sumCounters(selectedTurns.map(turn => turn.durationMs)) : null;
  if (value.time.recordedTurnDurationMs !== expectedDuration) fail();
  const terminalConflict = issues.includes('terminal-conflict');
  const selectedDurationMissing = selectedTurns.some(turn => turn.completed && turn.durationMs === null);
  if (selectedDurationMissing && !terminalConflict && !issues.includes('turn-duration-unavailable')) fail();
  if (value.time.firstResponseMs === null && selectedTurns[0]?.completed
    && !terminalConflict && !issues.includes('first-response-time-unavailable')) fail();

  exactKeys(value.conditions, [
    'model', 'reasoningEffort', 'executionPolicyDigest', 'changes', 'unknown',
    'executionPlatform', 'osVersion', 'desktopVersion',
    'toolState', 'memoryInputs', 'request', 'startingFiles', 'criteriaTiming',
  ]);
  if (!(value.conditions.model === null || identifier(value.conditions.model))
    || !(value.conditions.reasoningEffort === null || REASONING_EFFORTS.has(value.conditions.reasoningEffort))
    || !(value.conditions.executionPolicyDigest === null || digest(value.conditions.executionPolicyDigest))
    || value.conditions.executionPlatform !== null
    || value.conditions.osVersion !== null
    || value.conditions.desktopVersion !== null
    || value.conditions.toolState !== 'unknown'
    || value.conditions.memoryInputs !== 'unknown'
    || value.conditions.request !== 'unrecorded'
    || value.conditions.startingFiles !== 'unrecorded'
    || value.conditions.criteriaTiming !== 'retrospective') fail();
  const conditionNames = new Set(CONDITION_FIELDS);
  const changes = fixedArray(value.conditions.changes, conditionNames, CONDITION_FIELDS.length);
  const unknown = fixedArray(value.conditions.unknown, conditionNames, CONDITION_FIELDS.length);
  if (value.conditions.model === null && !unknown.includes('model')) fail();
  if (value.conditions.reasoningEffort === null && !unknown.includes('reasoningEffort')) fail();
  if (value.conditions.executionPolicyDigest === null && !unknown.includes('executionPolicy')) fail();

  exactKeys(value.output, ['available', 'bytes', 'reason']);
  if (typeof value.output.available !== 'boolean') fail();
  if (value.output.available) {
    if (!validCounter(value.output.bytes) || value.output.bytes === 0 || value.output.bytes > 64 * 1024
      || value.output.reason !== null || !selectedTurns.at(-1)?.completed) fail();
  } else if (value.output.bytes !== null || !OUTPUT_REASONS.has(value.output.reason)) fail();

  return {
    schemaVersion: 1,
    app: 'codex-desktop',
    parserVersion: 'codex-desktop-0.153.4/v1',
    taskId: value.taskId,
    createdAt: value.createdAt,
    runtimeVersion: value.runtimeVersion,
    throughTurnId: value.throughTurnId,
    selectedTurnIds: [...value.selectedTurnIds],
    availableTurns,
    usage: {
      availability: value.usage.availability,
      totals: usageTotals,
      responseCount: value.usage.responseCount,
      duplicateCount: value.usage.duplicateCount,
      excludedCount: value.usage.excludedCount,
      coverage: 'recorded-root-responses',
      completeness: 'unknown',
      childCoverage: 'unknown',
      finalReportedThreadTotals,
      reasons: usageReasons,
    },
    time: {
      recordedTurnDurationMs: value.time.recordedTurnDurationMs,
      firstResponseMs: value.time.firstResponseMs,
      activeExecutionMs: null,
      humanWaitMs: null,
    },
    conditions: {
      model: value.conditions.model,
      reasoningEffort: value.conditions.reasoningEffort,
      executionPolicyDigest: value.conditions.executionPolicyDigest,
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
    },
    output: { ...value.output },
    issues,
  };
}
