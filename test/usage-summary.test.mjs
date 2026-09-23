import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setupProfile } from '../test-support/setup-profile.mjs';
import { replayRecording } from '../test-support/replay-recording.mjs';
import { planUserMode, applyUserPlan, recoverUserSources } from '../src/sources/service.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { startGuiServer } from '../src/gui/server.mjs';

const history = await import('../src/sources/preparation-history.mjs').catch(() => ({}));
const usage = await import('../src/proposals/usage.mjs').catch(() => ({}));
const { appendPreparationHistory, readPreparationHistory, modeAt } = history;
const { usageSummary, recordedTotal } = usage;
const ago = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const item = (s, createdAt, total = 100) => ({ id: randomUUID(), name: 'Synthetic task', cwd: s.context.project,
  createdAt: Math.floor(Date.parse(createdAt) / 1000), updatedAt: Math.floor(Date.parse(createdAt) / 1000) + 20,
  source: 'vscode', parentThreadId: null, ephemeral: false, turns: [], total });
async function taskFixture(s, items) {
  await writeFile(join(s.context.codexHome, 'recent-tasks-fixture.json'), JSON.stringify({ response: { data: items.map(({ total, ...row }) => row), nextCursor: null } }));
  await mkdir(join(s.context.codexHome, 'sessions'), { recursive: true });
  for (const row of items) {
    const records = replayRecording({ taskId: row.id, project: s.context.project, createdAt: new Date(row.createdAt * 1000).toISOString() });
    if (row.total === null) records.splice(records.findIndex(record => record.type === 'token_usage_record'), 1);
    else for (const record of records.filter(record => record.type === 'token_usage_record')) {
      for (const key of ['usage', 'turn_token_usage', 'thread_token_usage']) {
        record.payload[key] = { total_tokens: row.total, input_tokens: row.total * 4 / 5, cached_input_tokens: 0,
          cache_write_input_tokens: 0, output_tokens: row.total / 5, reasoning_output_tokens: 0 };
      }
    }
    await writeFile(join(s.context.codexHome, 'sessions', `rollout-${row.id}.jsonl`), records.map(record => JSON.stringify(record)).join('\n') + '\n');
  }
}

test('preparation history appends immutable rows and selects the latest row before task start', async t => {
  const s = await setupProfile(t);
  assert.equal(typeof appendPreparationHistory, 'function');
  assert.deepEqual(await readPreparationHistory({ workspace: s.workspace }), []);
  const first = { mode: 'normal', revision: 0, preparedAt: ago(6) }, second = { mode: 'trueform', revision: 1, preparedAt: ago(4) };
  await appendPreparationHistory({ workspace: s.workspace, ...first });
  const earlier = await readFile(join(s.workspace, 'preparation-history.jsonl'), 'utf8');
  await appendPreparationHistory({ workspace: s.workspace, ...second });
  const later = await readFile(join(s.workspace, 'preparation-history.jsonl'), 'utf8');
  assert.ok(later.startsWith(earlier));
  assert.equal(later.trim().split('\n').length, 2);
  assert.deepEqual(await readPreparationHistory({ workspace: s.workspace }), [first, second]);
  assert.equal(modeAt([first, second], ago(7)), null);
  assert.equal(modeAt([first, second], ago(5)), 'normal');
  assert.equal(modeAt([first, second], ago(3)), 'trueform');
  const historical = { mode: 'favorite', revision: 2, preparedAt: ago(2) };
  await appendPreparationHistory({ workspace: s.workspace, ...historical });
  assert.equal(modeAt([first, second, historical], ago(1)), null, 'an older saved-version state must not inherit TRUEFORM usage');
});

test('successful mode application and restored state both append the effective preparation', async t => {
  const s = await setupProfile(t);
  t.after(() => setSourceTransactionTestHook(null));
  const first = await planUserMode({ workspace: s.workspace, mode: 'trueform' });
  await applyUserPlan({ workspace: s.workspace, planId: first.planId });
  const prepared = await openWorkspace(s.workspace), rows = await readPreparationHistory({ workspace: s.workspace });
  assert.deepEqual(rows.at(-1), { mode: 'trueform', revision: prepared.state.revision, preparedAt: prepared.state.preparation.preparedAt });
  const second = await planUserMode({ workspace: s.workspace, mode: 'normal' });
  setSourceTransactionTestHook(phase => { if (phase === 'state') throw Error('synthetic interrupted publication'); });
  await assert.rejects(applyUserPlan({ workspace: s.workspace, planId: second.planId }));
  setSourceTransactionTestHook(null);
  await recoverUserSources({ workspace: s.workspace });
  const restored = await openWorkspace(s.workspace), after = await readPreparationHistory({ workspace: s.workspace });
  assert.deepEqual(after.at(-1), { mode: 'trueform', revision: restored.state.revision, preparedAt: restored.state.preparation.preparedAt });
  assert.equal(after.length, 2);
});

test('usageSummary attributes synthetic completed tasks by their start time and recorded total', async t => {
  const s = await setupProfile(t);
  const normalAt = ago(6), trueformAt = ago(4);
  await appendPreparationHistory({ workspace: s.workspace, mode: 'normal', revision: 0, preparedAt: normalAt });
  await appendPreparationHistory({ workspace: s.workspace, mode: 'trueform', revision: 1, preparedAt: trueformAt });
  await taskFixture(s, [item(s, ago(5), 100), item(s, ago(3), 200)]);
  const result = await usageSummary({ workspace: s.workspace, days: 7 });
  assert.deepEqual(result.byMode.normal, { tasks: 1, perTask: 100 });
  assert.deepEqual(result.byMode.trueform, { tasks: 1, perTask: 200 });
  assert.equal(result.ratioToTrueform.normal, 0.5);
  assert.equal(result.ratioToTrueform.trueform, 1);
  assert.equal(result.availability, 'complete');
});

test('missing token totals and tasks before the first history row stay unknown, never zero', async t => {
  const s = await setupProfile(t);
  await appendPreparationHistory({ workspace: s.workspace, mode: 'trueform', revision: 1, preparedAt: ago(4) });
  await taskFixture(s, [item(s, ago(5), 300), item(s, ago(3), null)]);
  const result = await usageSummary({ workspace: s.workspace, days: 7 });
  assert.deepEqual(result.byMode.trueform, { tasks: 1, perTask: null });
  assert.equal(result.ratioToTrueform.trueform, null);
  assert.equal(result.availability, 'partial');
  assert.equal(recordedTotal({ usage: { totals: { totalTokens: null, inputTokens: 80, outputTokens: 20 }, availability: 'partial' } }, 'claude'), null);
  await taskFixture(s, []);
  const empty = await usageSummary({ workspace: s.workspace, days: 7 });
  assert.equal(empty.availability, 'none');
  assert.equal(empty.byMode.trueform.perTask, null);
});

test('local authenticated GUI reads a scoped usage summary without task text', async t => {
  const s = await setupProfile(t);
  await taskFixture(s, []);
  const assetsDirectory = join(s.parent, 'usage-assets');
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: s.context, assetsDirectory });
  t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1' };
  const boot = await fetch(gui.url + '/api/bootstrap', { headers });
  headers['X-Unharness-Token'] = (await boot.json()).token;
  const response = await fetch(gui.url + '/api/sources/usage', { headers });
  assert.equal(response.status, 200);
  const summary = await response.json();
  assert.equal(summary.availability, 'none');
  assert.ok(!JSON.stringify(summary).includes('PRIVATE'));
});
