// Ordinary-run measurement for one Claude Code desktop task recording.
//
// This parser reads only what Claude Code 2.1.260 actually records. Two
// properties of that grammar shape everything below:
//
//   * Several `assistant` records can belong to one API request. They repeat
//     the same `usage` object, so usage is attributed once per requestId and a
//     differing repeat is a replay conflict rather than a second charge.
//   * The recorded usage carries component counters (input, cache read, cache
//     write, output and thinking tokens) but no total. `totalTokens` therefore
//     stays null with an explicit missing-field reason; deriving a sum would
//     publish this parser's arithmetic under a name that means a recorded
//     value for the Codex parser.
//
// A `user` record is a new turn only when it is a human prompt: tool results
// are recorded with the same type and are not turn boundaries.
import { createHash } from 'node:crypto';
import { USAGE_FIELDS, validateMeasurement } from '../comparisons/measurement.mjs';
import { samePath } from '../sources/paths.mjs';

const MAX_TURNS = 200;
const MAX_OUTPUT_BYTES = 64 * 1024;
const QUALIFIED_VERSIONS = ['2.1.260'];
const TERMINAL_STOP_REASONS = ['end_turn', 'stop_sequence', 'max_tokens'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const counter = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const time = (v) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
const digest = (v) => createHash('sha256').update(v).digest('hex');
const emptyTotals = () => Object.fromEntries(USAGE_FIELDS.map((f) => [f, null]));

const isPrompt = (r) =>
  r?.type === 'user' &&
  r.isSidechain !== true &&
  r.toolUseResult === undefined &&
  typeof r.promptId === 'string';

/** Component counters recorded for one API request, or null when unusable. */
export function responseUsage(usage) {
  if (!object(usage)) return null;
  const thinking = usage.output_tokens_details?.thinking_tokens;
  return {
    totalTokens: null,
    inputTokens: counter(usage.input_tokens),
    cachedInputTokens: counter(usage.cache_read_input_tokens),
    cacheWriteInputTokens: counter(usage.cache_creation_input_tokens),
    outputTokens: counter(usage.output_tokens),
    reasoningOutputTokens:
      thinking === undefined ? null : counter(thinking)
  };
}

function assistantText(record) {
  const content = record?.message?.content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
}

function collectTurns(records, reasons) {
  const turns = [];
  let current = null;
  const close = () => {
    if (current) turns.push(current);
    current = null;
  };
  for (const record of records) {
    if (isPrompt(record)) {
      close();
      current = {
        turnId: record.uuid,
        startedAt: record.timestamp ?? null,
        responses: [],
        terminalAt: null,
        firstResponseAt: null
      };
      continue;
    }
    if (!current || record?.type !== 'assistant' || record.isSidechain === true)
      continue;
    if (record.isApiErrorMessage === true) continue;
    current.responses.push(record);
    if (current.firstResponseAt === null && time(record.timestamp) !== null)
      current.firstResponseAt = record.timestamp;
    if (TERMINAL_STOP_REASONS.includes(record.message?.stop_reason))
      current.terminalAt = record.timestamp ?? null;
  }
  close();
  if (turns.length > MAX_TURNS) {
    reasons.issues.add('timeline-too-large');
    return [];
  }
  return turns;
}

// One usage per API request. A repeat with different numbers cannot be
// resolved into a charge, so the whole selection reports a replay conflict.
function attributeUsage(turn, reasons) {
  const byRequest = new Map();
  let excluded = 0;
  for (const record of turn.responses) {
    const requestId = record.requestId;
    if (typeof requestId !== 'string' || !requestId) {
      reasons.usage.add('response-id-missing');
      excluded += 1;
      continue;
    }
    const usage = responseUsage(record.message?.usage);
    if (usage === null) {
      reasons.usage.add('response-usage-missing');
      excluded += 1;
      continue;
    }
    const serialized = JSON.stringify(usage);
    const previous = byRequest.get(requestId);
    if (previous === undefined) byRequest.set(requestId, { usage, serialized });
    else if (previous.serialized !== serialized) {
      reasons.usage.add('response-replay-conflict');
      byRequest.set(requestId, { usage, serialized, conflict: true });
    }
  }
  const entries = [...byRequest.values()];
  const duplicates = turn.responses.length - entries.length - excluded;
  const totals = emptyTotals();
  for (const field of USAGE_FIELDS) {
    const values = entries.map((e) => e.usage[field]);
    if (!values.length || values.some((v) => v === null)) {
      if (values.length) reasons.usage.add('response-usage-missing-field');
      totals[field] = null;
      continue;
    }
    let sum = 0;
    for (const value of values) sum += value;
    if (!Number.isSafeInteger(sum)) {
      reasons.usage.add('response-usage-overflow');
      totals[field] = null;
      continue;
    }
    totals[field] = sum;
  }
  return {
    responseCount: entries.length,
    duplicateCount: Math.max(0, duplicates),
    excludedCount: excluded,
    totals,
    conflict: entries.some((e) => e.conflict)
  };
}

/**
 * Project one Claude Code task recording into the shared measurement shape.
 * Returns the validated measurement and, separately, the private output text.
 */
export function projectClaudeRun(records, { taskId, expectedProject, throughTurnId, recordRead } = {}) {
  const reasons = { issues: new Set(), usage: new Set() };
  const withSession = records.filter(
    (r) =>
      object(r) &&
      typeof r.sessionId === 'string' &&
      ['user', 'assistant', 'attachment', 'system'].includes(r.type)
  );
  const header = withSession[0] ?? null;
  const runtimeVersion =
    typeof header?.version === 'string' &&
    /^\d{1,8}(\.\d{1,8}){1,3}$/.test(header.version)
      ? header.version
      : null;
  if (!header || new Set(withSession.map((r) => r.sessionId)).size !== 1)
    reasons.issues.add('session-metadata-invalid');
  else {
    if (header.sessionId !== taskId) reasons.issues.add('session-metadata-invalid');
    if (header.entrypoint !== 'claude-desktop') reasons.issues.add('unsupported-origin');
    if (header.userType !== 'external') reasons.issues.add('unsupported-route');
    if (withSession.some((r) => r.isSidechain === true))
      reasons.issues.add('forked-recording');
    if (expectedProject !== undefined && !samePath(header.cwd, expectedProject))
      reasons.issues.add('unsupported-route');
  }
  if (!QUALIFIED_VERSIONS.includes(runtimeVersion))
    reasons.issues.add('unsupported-runtime-version');
  if (recordRead?.incompleteTrailingLine) reasons.usage.add('incomplete-record-read');

  const attachment = (type) => {
    for (const r of records)
      if (r?.type === 'attachment' && r.attachment?.type === type) return r.attachment;
    return null;
  };
  const modelId = attachment('model')?.identity?.modelId;
  const effortValue = records.find(
    (r) => r?.type === 'assistant' && typeof r.effort === 'string'
  )?.effort;
  const permissionMode = withSession
    .map((r) => r.permissionMode)
    .find((v) => typeof v === 'string');
  const conditions = {
    model:
      typeof modelId === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(modelId)
        ? modelId
        : null,
    reasoningEffort: EFFORTS.includes(effortValue) ? effortValue : null,
    executionPolicyDigest: permissionMode
      ? digest(JSON.stringify({ permissionMode }))
      : null
  };

  const unavailable = [...reasons.issues].some((issue) =>
    [
      'session-metadata-invalid',
      'unsupported-runtime-version',
      'unsupported-origin',
      'unsupported-route',
      'forked-recording',
      'timeline-unavailable',
      'timeline-conflict',
      'timeline-too-large'
    ].includes(issue)
  );
  const collected = unavailable ? [] : collectTurns(records, reasons);
  if (!unavailable && !collected.length) reasons.issues.add('timeline-unavailable');

  const availableTurns = collected.map((turn, index) => {
    const usage = attributeUsage(turn, reasons);
    const startedAt = time(turn.startedAt) === null ? null : turn.startedAt;
    const completed = turn.terminalAt !== null;
    const completedAt = completed && time(turn.terminalAt) !== null ? turn.terminalAt : null;
    if (!completed) reasons.issues.add('turn-incomplete');
    if (startedAt === null) reasons.issues.add('turn-start-time-unavailable');
    if (completed && completedAt === null)
      reasons.issues.add('turn-completion-time-unavailable');
    const durationMs =
      completed && startedAt !== null && completedAt !== null
        ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt))
        : null;
    if (completed && durationMs === null) reasons.issues.add('turn-duration-unavailable');
    return {
      turnId: turn.turnId,
      ordinal: index + 1,
      completed,
      startedAt,
      completedAt,
      durationMs,
      responseCount: usage.responseCount,
      totals: usage.responseCount === 0 ? emptyTotals() : usage.totals,
      _usage: usage,
      _firstResponseAt: turn.firstResponseAt,
      _responses: turn.responses
    };
  });

  const allIds = availableTurns.map((t) => t.turnId);
  let selectedCount = availableTurns.length;
  if (throughTurnId !== undefined) {
    const index = allIds.indexOf(throughTurnId);
    if (index === -1) {
      reasons.issues.add('timeline-conflict');
      selectedCount = 0;
    } else selectedCount = index + 1;
  }
  const selected = reasons.issues.has('timeline-conflict')
    ? []
    : availableTurns.slice(0, selectedCount);
  const publishedTurns = reasons.issues.has('timeline-conflict') ? [] : availableTurns;

  const responseCount = selected.reduce((sum, t) => sum + t.responseCount, 0);
  const replayConflict = selected.some((t) => t._usage.conflict);
  if (!responseCount) reasons.usage.add('no-attributable-usage');
  const totals = emptyTotals();
  if (!replayConflict)
    for (const field of USAGE_FIELDS) {
      const values = selected
        .filter((t) => t.responseCount > 0)
        .map((t) => t.totals[field]);
      if (!values.length || values.some((v) => v === null)) continue;
      let sum = 0;
      for (const value of values) sum += value;
      totals[field] = Number.isSafeInteger(sum) ? sum : null;
    }
  const knownTotals = USAGE_FIELDS.filter((f) => totals[f] !== null).length;
  const usageReasons = [...reasons.usage];
  const availability =
    knownTotals === 0
      ? 'unavailable'
      : knownTotals === USAGE_FIELDS.length && !usageReasons.length
        ? 'available'
        : 'partial';

  const lastSelected = selected.at(-1);
  let outputText = null,
    outputReason = null;
  if (!lastSelected || !lastSelected.completed) outputReason = 'output-turn-incomplete';
  else {
    // The final answer is the text of the turn's terminal response.
    const terminal = [...lastSelected._responses]
      .reverse()
      .find((r) => TERMINAL_STOP_REASONS.includes(r.message?.stop_reason));
    const text = assistantText(terminal);
    if (!text) outputReason = 'output-missing';
    else if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES)
      outputReason = 'output-too-large';
    else outputText = text;
  }
  const firstSelected = selected[0];
  const firstResponseMs =
    firstSelected?.startedAt && firstSelected._firstResponseAt
      ? Math.max(
          0,
          Date.parse(firstSelected._firstResponseAt) - Date.parse(firstSelected.startedAt)
        )
      : null;
  if (firstResponseMs === null && firstSelected?.completed)
    reasons.issues.add('first-response-time-unavailable');
  const recordedTurnDurationMs =
    selected.length && selected.every((t) => t.completed)
      ? selected.reduce(
          (sum, t) => (sum === null || t.durationMs === null ? null : sum + t.durationMs),
          0
        )
      : null;

  const conditionUnknown = [
    ...(conditions.model === null ? ['model'] : []),
    ...(conditions.reasoningEffort === null ? ['reasoningEffort'] : []),
    ...(conditions.executionPolicyDigest === null ? ['executionPolicy'] : [])
  ];

  const measurement = validateMeasurement({
    schemaVersion: 1,
    app: 'claude-desktop',
    parserVersion: 'claude-desktop-2.1.260/v1',
    taskId,
    createdAt: header?.timestamp && time(header.timestamp) !== null ? header.timestamp : null,
    runtimeVersion: selected.length ? runtimeVersion : null,
    throughTurnId: selected.at(-1)?.turnId ?? null,
    selectedTurnIds: selected.map((t) => t.turnId),
    availableTurns: publishedTurns.map(
      ({ _usage, _firstResponseAt, _responses, ...turn }) => turn
    ),
    usage: {
      availability,
      totals,
      responseCount,
      // A replay conflict must be visible as at least one duplicate record.
      duplicateCount: Math.max(
        replayConflict ? 1 : 0,
        selected.reduce((sum, t) => sum + t._usage.duplicateCount, 0)
      ),
      excludedCount: selected.reduce((sum, t) => sum + t._usage.excludedCount, 0),
      coverage: 'recorded-root-responses',
      completeness: 'unknown',
      childCoverage: 'unknown',
      finalReportedThreadTotals: emptyTotals(),
      reasons: usageReasons
    },
    time: {
      recordedTurnDurationMs,
      firstResponseMs,
      activeExecutionMs: null,
      humanWaitMs: null
    },
    conditions: {
      ...conditions,
      changes: [],
      unknown: conditionUnknown,
      executionPlatform: null,
      osVersion: null,
      desktopVersion: null,
      toolState: 'unknown',
      memoryInputs: 'unknown',
      request: 'unrecorded',
      startingFiles: 'unrecorded',
      criteriaTiming: 'retrospective'
    },
    output:
      outputText === null
        ? { available: false, bytes: null, reason: outputReason }
        : {
            available: true,
            bytes: Buffer.byteLength(outputText, 'utf8'),
            reason: null
          },
    issues: [...reasons.issues]
  });
  return { measurement, outputText };
}
