import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as service from '../src/sources/service.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { projectClaudeRun, responseUsage } from '../src/claude/run-metrics.mjs';
import { createOwnedClaudeProfile } from '../src/claude/owned-profile.mjs';

const darwin = process.platform === 'darwin';
const PROJECT = '/private/tmp/synthetic-project';

const base = (overrides = {}) => ({
  isSidechain: false,
  userType: 'external',
  entrypoint: 'claude-desktop',
  cwd: PROJECT,
  version: '2.1.260',
  gitBranch: 'main',
  ...overrides
});

const usage = (input, output, { cacheRead = 0, cacheWrite = 0, thinking = 0 } = {}) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
  output_tokens_details: { thinking_tokens: thinking }
});

function recording(taskId, turns, overrides = {}) {
  const records = [
    {
      ...base({ sessionId: taskId, ...overrides }),
      type: 'attachment',
      uuid: 'a0000000-0000-4000-8000-000000000000',
      timestamp: '2026-09-09T10:00:00.000Z',
      attachment: { type: 'model', identity: { modelId: 'claude-opus-5' } }
    }
  ];
  for (const [index, turn] of turns.entries()) {
    records.push({
      ...base({ sessionId: taskId, ...overrides }),
      type: 'user',
      promptId: `p${index}`,
      promptSource: 'sdk',
      permissionMode: 'default',
      uuid: turn.turnId,
      timestamp: turn.startedAt,
      message: { role: 'user', content: 'prompt' }
    });
    for (const response of turn.responses) {
      records.push({
        ...base({ sessionId: taskId, ...overrides }),
        type: 'assistant',
        uuid: randomUUID(),
        timestamp: response.at,
        effort: 'high',
        requestId: response.requestId,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: response.text ?? 'reply' }],
          stop_reason: response.stop ?? 'tool_use',
          usage: response.usage
        }
      });
    }
    // Tool results share the `user` type and must not start a new turn.
    if (turn.toolResults)
      for (let i = 0; i < turn.toolResults; i++)
        records.push({
          ...base({ sessionId: taskId, ...overrides }),
          type: 'user',
          uuid: randomUUID(),
          timestamp: turn.startedAt,
          toolUseResult: { ok: true },
          message: { role: 'user', content: 'tool result' }
        });
  }
  return records;
}

test('recorded component counters are attributed once per API request', async () => {
  const taskId = randomUUID().toLowerCase();
  const turnId = 'b0000000-0000-4000-8000-000000000001';
  const { measurement, outputText } = projectClaudeRun(
    recording(taskId, [
      {
        turnId,
        startedAt: '2026-09-09T10:00:00.000Z',
        toolResults: 2,
        responses: [
          { at: '2026-09-09T10:00:02.000Z', requestId: 'req-1', usage: usage(10, 5, { cacheRead: 100, cacheWrite: 20, thinking: 2 }) },
          // The same request repeats its usage across streamed blocks.
          { at: '2026-09-09T10:00:03.000Z', requestId: 'req-1', usage: usage(10, 5, { cacheRead: 100, cacheWrite: 20, thinking: 2 }) },
          { at: '2026-09-09T10:00:09.000Z', requestId: 'req-2', usage: usage(4, 7, { cacheRead: 50, cacheWrite: 0, thinking: 1 }), stop: 'end_turn', text: 'Final answer.' }
        ]
      }
    ]),
    { taskId, expectedProject: PROJECT, recordRead: { incompleteTrailingLine: false } }
  );
  assert.equal(measurement.app, 'claude-desktop');
  assert.equal(measurement.parserVersion, 'claude-desktop-2.1.260/v1');
  assert.equal(measurement.runtimeVersion, '2.1.260');
  assert.deepEqual(measurement.selectedTurnIds, [turnId]);
  assert.equal(measurement.usage.responseCount, 2, 'two requests, not three records');
  assert.equal(measurement.usage.duplicateCount, 1);
  assert.equal(measurement.usage.totals.inputTokens, 14);
  assert.equal(measurement.usage.totals.outputTokens, 12);
  assert.equal(measurement.usage.totals.cachedInputTokens, 150);
  assert.equal(measurement.usage.totals.cacheWriteInputTokens, 20);
  assert.equal(measurement.usage.totals.reasoningOutputTokens, 3);
  // Claude Code records no total; it stays unknown rather than derived.
  assert.equal(measurement.usage.totals.totalTokens, null);
  assert.equal(measurement.usage.availability, 'partial');
  assert.ok(measurement.usage.reasons.includes('response-usage-missing-field'));
  assert.equal(measurement.time.recordedTurnDurationMs, 9000);
  assert.equal(measurement.time.firstResponseMs, 2000);
  assert.equal(measurement.conditions.model, 'claude-opus-5');
  assert.equal(measurement.conditions.reasoningEffort, 'high');
  assert.ok(measurement.conditions.executionPolicyDigest);
  assert.equal(outputText, 'Final answer.');
  assert.equal(measurement.output.available, true);
});

test('a differing usage repeat under one request is a replay conflict, never a second charge', async () => {
  const taskId = randomUUID().toLowerCase();
  const { measurement } = projectClaudeRun(
    recording(taskId, [
      {
        turnId: 'b0000000-0000-4000-8000-000000000002',
        startedAt: '2026-09-09T10:00:00.000Z',
        responses: [
          { at: '2026-09-09T10:00:01.000Z', requestId: 'req-1', usage: usage(10, 5) },
          { at: '2026-09-09T10:00:02.000Z', requestId: 'req-1', usage: usage(99, 99), stop: 'end_turn', text: 'Answer.' }
        ]
      }
    ]),
    { taskId, expectedProject: PROJECT, recordRead: { incompleteTrailingLine: false } }
  );
  assert.ok(measurement.usage.reasons.includes('response-replay-conflict'));
  assert.equal(measurement.usage.availability, 'unavailable');
  for (const field of Object.keys(measurement.usage.totals))
    assert.equal(measurement.usage.totals[field], null, field);
  assert.ok(measurement.usage.duplicateCount >= 1);
});

test('an unqualified recording produces no turns and no measurement claim', async () => {
  const taskId = randomUUID().toLowerCase();
  for (const [override, issue] of [
    [{ entrypoint: 'cli' }, 'unsupported-origin'],
    [{ version: '9.9.9' }, 'unsupported-runtime-version'],
    [{ isSidechain: true }, 'forked-recording'],
    [{ cwd: '/elsewhere' }, 'unsupported-route']
  ]) {
    const { measurement } = projectClaudeRun(
      recording(
        taskId,
        [
          {
            turnId: 'b0000000-0000-4000-8000-000000000003',
            startedAt: '2026-09-09T10:00:00.000Z',
            responses: [
              { at: '2026-09-09T10:00:01.000Z', requestId: 'r', usage: usage(1, 1), stop: 'end_turn', text: 'x' }
            ]
          }
        ],
        override
      ),
      { taskId, expectedProject: PROJECT, recordRead: { incompleteTrailingLine: false } }
    );
    assert.ok(measurement.issues.includes(issue), `${issue}: ${measurement.issues}`);
    assert.deepEqual(measurement.availableTurns, []);
    assert.deepEqual(measurement.selectedTurnIds, []);
    assert.equal(measurement.runtimeVersion, null);
    assert.equal(measurement.usage.availability, 'unavailable');
  }
});

test('an unfinished turn withholds duration and output', async () => {
  const taskId = randomUUID().toLowerCase();
  const { measurement, outputText } = projectClaudeRun(
    recording(taskId, [
      {
        turnId: 'b0000000-0000-4000-8000-000000000004',
        startedAt: '2026-09-09T10:00:00.000Z',
        responses: [
          { at: '2026-09-09T10:00:01.000Z', requestId: 'req-1', usage: usage(3, 4) }
        ]
      }
    ]),
    { taskId, expectedProject: PROJECT, recordRead: { incompleteTrailingLine: false } }
  );
  assert.equal(measurement.availableTurns[0].completed, false);
  assert.equal(measurement.availableTurns[0].durationMs, null);
  assert.equal(measurement.time.recordedTurnDurationMs, null);
  assert.ok(measurement.issues.includes('turn-incomplete'));
  assert.equal(measurement.output.available, false);
  assert.equal(measurement.output.reason, 'output-turn-incomplete');
  assert.equal(outputText, null);
});

test('a selected cutoff keeps only the prefix of turns', async () => {
  const taskId = randomUUID().toLowerCase();
  const first = 'b0000000-0000-4000-8000-000000000005';
  const second = 'b0000000-0000-4000-8000-000000000006';
  const records = recording(taskId, [
    {
      turnId: first,
      startedAt: '2026-09-09T10:00:00.000Z',
      responses: [{ at: '2026-09-09T10:00:01.000Z', requestId: 'r1', usage: usage(1, 1), stop: 'end_turn', text: 'one' }]
    },
    {
      turnId: second,
      startedAt: '2026-09-09T10:01:00.000Z',
      responses: [{ at: '2026-09-09T10:01:01.000Z', requestId: 'r2', usage: usage(2, 2), stop: 'end_turn', text: 'two' }]
    }
  ]);
  const options = { taskId, expectedProject: PROJECT, recordRead: { incompleteTrailingLine: false } };
  const all = projectClaudeRun(records, options);
  assert.deepEqual(all.measurement.selectedTurnIds, [first, second]);
  assert.equal(all.measurement.usage.totals.inputTokens, 3);
  assert.equal(all.outputText, 'two');
  const cut = projectClaudeRun(records, { ...options, throughTurnId: first });
  assert.deepEqual(cut.measurement.selectedTurnIds, [first]);
  assert.equal(cut.measurement.usage.totals.inputTokens, 1);
  assert.equal(cut.outputText, 'one');
  const unknown = projectClaudeRun(records, { ...options, throughTurnId: 'missing' });
  assert.ok(unknown.measurement.issues.includes('timeline-conflict'));
  assert.deepEqual(unknown.measurement.selectedTurnIds, []);
});

test('unusable recorded usage is excluded rather than guessed', async () => {
  assert.equal(responseUsage(null), null);
  assert.equal(responseUsage({}).inputTokens, null);
  assert.equal(responseUsage({ input_tokens: -1 }).inputTokens, null);
  assert.equal(responseUsage({ output_tokens_details: {} }).reasoningOutputTokens, null);
  assert.equal(
    responseUsage({ output_tokens_details: { thinking_tokens: 7 } }).reasoningOutputTokens,
    7
  );
});

test('a saved Claude run records its measurement and source association', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-run-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedClaudeProfile({ parent });
  const discovered = await service.discoverUserSources(owned.context);
  const registered = await service.registerUserSources({
    context: owned.context,
    discoveryId: discovered.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: [],
    userAddedOptional: true
  });
  const { workspace } = registered;
  const plan = await service.planUserMode({ workspace, mode: 'trueform' });
  await service.applyUserPlan({ workspace, planId: plan.planId });

  const taskId = randomUUID().toLowerCase();
  const { mkdir } = await import('node:fs/promises');
  const directory = join(owned.context.claudeHome, 'projects', 'owned');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const w = await openWorkspace(workspace);
  const preparedAt = w.state.preparation.preparedAt;
  // The recording must start after preparation and before the observation.
  const at = (offsetMs) => new Date(Date.parse(preparedAt) + offsetMs).toISOString();
  const records = recording(taskId, [
    {
      turnId: 'b0000000-0000-4000-8000-000000000007',
      startedAt: at(1),
      responses: [
        {
          at: at(3),
          requestId: 'req-1',
          usage: usage(11, 22, { cacheRead: 5, cacheWrite: 6, thinking: 3 }),
          stop: 'end_turn',
          text: 'Recorded answer.'
        }
      ]
    }
  ]).map((r) => ({ ...r, cwd: owned.context.project }));
  records.unshift({
    ...base({ sessionId: taskId, cwd: owned.context.project }),
    type: 'attachment',
    uuid: 'a0000000-0000-4000-8000-000000000009',
    timestamp: at(1),
    attachment: {
      type: 'instructions',
      files: [
        { path: join(owned.context.claudeHome, 'CLAUDE.md'), type: 'User', content: '<!-- -->\n' }
      ]
    }
  });
  records.push({
    ...base({ sessionId: taskId, cwd: owned.context.project }),
    type: 'attachment',
    uuid: 'a0000000-0000-4000-8000-00000000000a',
    timestamp: at(2),
    attachment: { type: 'skill_listing', content: '', skillCount: 0, isInitial: true, names: [] }
  });
  await writeFile(
    join(directory, `${taskId}.jsonl`),
    records.map((r) => JSON.stringify(r)).join('\n') + '\n',
    { mode: 0o600 }
  );

  await new Promise((done) => setTimeout(done, 25));
  const review = await service.reviewUserRun({ workspace, taskId });
  assert.equal(review.measurement.app, 'claude-desktop');
  assert.equal(review.measurement.usage.totals.outputTokens, 22);
  assert.equal(review.source.issue, null);
  assert.ok(review.source.association, 'a matched observation associates the run');

  const saved = await service.saveUserRun({
    workspace,
    reviewId: review.reviewId,
    title: 'TRUEFORM baseline',
    assessment: {
      outcome: 'accepted',
      provenance: 'agent',
      requirements: [],
      ratings: []
    }
  });
  const read = await service.readUserRun({ workspace, runId: saved.runId });
  assert.equal(read.measurement.app, 'claude-desktop');
  assert.equal(read.assessment.outcome, 'accepted');
  assert.equal(read.title, 'TRUEFORM baseline');
  const output = await service.readUserRunOutput({ workspace, runId: saved.runId });
  assert.equal(output.available, true);
  assert.equal(output.text, 'Recorded answer.');
  const listed = await service.listUserRuns({ workspace });
  assert.equal(listed.runs.length, 1);
});
