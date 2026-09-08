import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startGuiServer } from '../src/gui/server.mjs';
import * as service from '../src/sources/service.mjs';
import { sourcesMain } from '../src/sources/cli.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { replayRecording, replayTaskId } from '../test-support/replay-recording.mjs';
import { setReplayDesktopRunnerForTest } from '../src/codex/replay-desktop.mjs';
import { validReplayResponse } from '../web/src/replays.ts';
const mac = { skip: process.platform !== 'darwin' };
const declaration = { title: 'Replay UI', request: 'PRIVATE REPLAY REQUEST', requirements: [{ id: 'ready', label: 'Exactly READY', critical: true }],
  ratings: [], budget: { maxAttempts: 1, maxTurnsPerAttempt: 1, maxRecordedTokens: 4000 } };
async function setup(t, built = false) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-replay-http-')));
  t.after(() => rm(parent, { recursive: true, force: true })); t.after(() => setSourceTransactionTestHook(null));
  const profile = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const d = await service.discoverUserSources(profile.context);
  const { workspace } = await service.registerUserSources({ context: profile.context, discoveryId: d.discoveryId, instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  const review = await service.reviewUserStart({ workspace, declaration }), start = await service.saveUserStart({ workspace, reviewId: review.reviewId });
  const assetsDirectory = built ? resolve('dist') : join(parent, 'dist');
  if (!built) { await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>'); }
  const running = await startGuiServer({ manageSources: profile.context, assetsDirectory }); t.after(() => running.close());
  const headers = { Origin: running.url, 'X-Unharness-Client': '1' };
  async function request(path, body, raw = false, overrides = {}) {
    const response = await fetch(running.url + '/api' + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...overrides },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  }
  headers['X-Unharness-Token'] = (await request('/bootstrap')).data.token;
  const metadata = (await request('/sources/metadata')).data;
  const body = (input = {}, id = randomUUID()) => ({ requestId: id, launchId: metadata.launchId, contextId: metadata.contextId, ...input });
  return { ...running, workspace, profile, startId: start.startId, metadata, body, request, post: (action, input, id) => request('/sources/' + action, body(input, id)) };
}
async function cli(action, args, raw = false) {
  let out = '', err = '';
  const code = await sourcesMain(['sources', action, '--json', raw ? args : JSON.stringify(args)],
    { stdout: { write: v => { out += v; } }, stderr: { write: v => { err += v; } } });
  return { code, data: out ? JSON.parse(out) : null, error: err ? JSON.parse(err).error : null };
}
test('CLI and HTTP share replay preparation, handoff, outcome and cancellation identities', mac, async t => {
  const s = await setup(t), r = await cli('review-replay', { workspace: s.workspace, startId: s.startId });
  assert.equal(r.code, 0); assert.equal(JSON.stringify(r.data).includes('PRIVATE REPLAY REQUEST'), false);
  const id = randomUUID(), p = await s.post('prepare-replay', { reviewId: r.data.reviewId }, id);
  assert.equal(p.status, 200); assert.deepEqual((await s.post('prepare-replay', { reviewId: r.data.reviewId }, id)).data.result, p.data.result);
  const attemptId = p.data.result.attemptId;
  assert.equal((await cli('replay', { workspace: s.workspace, attemptId })).data.phase, 'prepared');
  const h = await s.post('handoff-replay', { attemptId }); assert.equal(h.data.result.request, declaration.request);
  const o = await s.post('observe-replay', { attemptId, taskId: randomUUID() }); assert.equal(o.status, 200);
  const saved = await cli('save-replay-result', { workspace: s.workspace, resultReviewId: o.data.result.resultReviewId,
    assessment: { outcome: 'abandoned', requirements: [{ id: 'ready', result: 'unknown' }], ratings: [], provenance: 'user' } });
  assert.equal(saved.code, 0); assert.equal(saved.data.assessment.outcome, 'abandoned');
  assert.equal((await s.post('replay-result', { resultId: saved.data.resultId })).data.result.resultId, saved.data.resultId);
  assert.equal((await s.post('replays')).data.result.activeAttemptId, null);
  assert.equal((await s.post('cancel-replay', { attemptId })).status, 400);
});
test('replay HTTP rejects stale contexts, arbitrary paths, duplicate decoded keys and unrelated origins', mac, async t => {
  const s = await setup(t);
  for (const extra of [{ project: '/outside' }, { workspace: s.workspace }, { mode: 'trueform' }, { readyAt: '2020-01-01' }, { contextId: 'a'.repeat(64) }])
    assert.notEqual((await s.post('review-replay', { startId: s.startId, ...extra })).status, 200);
  const raw = JSON.stringify(s.body({ startId: s.startId })).replace('"startId":', '"startId":"wrong","\\u0073tartId":');
  assert.equal((await s.request('/sources/review-replay', raw, true)).status, 400);
  const args = JSON.stringify({ workspace: s.workspace, startId: s.startId }).replace('"startId":', '"startId":"wrong","\\u0073tartId":');
  assert.equal((await cli('review-replay', args, true)).code, 1);
  assert.equal((await s.request('/sources/replays', s.body(), false, { Origin: 'https://example.invalid' })).status, 403);
});
test('uncertain replay mutations return HTTP 500 and remain inspectable without blocking Equipment', mac, async t => {
  const s = await setup(t), r = await s.post('review-replay', { startId: s.startId }); assert.equal(r.status, 200);
  setSourceTransactionTestHook(phase => { if (phase === 'replay-attempt-reserved') throw Error('lost receipt'); });
  const p = await s.post('prepare-replay', { reviewId: r.data.result.reviewId });
  assert.equal(p.status, 500); assert.equal(p.data.error.kind, 'replay-publication-uncertain'); setSourceTransactionTestHook(null);
  assert.equal((await s.post('replays')).data.result.attempts[0].phase, 'preparing');
  assert.equal((await s.request('/sources/state')).data.source.recovery.pending, false);
  const cancelled = await s.post('cancel-replay', { attemptId: r.data.result.reviewId }); assert.equal(cancelled.status, 200);
});

test('replay response guards bind requested identities and reject malformed nested data before rendering', mac, async t => {
  const s = await setup(t), r = await service.reviewUserReplay({ workspace: s.workspace, startId: s.startId });
  const p = await service.prepareUserReplay({ workspace: s.workspace, reviewId: r.reviewId });
  await service.handoffUserReplay({ workspace: s.workspace, attemptId: p.attemptId });
  const review = await service.observeUserReplay({ workspace: s.workspace, attemptId: p.attemptId, taskId: replayTaskId });
  const saved = await service.saveUserReplayResult({ workspace: s.workspace, resultReviewId: review.resultReviewId,
    assessment: { outcome: 'unknown', requirements: [{ id: 'ready', result: 'unknown' }], ratings: [], provenance: 'user' } });
  assert.equal(validReplayResponse('observe-replay', review, r.scopeId, { attemptId: p.attemptId, taskId: replayTaskId }), true);
  assert.equal(validReplayResponse('replay-result', saved, r.scopeId, { resultId: saved.resultId }), true);
  assert.equal(validReplayResponse('replay-result', saved, r.scopeId, { resultId: 'a'.repeat(64) }), false);
  assert.equal(validReplayResponse('prepare-replay', p, r.scopeId, { reviewId: 'b'.repeat(64) }), false);
  for (const mutate of [
    x => { x.criteria.requirements = [null]; }, x => { x.assessment.requirements = [null]; },
    x => { x.assessment.requirements[0].id = 'unrelated'; }, x => { delete x.assessment.ratings; },
    x => { x.files.totalBytes = {}; }, x => { x.budget.status = { toString: null }; },
    x => { x.qualification.reasons = [null]; }, x => { x.acceptance.accepted = 'yes'; },
    x => { x.criteria.ratings = [{ id: 'r', label: null }]; }, x => { x.sourceIssue = {}; },
    x => { x.measurement = { taskId: replayTaskId, usage: { totals: { totalTokens: {} } } }; },
  ]) {
    const broken = structuredClone(saved); mutate(broken);
    assert.equal(validReplayResponse('replay-result', broken, r.scopeId), false);
  }
  const page = await service.listUserReplays({ workspace: s.workspace });
  assert.equal(validReplayResponse('replays', page, r.scopeId), true);
  const changedScope = structuredClone(page); changedScope.attempts[0].scopeId = 'c'.repeat(64);
  assert.equal(validReplayResponse('replays', changedScope, r.scopeId), false);
});

const browserCase = { skip: process.platform !== 'darwin' ? 'Mac replay browser qualification'
  : !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Set UNHARNESS_PLAYWRIGHT_MODULE for the built-browser test' };
test('built Comparison prepares one replay, hands off its request, saves a qualified result and reopens its history', browserCase, async t => {
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const s = await setup(t, true), opened = [];
  setReplayDesktopRunnerForTest(async value => opened.push(value.args)); t.after(() => setReplayDesktopRunnerForTest(null));
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => { localStorage.setItem('unharness.effects.v1', 'off');
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.__replayClipboard = value; } } }); });
    const page = await context.newPage(); page.setDefaultTimeout(6000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(s.url); await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '比較', exact: true }).click();
    await page.getByText('実行前に条件を保存', { exact: true }).click();
    await page.getByRole('button', { name: '保存した開始条件を読む', exact: true }).click();
    await page.getByRole('button', { name: '詳細を開く', exact: true }).click();
    await page.getByRole('button', { name: 'この条件で再実行', exact: true }).click();
    await page.getByRole('button', { name: 'この内容で再実行を準備', exact: true }).click();
    await page.getByRole('button', { name: '開始状態を確認して依頼を受け取る', exact: true }).click();
    await page.getByRole('button', { name: '再実行の依頼をコピー', exact: true }).click();
    await page.getByText('再実行の依頼をコピーしました。', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__replayClipboard), declaration.request);
    await page.getByRole('button', { name: 'Codexで作業場所を開く', exact: true }).click();
    await page.getByText('作業場所をCodexに引き渡しました。', { exact: false }).waitFor();
    const h = (await s.post('replays')).data.result.activeAttempt; assert.deepEqual(opened, [['app', h.project]]);
    await mkdir(join(s.profile.context.codexHome, 'sessions'), { recursive: true });
    const rows = replayRecording({ taskId: replayTaskId, project: h.project, request: declaration.request,
      createdAt: new Date(Date.parse(h.readyAt) + 1).toISOString(), instructions: '# PRIVATE_TEST optional user guide\n\n--- project-doc ---\n\n# Required project instructions' });
    await writeFile(join(s.profile.context.codexHome, 'sessions', `rollout-${replayTaskId}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
    await writeFile(join(h.project, 'answer.txt'), 'READY');
    await page.getByLabel('再実行したタスクのUUID', { exact: true }).fill(replayTaskId);
    await page.getByRole('button', { name: 'このタスクの結果を確認', exact: true }).click();
    await page.getByText('記録上の条件が一致', { exact: true }).waitFor();
    await page.getByLabel('再実行の結果', { exact: true }).selectOption('accepted');
    await page.getByLabel('Exactly READY の結果', { exact: true }).selectOption('pass');
    await page.getByRole('button', { name: 'この再実行の結果を保存', exact: true }).click();
    await page.getByText('再実行の結果を保存しました。', { exact: false }).waitFor();
    assert.equal((await s.post('replays')).data.result.activeAttemptId, null);
    await page.getByLabel('Normalの再実行を比較に追加', { exact: true }).check();
    await page.getByRole('button', { name: '選んだ1件の再実行を比較', exact: true }).click();
    await page.getByRole('heading', { name: '再実行の記録を並べる', exact: true }).waitFor();
    await page.getByRole('button', { name: 'この試行の設定をお気に入りへ', exact: true }).click();
    await page.getByText('試行時の設定をお気に入りに保存しました。', { exact: false }).waitFor();
    assert.equal((await service.listUserFavorites({ workspace: s.workspace })).favorites.length, 1);
    await page.reload(); await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '比較', exact: true }).click();
    await page.getByRole('button', { name: '再実行の履歴を読む', exact: true }).click();
    await page.getByRole('button', { name: '再実行の結果を開く', exact: true }).click();
    await page.getByText('記録上の条件が一致', { exact: true }).waitFor();
    if (process.env.UNHARNESS_REPLAY_SCREENSHOT_DIR) {
      await mkdir(process.env.UNHARNESS_REPLAY_SCREENSHOT_DIR, { recursive: true });
      await page.locator('.replay-result').evaluate(el => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: join(process.env.UNHARNESS_REPLAY_SCREENSHOT_DIR, 'result-desktop.png') });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.replay-result').evaluate(el => el.scrollIntoView({ block: 'start' }));
    if (process.env.UNHARNESS_REPLAY_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.UNHARNESS_REPLAY_SCREENSHOT_DIR, 'result-mobile.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

async function inReplayBrowser(t, action) {
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const s = await setup(t, true);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(s.url);
    await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '比較', exact: true }).click();
    await page.getByText('実行前に条件を保存', { exact: true }).click();
    await page.getByRole('button', { name: '保存した開始条件を読む', exact: true }).click();
    await page.getByRole('button', { name: '詳細を開く', exact: true }).click();
    await page.getByRole('button', { name: 'この条件で再実行', exact: true }).click();
    const panel = page.locator('#replay-workbench');
    await panel.getByRole('button', { name: 'この内容で再実行を準備', exact: true }).waitFor();
    await action(s, page, panel);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
async function readyReplay(s, panel) {
  await panel.getByRole('button', { name: 'この内容で再実行を準備', exact: true }).click();
  await panel.getByRole('button', { name: '開始状態を確認して依頼を受け取る', exact: true }).click();
  await panel.getByRole('button', { name: '再実行の依頼をコピー', exact: true }).waitFor();
  const h = (await service.listUserReplays({ workspace: s.workspace })).activeAttempt;
  await mkdir(join(s.profile.context.codexHome, 'sessions'), { recursive: true });
  const rows = replayRecording({ taskId: replayTaskId, project: h.project, request: declaration.request,
    createdAt: new Date(Date.parse(h.readyAt) + 1).toISOString(), instructions: '# PRIVATE_TEST optional user guide\n\n--- project-doc ---\n\n# Required project instructions' });
  await writeFile(join(s.profile.context.codexHome, 'sessions', `rollout-${replayTaskId}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  return h;
}
async function observeReplay(panel, taskId = replayTaskId) {
  await panel.getByLabel('再実行したタスクのUUID', { exact: true }).fill(taskId);
  await panel.getByRole('button', { name: 'このタスクの結果を確認', exact: true }).click();
  await panel.locator('.replay-assessment').waitFor();
}
async function idle(panel) {
  await panel.getByRole('button', { name: '再実行の履歴を読む', exact: true }).evaluate(async button => {
    if (!button.disabled) return;
    await new Promise(resolve => { const observer = new MutationObserver(() => { if (!button.disabled) { observer.disconnect(); resolve(); } });
      observer.observe(button, { attributes: true, attributeFilter: ['disabled'] }); });
  });
}
const unavailable = route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { kind: 'operation-failed' } }) });
test('built replay discards an obsolete task response and preserves confirmed results through a history failure', browserCase, async t => {
  await inReplayBrowser(t, async (s, page, panel) => {
    await readyReplay(s, panel);
    let release, arrived;
    const gate = new Promise(resolve => { release = resolve; }), responseArrived = new Promise(resolve => { arrived = resolve; });
    await page.route('**/api/sources/observe-replay', async route => { const response = await route.fetch(); arrived(); await gate; await route.fulfill({ response }); });
    try {
      await panel.getByLabel('再実行したタスクのUUID', { exact: true }).fill(replayTaskId);
      await panel.getByRole('button', { name: 'このタスクの結果を確認', exact: true }).click();
      await responseArrived;
      await panel.getByLabel('再実行したタスクのUUID', { exact: true }).fill(randomUUID());
    } finally { release(); }
    await idle(panel);
    assert.equal(await panel.locator('.replay-assessment').count(), 0);
    assert.equal(await panel.getByText('タスクの記録と成果物を確認しています。', { exact: true }).count(), 0);
    await page.unroute('**/api/sources/observe-replay');
    await observeReplay(panel);
    await page.route('**/api/sources/replays', unavailable);
    await panel.getByRole('button', { name: 'この再実行の結果を保存', exact: true }).click();
    await panel.getByText('操作の完了は確認済みです。履歴だけを更新できませんでした。', { exact: true }).waitFor();
    assert.equal(await panel.locator('.starting-saved').count(), 1);
    assert.equal(await panel.getByRole('button', { name: 'この試行を取り消す', exact: true }).count(), 0);
    assert.equal(await panel.getByLabel('再実行したタスクのUUID', { exact: true }).count(), 0);
    await page.unroute('**/api/sources/replays');
    await panel.getByRole('button', { name: '再実行の履歴を読む', exact: true }).click();
    await panel.getByRole('button', { name: '再実行の結果を開く', exact: true }).waitFor();
    assert.equal(await panel.getByRole('alert').count(), 0);
  });
});
test('built replay resolves dropped prepare and save replies through explicit history without repeating writes', browserCase, async t => {
  await inReplayBrowser(t, async (s, page, panel) => {
    let prepares = 0, saves = 0;
    await page.route('**/api/sources/prepare-replay', async route => { prepares++; await route.fetch(); await route.abort('failed'); });
    await panel.getByRole('button', { name: 'この内容で再実行を準備', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: '操作結果は未確認です。' }).waitFor();
    assert.equal(prepares, 1); assert.equal((await service.listUserReplays({ workspace: s.workspace })).attempts.length, 1);
    await page.unroute('**/api/sources/prepare-replay');
    await panel.getByRole('button', { name: '再実行の履歴を読む', exact: true }).click();
    await panel.getByRole('button', { name: '開始状態を確認して依頼を受け取る', exact: true }).click();
    await observeReplay(panel, randomUUID());
    await page.route('**/api/sources/save-replay-result', async route => { saves++; await route.fetch(); await route.abort('failed'); });
    await panel.getByRole('button', { name: 'この再実行の結果を保存', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: '操作結果は未確認です。' }).waitFor();
    assert.equal(saves, 1); assert.equal((await service.listUserReplays({ workspace: s.workspace })).activeAttemptId, null);
    await page.unroute('**/api/sources/save-replay-result');
    await panel.getByRole('button', { name: '再実行の履歴を読む', exact: true }).click();
    await panel.getByRole('button', { name: '再実行の結果を開く', exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'この再実行の結果を保存', exact: true }).count(), 0);
    await panel.getByRole('button', { name: '再実行の結果を開く', exact: true }).click();
    await panel.getByText('保存した再実行の結果を開きました。', { exact: true }).waitFor();
    assert.equal(prepares, 1); assert.equal(saves, 1);
    await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '装備', exact: true }).click();
    await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
    assert.equal((await service.userSourceState({ workspace: s.workspace })).recovery.pending, false);
  });
});
test('built replay blocks a handoff after a second client changes modes, retaining Equipment and recovery', browserCase, async t => {
  await inReplayBrowser(t, async (s, page, panel) => {
    const h = await readyReplay(s, panel);
    const plan = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
    await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
    await panel.getByRole('button', { name: '再実行の依頼をコピー', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    assert.equal(await panel.locator('.replay-handoff').count(), 0);
    assert.equal((await service.readUserReplay({ workspace: s.workspace, attemptId: h.attemptId })).conditionIssue, 'replay-preparation-stale');
    await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '装備', exact: true }).click();
    await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
    assert.equal((await service.userSourceState({ workspace: s.workspace })).preparedMode, 'unseal');
    assert.equal((await service.userSourceState({ workspace: s.workspace })).recovery.pending, false);
  });
});
test('built replay clears private handoff state after same-port relaunch to another registered project', browserCase, async t => {
  await inReplayBrowser(t, async (s, page, panel) => {
    await readyReplay(s, panel);
    const other = await setup(t, true); await other.close();
    const closing = s.close(); s.server.closeAllConnections(); await closing;
    const next = await startGuiServer({ manageSources: other.profile.context, assetsDirectory: resolve('dist'), port: Number(new URL(s.url).port) });
    t.after(() => next.close());
    await panel.getByRole('button', { name: '再実行の依頼をコピー', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.replay-handoff'));
    assert.equal(await panel.locator('.replay-attempt').count(), 0);
    assert.equal(await panel.locator('.replay-history').count(), 0);
    assert.equal((await service.listUserReplays({ workspace: other.workspace })).attempts.length, 0);
    await panel.getByRole('button', { name: '再実行の履歴を読む', exact: true }).click();
    await panel.getByText('再実行の保存状態を読みました。', { exact: true }).waitFor();
  });
});
test('built replay rejects malformed nested result data without losing Equipment', browserCase, async t => {
  await inReplayBrowser(t, async (s, page, panel) => {
    await readyReplay(s, panel);
    await page.route('**/api/sources/observe-replay', async route => {
      const response = await route.fetch(), body = await response.json();
      body.result.criteria.requirements = [null];
      await route.fulfill({ response, json: body });
    });
    await panel.getByLabel('再実行したタスクのUUID', { exact: true }).fill(replayTaskId);
    await panel.getByRole('button', { name: 'このタスクの結果を確認', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: '再実行の応答を確認できません。' }).waitFor();
    assert.equal(await panel.locator('.replay-assessment').count(), 0);
    assert.equal(await panel.getByText('タスクの記録と成果物を確認しています。', { exact: true }).count(), 0);
    await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '装備', exact: true }).click();
    await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  });
});
