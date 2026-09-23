import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { openWorkspace, record } from '../src/sources/records.mjs';
import { planUserMode, applyUserPlan, recoverUserSources, userSourceState,
  reviewUserStart, saveUserStart, readUserStart } from '../src/sources/service.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { createRequestLedger } from '../src/ai/requests.mjs';
import { inspectReplayRepository } from '../src/experiments/repository.mjs';
import { loadReplayIndex } from '../src/experiments/replay-index.mjs';
import { loadReplaySeries } from '../src/experiments/replay-records.mjs';
import { startGuiServer } from '../src/gui/server.mjs';

test('historical public receipts and replay records survive status, switching and recovery unchanged', async t => {
  const p = await aiProfile(t);
  const connectionId = randomUUID(), requestId = randomUUID();
  const ledger = await createRequestLedger({ workspace: p.workspace, connectionId });
  await ledger.execute({ connectionId, requestId, action: 'remote-plan', input: { mode: 'normal' } },
    () => ({ ok: true, data: { mode: 'normal' } }));
  const receiptPath = join(p.workspace, 'ai-requests', requestId, 'result.json');
  const publicReceipt = await readFile(receiptPath);
  const startReview = await reviewUserStart({ workspace: p.workspace,
    declaration: { request: 'Synthetic saved task', requirements: [{ id: 'done', label: 'Done', critical: true }], ratings: [],
      budget: { maxAttempts: 1, maxTurnsPerAttempt: 1, maxRecordedTokens: null } } });
  const start = await saveUserStart({ workspace: p.workspace, reviewId: startReview.reviewId });
  const startPath = join(p.workspace, 'records', 'experiment', `${start.startId}.json`);
  const startRecord = await readFile(startPath);
  const replayRecordId = await record(p.workspace, 'experiment', { role: 'replay-series', schemaVersion: 1,
    scopeId: p.scopeId, startId: start.startId, pinnedAt: '2026-01-01T00:00:00.000Z',
    repository: await inspectReplayRepository({ project: p.context.project }) });
  const replayIndexPath = join(p.workspace, 'replay-index.json');
  const replayIndex = Buffer.from(JSON.stringify({ kind: 'unharness-replay-index', schemaVersion: 1,
    scopeId: p.scopeId, revision: 1, series: [{ startId: start.startId, seriesId: replayRecordId }],
    attempts: [], activeAttemptId: null }));
  await writeFile(replayIndexPath, replayIndex);
  const replayRecordPath = join(p.workspace, 'records', 'experiment', `${replayRecordId}.json`);
  const replayRecord = await readFile(replayRecordPath);
  assert.equal((await loadReplayIndex(await openWorkspace(p.workspace))).data.series[0].seriesId, replayRecordId);
  assert.equal((await loadReplaySeries(await openWorkspace(p.workspace), replayRecordId)).startId, start.startId);
  t.after(() => setSourceTransactionTestHook(null));

  assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'normal');
  const first = await planUserMode({ workspace: p.workspace, mode: 'unseal' });
  await applyUserPlan({ workspace: p.workspace, planId: first.planId });
  assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'unseal');
  const second = await planUserMode({ workspace: p.workspace, mode: 'normal' });
  setSourceTransactionTestHook(phase => { if (phase === 'staged') throw Error('synthetic interruption'); });
  await assert.rejects(applyUserPlan({ workspace: p.workspace, planId: second.planId }));
  setSourceTransactionTestHook(null);
  await recoverUserSources({ workspace: p.workspace });
  assert.equal((await openWorkspace(p.workspace)).state.preparedMode, 'unseal');
  assert.equal((await readUserStart({ workspace: p.workspace, startId: start.startId })).declaration.request, 'Synthetic saved task');
  assert.deepEqual(await readFile(receiptPath), publicReceipt);
  assert.deepEqual(await readFile(startPath), startRecord);
  assert.deepEqual(await readFile(replayIndexPath), replayIndex);
  assert.deepEqual(await readFile(replayRecordPath), replayRecord);
});

test('public site build excludes public pairing and operation controls', async () => {
  await promisify(execFile)('npm', ['run', 'build:site'], { cwd: process.cwd(), timeout: 120000 });
  const assets = await readdir(join(process.cwd(), 'site-dist', 'assets'));
  const scripts = (await Promise.all(assets.filter(name => name.endsWith('.js'))
    .map(name => readFile(join(process.cwd(), 'site-dist', 'assets', name), 'utf8')))).join('\n');
  const styles = (await Promise.all(assets.filter(name => name.endsWith('.css'))
    .map(name => readFile(join(process.cwd(), 'site-dist', 'assets', name), 'utf8')))).join('\n');
  for (const marker of ['unharness_operation_status', 'remote-pairing-unavailable', 'public-operation-notice',
    '以前の接続・操作結果を確認']) assert.ok(!scripts.includes(marker), marker);
  for (const marker of ['.pairing-start', '.public-operation', '.public-connection-bar', '.public-tool-note'])
    assert.ok(!styles.includes(marker), marker);
});

test('local HTTP no longer serves public pairing or replay actions', async t => {
  const p = await aiProfile(t);
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: join(process.cwd(), 'dist') });
  t.after(() => gui.close());
  assert.equal((await fetch(gui.url + '/remote/v2/status')).status, 404);
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  const token = (await (await fetch(gui.url + '/api/bootstrap', { headers })).json()).token;
  const body = JSON.stringify({ requestId: randomUUID() });
  for (const path of ['/api/remote/approve', '/api/sources/replays', '/api/sources/prepare-replay']) {
    const response = await fetch(gui.url + path, { method: 'POST', headers: { ...headers, 'X-Unharness-Token': token }, body });
    assert.notEqual(response.status, 200, path);
  }
});
