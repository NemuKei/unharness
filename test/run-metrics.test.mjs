import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RUN_METRIC_ERROR_KINDS,
  RUN_METRIC_REASONS,
  projectCodexRun,
} from '../src/codex/run-metrics.mjs';
import {
  MEASUREMENT_ERROR_KINDS,
  USAGE_FIELDS,
  sumCounters,
  validateMeasurement,
} from '../src/comparisons/measurement.mjs';

const taskId = '11111111-2222-4333-8444-555555555555';
const firstTurnId = 'turn-synthetic-one';
const secondTurnId = 'turn-synthetic-two';
const expectedProject = '/synthetic/project';
const recordRead = { incompleteTrailingLine: false, snapshotBytes: 4096 };

function record(type, payload, timestamp) {
  return { timestamp, type, payload };
}

function usage(responseId, turnId, values, turnValues, threadValues, timestamp) {
  return record('token_usage_record', {
    thread_id: taskId,
    turn_id: turnId,
    session_id: taskId,
    root_turn_id: turnId,
    response_id: responseId,
    usage: structuredClone(values),
    turn_token_usage: structuredClone(turnValues),
    thread_token_usage: structuredClone(threadValues),
  }, timestamp);
}

function twoTurnRecords() {
  const firstUsage = {
    total_tokens: 100,
    input_tokens: 80,
    cached_input_tokens: 20,
    cache_write_input_tokens: 0,
    output_tokens: 20,
    reasoning_output_tokens: 5,
  };
  const secondUsage = {
    total_tokens: 60,
    input_tokens: 50,
    cached_input_tokens: 10,
    cache_write_input_tokens: 4,
    output_tokens: 10,
    reasoning_output_tokens: 3,
  };
  const thirdUsage = {
    total_tokens: 40,
    input_tokens: 30,
    cached_input_tokens: 5,
    cache_write_input_tokens: 2,
    output_tokens: 10,
    reasoning_output_tokens: 2,
  };
  const thirdRecord = usage('response-synthetic-three', secondTurnId, thirdUsage,
    { total_tokens: 100, input_tokens: 80, cached_input_tokens: 15, cache_write_input_tokens: 6, output_tokens: 20, reasoning_output_tokens: 5 },
    { total_tokens: 200, input_tokens: 160, cached_input_tokens: 35, cache_write_input_tokens: 6, output_tokens: 40, reasoning_output_tokens: 10 },
    '2026-09-08T00:00:04Z');
  return [
    record('session_meta', {
      id: taskId,
      timestamp: '2026-09-08T00:00:00Z',
      cwd: expectedProject,
      originator: 'Codex Desktop',
      thread_source: 'user',
      cli_version: '0.153.4',
    }, '2026-09-08T00:00:00Z'),
    record('event_msg', { type: 'task_started', turn_id: firstTurnId }, '2026-09-08T00:00:00Z'),
    record('turn_context', { turn_id: firstTurnId, cwd: expectedProject, model: 'synthetic-model', effort: 'high' }, '2026-09-08T00:00:00Z'),
    usage('response-synthetic-one', firstTurnId, firstUsage, firstUsage, firstUsage, '2026-09-08T00:00:01Z'),
    record('event_msg', { type: 'task_complete', turn_id: firstTurnId, duration_ms: 1200, time_to_first_token_ms: 120, last_agent_message: 'First answer' }, '2026-09-08T00:00:02Z'),
    record('event_msg', { type: 'task_started', turn_id: secondTurnId }, '2026-09-08T00:00:02Z'),
    record('turn_context', { turn_id: secondTurnId, cwd: expectedProject, model: 'synthetic-model', effort: 'high' }, '2026-09-08T00:00:02Z'),
    usage('response-synthetic-two', secondTurnId, secondUsage, secondUsage,
      { total_tokens: 160, input_tokens: 130, cached_input_tokens: 30, cache_write_input_tokens: 4, output_tokens: 30, reasoning_output_tokens: 8 },
      '2026-09-08T00:00:03Z'),
    thirdRecord,
    structuredClone(thirdRecord),
    record('event_msg', { type: 'task_complete', turn_id: secondTurnId, duration_ms: 800, time_to_first_token_ms: 80, last_agent_message: 'Synthetic accepted answer' }, '2026-09-08T00:00:05Z'),
  ];
}

function cloneRecords() {
  return structuredClone(twoTurnRecords());
}

function project(records = cloneRecords(), options = {}) {
  return projectCodexRun(records, { taskId, expectedProject, recordRead, ...options });
}

function findUsage(records, responseId) {
  return records.find(item => item.type === 'token_usage_record' && item.payload.response_id === responseId);
}

function findComplete(records, turnId) {
  return records.find(item => item.type === 'event_msg' && item.payload.type === 'task_complete' && item.payload.turn_id === turnId);
}

test('sums distinct response usage through the selected turn without adding cumulative snapshots', () => {
  const records = twoTurnRecords();
  const first = projectCodexRun(records, { taskId, expectedProject, recordRead });
  assert.equal(first.measurement.usage.totals.totalTokens, 100);
  assert.deepEqual(first.measurement.selectedTurnIds, [firstTurnId]);
  assert.equal(first.outputText, 'First answer');

  const later = projectCodexRun(records, { taskId, expectedProject, throughTurnId: secondTurnId, recordRead });
  assert.equal(later.measurement.usage.totals.totalTokens, 200);
  assert.equal(later.measurement.usage.totals.cachedInputTokens, 35);
  assert.equal(later.measurement.usage.totals.cacheWriteInputTokens, 6);
  assert.equal(later.measurement.usage.totals.reasoningOutputTokens, 10);
  assert.equal(later.measurement.usage.duplicateCount, 1);
  assert.deepEqual(later.measurement.selectedTurnIds, [firstTurnId, secondTurnId]);
  assert.equal(later.outputText, 'Synthetic accepted answer');
  assert.equal(later.measurement.usage.childCoverage, 'unknown');
  assert.deepEqual([
    later.measurement.conditions.executionPlatform,
    later.measurement.conditions.osVersion,
    later.measurement.conditions.desktopVersion,
  ], [null, null, null]);
});

test('counter sums preserve zero and reject absent, invalid and overflowing inputs', () => {
  assert.deepEqual(USAGE_FIELDS, [
    'totalTokens', 'inputTokens', 'cachedInputTokens',
    'cacheWriteInputTokens', 'outputTokens', 'reasoningOutputTokens',
  ]);
  assert.equal(sumCounters([0, 2, 3]), 5);
  for (const values of [[], [1, null], [1, undefined], [1, -1], [1, 1.5], [1, Number.MAX_SAFE_INTEGER + 1],
    [Number.MAX_SAFE_INTEGER, 1]]) assert.equal(sumCounters(values), null);
});

test('rejects invalid task, project and cutoff references with fixed private errors', () => {
  assert.deepEqual(RUN_METRIC_ERROR_KINDS, [
    'comparison-run-input-invalid',
    'comparison-run-task-mismatch',
    'comparison-run-project-mismatch',
    'comparison-run-cutoff-invalid',
  ]);
  assert.throws(() => project(cloneRecords(), { taskId: 'PRIVATE BAD' }), { kind: 'comparison-run-input-invalid' });
  assert.throws(() => project(cloneRecords(), { expectedProject: 'relative/private' }), { kind: 'comparison-run-input-invalid' });
  const wrongTask = cloneRecords();
  wrongTask[0].payload.id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  assert.throws(() => project(wrongTask), { kind: 'comparison-run-task-mismatch' });
  const wrongMetaProject = cloneRecords();
  wrongMetaProject[0].payload.cwd = '/private/other';
  assert.throws(() => project(wrongMetaProject), { kind: 'comparison-run-project-mismatch' });
  assert.throws(() => project(cloneRecords(), { throughTurnId: 'missing-turn' }), { kind: 'comparison-run-cutoff-invalid' });
  assert.throws(() => project(cloneRecords(), { throughTurnId: 'PRIVATE\nBAD' }), { kind: 'comparison-run-input-invalid' });
});

test('selected contexts must match the project while later unselected context cannot affect the result', () => {
  const records = cloneRecords();
  records.find(item => item.type === 'turn_context' && item.payload.turn_id === secondTurnId).payload.cwd = '/private/other';
  const first = project(records);
  assert.equal(first.measurement.throughTurnId, firstTurnId);
  assert.equal(first.measurement.usage.totals.totalTokens, 100);
  assert.throws(() => project(records, { throughTurnId: secondTurnId }), { kind: 'comparison-run-project-mismatch' });
});

test('unsupported versions, origins, routes and forks return sanitized unavailable measurements', () => {
  const cases = [
    [meta => { meta.cli_version = '9.9.9+PRIVATE'; }, 'unsupported-runtime-version'],
    [meta => { meta.originator = 'PRIVATE origin'; }, 'unsupported-origin'],
    [meta => { meta.thread_source = 'PRIVATE-route'; }, 'unsupported-route'],
    [meta => { meta.forked_from_id = 'PRIVATE-parent'; }, 'forked-recording'],
    [meta => { meta.thread_source = 'agent_forked_thread'; }, 'forked-recording'],
  ];
  for (const [mutate, reason] of cases) {
    const records = cloneRecords();
    mutate(records[0].payload);
    const result = project(records);
    assert.equal(result.outputText, null);
    assert.equal(result.measurement.usage.availability, 'unavailable');
    assert.equal(result.measurement.runtimeVersion, null);
    assert.ok(result.measurement.issues.includes(reason));
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});

test('builds a timeline from recognized events, deduplicates identical events and rejects an invalid timeline', () => {
  const records = cloneRecords();
  const context = records.find(item => item.type === 'turn_context' && item.payload.turn_id === firstTurnId);
  const complete = findComplete(records, firstTurnId);
  records.splice(3, 0, structuredClone(context));
  records.splice(6, 0, structuredClone(complete));
  const result = project(records);
  assert.equal(result.measurement.availableTurns.length, 2);
  assert.equal(result.measurement.availableTurns[0].completed, true);
  assert.equal(result.outputText, 'First answer');

  const conflict = cloneRecords();
  const otherComplete = structuredClone(findComplete(conflict, firstTurnId));
  otherComplete.payload.duration_ms = 999;
  conflict.push(otherComplete);
  const conflicted = project(conflict);
  assert.equal(conflicted.measurement.availableTurns[0].durationMs, null);
  assert.equal(conflicted.outputText, null);
  assert.equal(conflicted.measurement.output.reason, 'output-conflict');
  assert.ok(conflicted.measurement.issues.includes('terminal-conflict'));

  const ambiguous = cloneRecords();
  const otherStart = structuredClone(ambiguous[1]);
  otherStart.timestamp = '2026-09-08T00:00:09Z';
  ambiguous.push(otherStart);
  const unavailable = project(ambiguous);
  assert.equal(unavailable.measurement.selectedTurnIds.length, 0);
  assert.equal(unavailable.measurement.usage.availability, 'unavailable');
  assert.ok(unavailable.measurement.issues.includes('timeline-conflict'));

  const interleaved = cloneRecords().filter(item => !(item.type === 'event_msg'
    && item.payload.type === 'task_complete' && item.payload.turn_id === firstTurnId));
  const outOfOrder = project(interleaved);
  assert.deepEqual(outOfOrder.measurement.selectedTurnIds, []);
  assert.ok(outOfOrder.measurement.issues.includes('timeline-conflict'));
});

test('refuses timelines over 200 turns instead of truncating them into a result', () => {
  const records = cloneRecords().slice(0, 1);
  for (let index = 0; index < 201; index += 1) {
    records.push(record('event_msg', { type: 'task_started', turn_id: `turn-${index}` }, '2026-09-08T00:00:01Z'));
  }
  const result = project(records);
  assert.deepEqual(result.measurement.availableTurns, []);
  assert.deepEqual(result.measurement.selectedTurnIds, []);
  assert.ok(result.measurement.issues.includes('timeline-too-large'));
});

test('known zero remains available while missing and invalid usage fields remain partial and null', () => {
  const zeroRecords = cloneRecords();
  const first = findUsage(zeroRecords, 'response-synthetic-one');
  for (const container of [first.payload.usage, first.payload.turn_token_usage, first.payload.thread_token_usage]) {
    for (const key of Object.keys(container)) container[key] = 0;
  }
  const zero = project(zeroRecords);
  assert.equal(zero.measurement.usage.availability, 'available');
  assert.deepEqual(Object.values(zero.measurement.usage.totals), [0, 0, 0, 0, 0, 0]);

  for (const [value, reason] of [[undefined, 'response-usage-missing-field'], [null, 'response-usage-invalid'],
    [-1, 'response-usage-invalid'], [1.5, 'response-usage-invalid'], [Number.MAX_SAFE_INTEGER + 1, 'response-usage-invalid']]) {
    const records = cloneRecords();
    const usageRecord = findUsage(records, 'response-synthetic-one');
    if (value === undefined) delete usageRecord.payload.usage.output_tokens;
    else usageRecord.payload.usage.output_tokens = value;
    const result = project(records);
    assert.equal(result.measurement.usage.availability, 'partial');
    assert.equal(result.measurement.usage.totals.outputTokens, null);
    assert.equal(result.measurement.usage.totals.totalTokens, 100, reason);
    assert.ok(result.measurement.usage.reasons.includes(reason));
  }
});

test('overflow, missing response IDs and conflicting replay never become trusted totals', () => {
  const overflow = cloneRecords();
  const first = findUsage(overflow, 'response-synthetic-one');
  first.payload.usage.total_tokens = Number.MAX_SAFE_INTEGER;
  first.payload.turn_token_usage.total_tokens = Number.MAX_SAFE_INTEGER;
  const extra = structuredClone(first);
  extra.payload.response_id = 'response-overflow';
  extra.payload.usage.total_tokens = 1;
  extra.payload.turn_token_usage.total_tokens = Number.MAX_SAFE_INTEGER;
  overflow.splice(4, 0, extra);
  const overflowed = project(overflow);
  assert.equal(overflowed.measurement.usage.totals.totalTokens, null);
  assert.equal(overflowed.measurement.usage.availability, 'partial');
  assert.ok(overflowed.measurement.usage.reasons.includes('response-usage-overflow'));

  for (const id of [undefined, '']) {
    const records = cloneRecords();
    findUsage(records, 'response-synthetic-one').payload.response_id = id;
    const result = project(records);
    assert.equal(result.measurement.usage.responseCount, 0);
    assert.equal(result.measurement.usage.availability, 'unavailable');
    assert.ok(result.measurement.usage.reasons.includes('response-id-missing'));
  }

  const conflicting = cloneRecords();
  const replay = structuredClone(findUsage(conflicting, 'response-synthetic-one'));
  replay.payload.usage.total_tokens = 101;
  conflicting.splice(4, 0, replay);
  const result = project(conflicting);
  assert.equal(result.measurement.usage.duplicateCount, 1);
  assert.equal(result.measurement.usage.responseCount, 1);
  assert.deepEqual(Object.values(result.measurement.usage.totals), [null, null, null, null, null, null]);
  assert.equal(result.measurement.usage.availability, 'unavailable');
  assert.ok(result.measurement.usage.reasons.includes('response-replay-conflict'));
});

test('a response identity reused by another selected turn makes the combined projection unavailable', () => {
  const records = cloneRecords();
  findUsage(records, 'response-synthetic-two').payload.response_id = 'response-synthetic-one';
  const result = project(records, { throughTurnId: secondTurnId });
  assert.equal(result.measurement.usage.responseCount, 2);
  assert.equal(result.measurement.usage.duplicateCount, 2);
  assert.deepEqual(Object.values(result.measurement.usage.totals), [null, null, null, null, null, null]);
  assert.equal(result.measurement.usage.availability, 'unavailable');
  assert.ok(result.measurement.usage.reasons.includes('response-replay-conflict'));
});

test('excludes explicit foreign and child usage and marks unknown attribution partial', () => {
  const records = cloneRecords();
  const root = findUsage(records, 'response-synthetic-one');
  const foreign = structuredClone(root);
  foreign.payload.response_id = 'response-foreign';
  foreign.payload.thread_id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const child = structuredClone(root);
  child.payload.response_id = 'response-child';
  child.payload.root_turn_id = 'turn-child';
  const unknown = structuredClone(root);
  unknown.payload.response_id = 'response-unknown';
  delete unknown.payload.session_id;
  records.splice(4, 0, foreign, child, unknown);
  const result = project(records);
  assert.equal(result.measurement.usage.totals.totalTokens, 100);
  assert.equal(result.measurement.usage.responseCount, 1);
  assert.equal(result.measurement.usage.excludedCount, 3);
  assert.equal(result.measurement.usage.availability, 'partial');
  assert.ok(result.measurement.usage.reasons.includes('response-attribution-unknown'));
});

test('reports missing, decreasing, invalid and inconsistent cumulative evidence without replacing response totals', () => {
  const mutations = [
    [payload => { delete payload.turn_token_usage; }, 'turn-cumulative-missing'],
    [payload => { payload.turn_token_usage.total_tokens = -1; }, 'turn-cumulative-invalid'],
    [payload => { payload.turn_token_usage.total_tokens = 99; }, 'turn-cumulative-inconsistent'],
    [payload => { payload.thread_token_usage.total_tokens = -1; }, 'thread-cumulative-invalid'],
  ];
  for (const [mutate, reason] of mutations) {
    const records = cloneRecords();
    mutate(findUsage(records, 'response-synthetic-one').payload);
    const result = project(records);
    assert.equal(result.measurement.usage.totals.totalTokens, 100, reason);
    assert.equal(result.measurement.usage.availability, 'partial');
    assert.ok(result.measurement.usage.reasons.includes(reason));
  }

  const decreasing = cloneRecords();
  for (const third of decreasing.filter(item => item.type === 'token_usage_record'
    && item.payload.response_id === 'response-synthetic-three')) {
    third.payload.turn_token_usage.total_tokens = 50;
    third.payload.thread_token_usage.total_tokens = 150;
  }
  const result = project(decreasing, { throughTurnId: secondTurnId });
  assert.equal(result.measurement.usage.totals.totalTokens, 200);
  assert.ok(result.measurement.usage.reasons.includes('turn-cumulative-decreased'));
  assert.ok(result.measurement.usage.reasons.includes('thread-cumulative-decreased'));
});

test('an incomplete selected turn and an incomplete reader stay visible without changing an earlier cutoff', () => {
  const records = cloneRecords().filter(item => !(item.type === 'event_msg'
    && item.payload.type === 'task_complete' && item.payload.turn_id === secondTurnId));
  const first = project(records);
  assert.equal(first.measurement.usage.availability, 'available');
  assert.equal(first.outputText, 'First answer');
  const later = project(records, { throughTurnId: secondTurnId });
  assert.equal(later.measurement.usage.availability, 'partial');
  assert.ok(later.measurement.usage.reasons.includes('turn-incomplete'));
  assert.equal(later.measurement.time.recordedTurnDurationMs, null);
  assert.equal(later.outputText, null);
  assert.equal(later.measurement.output.reason, 'output-turn-incomplete');

  const partialRead = project(cloneRecords(), { recordRead: { incompleteTrailingLine: true, snapshotBytes: 4097 } });
  assert.equal(partialRead.measurement.usage.availability, 'partial');
  assert.ok(partialRead.measurement.usage.reasons.includes('incomplete-record-read'));
});

test('outside-selection usage and condition changes do not alter the selected result', () => {
  const records = cloneRecords();
  const laterUsage = findUsage(records, 'response-synthetic-two');
  laterUsage.payload.usage.total_tokens = -1;
  const laterContext = records.find(item => item.type === 'turn_context' && item.payload.turn_id === secondTurnId);
  laterContext.payload.model = 'private-later-model';
  laterContext.payload.effort = 'low';
  laterContext.payload.approval_policy = 'never';
  const result = project(records);
  assert.equal(result.measurement.usage.totals.totalTokens, 100);
  assert.equal(result.measurement.usage.availability, 'available');
  assert.equal(result.measurement.conditions.model, 'synthetic-model');
  assert.deepEqual(result.measurement.conditions.changes, []);
  assert.ok(!JSON.stringify(result.measurement).includes('private-later-model'));
});

test('selected context observations expose bounded condition changes and unknowns', () => {
  const records = cloneRecords();
  const firstContext = records.find(item => item.type === 'turn_context' && item.payload.turn_id === firstTurnId);
  firstContext.payload.approval_policy = 'never';
  firstContext.payload.sandbox_policy = { type: 'read-only' };
  const changed = structuredClone(firstContext);
  changed.payload.model = 'synthetic-model-2';
  changed.payload.effort = 'low';
  changed.payload.approval_policy = 'on-request';
  changed.payload.private_extra = 'PRIVATE';
  records.splice(3, 0, changed);
  const result = project(records);
  assert.equal(result.measurement.conditions.model, 'synthetic-model');
  assert.equal(result.measurement.conditions.reasoningEffort, 'high');
  assert.match(result.measurement.conditions.executionPolicyDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(result.measurement.conditions.changes, ['model', 'reasoningEffort', 'executionPolicy']);
  assert.deepEqual(result.measurement.conditions.unknown, []);
  assert.ok(!JSON.stringify(result.measurement).includes('PRIVATE'));

  const invalid = cloneRecords();
  const context = invalid.find(item => item.type === 'turn_context' && item.payload.turn_id === firstTurnId);
  context.payload.model = 'PRIVATE BAD MODEL';
  delete context.payload.effort;
  const unknown = project(invalid);
  assert.equal(unknown.measurement.conditions.model, null);
  assert.equal(unknown.measurement.conditions.reasoningEffort, null);
  assert.deepEqual(unknown.measurement.conditions.unknown, ['model', 'reasoningEffort', 'executionPolicy']);
  assert.ok(!JSON.stringify(unknown.measurement).includes('PRIVATE'));
});

test('duration and first-response timing remain available independently of token usage', () => {
  const records = cloneRecords().filter(item => item.type !== 'token_usage_record');
  const result = project(records, { throughTurnId: secondTurnId });
  assert.equal(result.measurement.usage.availability, 'unavailable');
  assert.deepEqual(result.measurement.usage.reasons, ['no-attributable-usage']);
  assert.equal(result.measurement.time.recordedTurnDurationMs, 2000);
  assert.equal(result.measurement.time.firstResponseMs, 120);
  assert.equal(result.measurement.time.activeExecutionMs, null);
  assert.equal(result.measurement.time.humanWaitMs, null);
});

test('malformed native timing stays null with fixed issues and does not suppress valid usage or output', () => {
  const records = cloneRecords();
  records.find(item => item.type === 'event_msg' && item.payload.type === 'task_started'
    && item.payload.turn_id === firstTurnId).timestamp = 'PRIVATE time';
  const terminal = findComplete(records, firstTurnId);
  terminal.timestamp = 'PRIVATE terminal time';
  terminal.payload.duration_ms = -1;
  terminal.payload.time_to_first_token_ms = 'PRIVATE timing';
  const result = project(records);
  assert.equal(result.measurement.availableTurns[0].startedAt, null);
  assert.equal(result.measurement.availableTurns[0].completedAt, null);
  assert.equal(result.measurement.availableTurns[0].durationMs, null);
  assert.equal(result.measurement.time.recordedTurnDurationMs, null);
  assert.equal(result.measurement.time.firstResponseMs, null);
  assert.equal(result.measurement.usage.availability, 'available');
  assert.equal(result.outputText, 'First answer');
  for (const issue of ['turn-start-time-unavailable', 'turn-completion-time-unavailable',
    'turn-duration-unavailable', 'first-response-time-unavailable']) {
    assert.ok(result.measurement.issues.includes(issue));
  }
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('only a bounded terminal answer is returned and private recorded bodies never become output', () => {
  const missing = cloneRecords();
  delete findComplete(missing, firstTurnId).payload.last_agent_message;
  missing.push(record('response_item', { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'PRIVATE assistant' }] }));
  missing.push(record('response_item', { type: 'function_call_output', output: 'PRIVATE tool' }));
  missing.push(record('response_item', { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'PRIVATE developer' }] }));
  missing.push(record('response_item', { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'PRIVATE user' }] }));
  const unavailable = project(missing);
  assert.equal(unavailable.outputText, null);
  assert.equal(unavailable.measurement.output.reason, 'output-missing');
  assert.ok(!JSON.stringify(unavailable).includes('PRIVATE'));

  const oversized = cloneRecords();
  findComplete(oversized, firstTurnId).payload.last_agent_message = 'x'.repeat(64 * 1024 + 1);
  const tooLarge = project(oversized);
  assert.equal(tooLarge.outputText, null);
  assert.deepEqual(tooLarge.measurement.output, { available: false, bytes: null, reason: 'output-too-large' });
});

test('normalized validation returns a detached bounded copy and rejects extra or impossible persisted fields', () => {
  assert.deepEqual(MEASUREMENT_ERROR_KINDS, ['comparison-measurement-invalid']);
  const measurement = project().measurement;
  const validated = validateMeasurement(measurement);
  assert.deepEqual(validated, measurement);
  assert.notEqual(validated, measurement);
  assert.notEqual(validated.usage, measurement.usage);

  const mutations = [
    value => { value.private = 'PRIVATE'; },
    value => { value.usage.totals.private = 1; },
    value => { value.usage.totals.totalTokens = -1; },
    value => { value.usage.responseCount = 999; },
    value => { value.time.recordedTurnDurationMs = 999; },
    value => { value.output = { available: true, bytes: null, reason: null }; },
    value => { value.conditions.changes = ['private']; },
    value => { value.usage.reasons = ['private']; },
    value => { value.availableTurns[0].ordinal = 2; },
    value => { value.selectedTurnIds = [secondTurnId]; value.throughTurnId = secondTurnId; },
  ];
  for (const mutate of mutations) {
    const value = structuredClone(measurement);
    mutate(value);
    assert.throws(() => validateMeasurement(value), { kind: 'comparison-measurement-invalid' });
  }

  const missingRuntime = structuredClone(measurement);
  missingRuntime.runtimeVersion = null;
  assert.throws(() => validateMeasurement(missingRuntime), { kind: 'comparison-measurement-invalid' });

  const fabricatedConflict = structuredClone(measurement);
  fabricatedConflict.usage.availability = 'unavailable';
  fabricatedConflict.usage.totals = Object.fromEntries(USAGE_FIELDS.map(field => [field, null]));
  fabricatedConflict.usage.reasons = ['response-replay-conflict'];
  assert.throws(() => validateMeasurement(fabricatedConflict), { kind: 'comparison-measurement-invalid' });

  const unsupported = cloneRecords();
  unsupported[0].payload.cli_version = '9.9.9';
  const noSelection = project(unsupported).measurement;
  noSelection.issues = [];
  assert.throws(() => validateMeasurement(noSelection), { kind: 'comparison-measurement-invalid' });
  assert.ok(RUN_METRIC_REASONS.includes('response-id-missing'));
  assert.ok(RUN_METRIC_REASONS.includes('output-too-large'));
});
