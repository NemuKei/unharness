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

const declaration = {
  title: 'Synthetic start', request: 'PRIVATE REQUEST\r\nUse the original files.',
  requirements: [{ id: 'complete', label: 'All requested behavior works', critical: true }],
  ratings: [], budget: { maxAttempts: 2, maxTurnsPerAttempt: 3, maxRecordedTokens: null }
};
const mac = { skip: process.platform !== 'darwin' };
async function setup(t, built = false) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-start-http-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const profile = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const d = await service.discoverUserSources(profile.context);
  const { workspace } = await service.registerUserSources({ context: profile.context, discoveryId: d.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  const assetsDirectory = built ? resolve('dist') : join(parent, 'dist');
  if (!built) { await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>'); }
  const running = await startGuiServer({ manageSources: profile.context, assetsDirectory });
  t.after(() => running.close());
  const headers = { Origin: running.url, 'X-Unharness-Client': '1' };
  async function request(path, body, raw = false, overrides = {}) {
    const response = await fetch(running.url + '/api' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...overrides },
      body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
    });
    return { status: response.status, data: await response.json() };
  }
  headers['X-Unharness-Token'] = (await request('/bootstrap')).data.token;
  const metadata = (await request('/sources/metadata')).data;
  const body = (input = {}, id = randomUUID()) => ({ requestId: id, launchId: metadata.launchId, contextId: metadata.contextId, ...input });
  return { ...running, workspace, profile, metadata, body, request, post: (action, input, id) => request('/sources/' + action, body(input, id)) };
}
async function cli(action, args, raw = false) {
  let out = '', err = '';
  const code = await sourcesMain(['sources', action, '--json', raw ? args : JSON.stringify(args)],
    { stdout: { write: value => { out += value; } }, stderr: { write: value => { err += value; } } });
  return { code, data: out ? JSON.parse(out) : null, error: err ? JSON.parse(err).error : null };
}
test('CLI and HTTP share immutable start operations, private projections and duplicate identities', mac, async t => {
  const s = await setup(t);
  const reviewed = await cli('review-start', { workspace: s.workspace, declaration });
  assert.equal(reviewed.code, 0);
  assert.equal(JSON.stringify(reviewed.data).includes('PRIVATE REQUEST'), false);
  const id = randomUUID(), input = { reviewId: reviewed.data.reviewId };
  const saved = await s.post('save-start', input, id);
  assert.equal(saved.status, 200);
  assert.deepEqual((await s.post('save-start', input, id)).data.result, saved.data.result);
  assert.equal((await s.post('save-start', { reviewId: 'a'.repeat(64) }, id)).status, 409);
  const listed = await cli('starts', { workspace: s.workspace });
  assert.equal(listed.code, 0); assert.equal(listed.data.starts.length, 1);
  assert.equal(JSON.stringify(listed.data).includes('PRIVATE REQUEST'), false);
  const detail = await s.post('start', { startId: saved.data.result.startId });
  assert.equal(detail.status, 200); assert.deepEqual(detail.data.result.declaration, declaration);
  assert.equal(detail.data.result.files.some(f => Object.hasOwn(f, 'bytes')), false);
  assert.equal((await cli('start', { workspace: s.workspace, startId: saved.data.result.startId })).code, 0);
  assert.equal((await cli('save-start', { workspace: s.workspace, reviewId: reviewed.data.reviewId })).data.startId, saved.data.result.startId);
});
test('start requests reject arbitrary scope, stale context, duplicate decoded JSON keys and invalid UTF-8', mac, async t => {
  const s = await setup(t);
  for (const input of [
    { declaration, workspace: '/outside' }, { declaration, project: '/outside' },
    { declaration, mode: 'trueform' }, { declaration, contextId: 'a'.repeat(64) },
  ]) assert.notEqual((await s.post('review-start', input)).status, 200);
  const value = s.body({ declaration });
  const raw = JSON.stringify(value).replace('"request":', '"request":"wrong","\\u0072equest":');
  assert.equal((await s.request('/sources/review-start', raw, true)).status, 400);
  assert.equal((await cli('review-start', JSON.stringify({ workspace: s.workspace, declaration }).replace('"request":', '"request":"wrong","\\u0072equest":'), true)).code, 1);
  const text = JSON.stringify(value), position = text.indexOf('PRIVATE REQUEST');
  const invalid = Buffer.concat([Buffer.from(text.slice(0, position)), Buffer.from([255]), Buffer.from(text.slice(position + 1))]);
  assert.equal((await s.request('/sources/review-start', invalid, true)).status, 400);
  assert.equal((await s.request('/sources/review-start', value, false, { Origin: 'https://example.invalid' })).status, 403);
  assert.equal((await s.post('starts')).data.result.starts.length, 0);
});
test('long valid declarations fit the bounded start route and uncertain publications return an uncertain HTTP status', mac, async t => {
  const s = await setup(t);
  const long = { ...declaration, request: '実行前の依頼'.repeat(2000) };
  const reviewed = await s.post('review-start', { declaration: long });
  assert.equal(reviewed.status, 200);
  setSourceTransactionTestHook(phase => { if (phase === 'starting-save-recorded') throw Error('lost receipt'); });
  const saved = await s.post('save-start', { reviewId: reviewed.data.result.reviewId });
  assert.equal(saved.status, 500); assert.equal(saved.data.error.kind, 'starting-publication-uncertain');
  setSourceTransactionTestHook(null);
  const list = await s.post('starts'); assert.equal(list.data.result.starts.length, 1);
  assert.equal((await s.request('/sources/state')).data.source.recovery.pending, false);
});

test('built workbench freezes pre-use inputs and invalidates a reviewed draft when the request changes', {
  skip: process.platform !== 'darwin' ? 'Mac owned-source browser qualification' : !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Set UNHARNESS_PLAYWRIGHT_MODULE for the built-browser test'
}, async t => {
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const s = await setup(t, true);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  try {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  const pageErrors = []; page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(s.url);
  await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '比較', exact: true }).click();
  const panel = page.locator('.starting-conditions');
  await panel.locator(':scope > summary').click();
  await panel.getByLabel('条件の名前（任意）', { exact: true }).fill('Browser starter');
  await panel.getByLabel('依頼文', { exact: true }).fill('ORIGINAL REQUEST');
  await panel.getByLabel('必要な結果 1', { exact: true }).fill('Required output works');
  await panel.getByRole('button', { name: '保存内容を確認', exact: true }).click();
  const save = panel.getByRole('button', { name: 'この開始条件を保存', exact: true });
  await save.waitFor();
  await panel.getByLabel('依頼文', { exact: true }).fill('CHANGED REQUEST');
  assert.equal(await save.count(), 0);
  await panel.getByRole('button', { name: '保存内容を確認', exact: true }).click();
  await save.click();
  await panel.getByText('保存済み：Browser starter', { exact: true }).waitFor();
  const row = panel.locator('.starting-history li').filter({ hasText: 'Browser starter' });
  await row.getByRole('button', { name: '詳細を開く', exact: true }).click();
  assert.equal(await panel.locator('.starting-request').innerText(), 'CHANGED REQUEST');
  const list = await service.listUserStarts({ workspace: s.workspace });
  assert.equal(list.starts.length, 1);
  const saved = await service.readUserStart({ workspace: s.workspace, startId: list.starts[0].startId });
  assert.equal(saved.declaration.request, 'CHANGED REQUEST');
  assert.deepEqual(pageErrors, []);
  } finally { await browser.close(); }
});

const browserCase = { skip: process.platform !== 'darwin' ? 'Mac owned-source browser qualification' : !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Set UNHARNESS_PLAYWRIGHT_MODULE for the built-browser test' };
async function inBrowser(t, action) {
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const s = await setup(t, true);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  try {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
    const page = await context.newPage(); page.setDefaultTimeout(7000);
    await page.goto(s.url);
    await page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name: '比較', exact: true }).click();
    const panel = page.locator('.starting-conditions');
    await panel.locator(':scope > summary').click();
    await action(s, page, panel, context);
  } finally { await browser.close(); }
}
async function fillStart(panel, title, request = 'Frozen input') {
  await panel.getByLabel('条件の名前（任意）', { exact: true }).fill(title);
  await panel.getByLabel('依頼文', { exact: true }).fill(request);
  await panel.getByLabel('必要な結果 1', { exact: true }).fill('The result fulfills the request');
}
async function reviewStart(panel) {
  await panel.getByRole('button', { name: '保存内容を確認', exact: true }).click();
  await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).waitFor();
}
async function holdResponse(page, action) {
  let release, arrived;
  const gate = new Promise(resolve => { release = resolve; });
  const responseArrived = new Promise(resolve => { arrived = resolve; });
  const pattern = `**/api/sources/${action}`;
  await page.route(pattern, async route => {
    const response = await route.fetch(); arrived(); await gate; await route.fulfill({ response });
  });
  return { responseArrived, release, remove: () => page.unroute(pattern) };
}
test('built form discards a delayed obsolete review, clears its progress message and preserves a confirmed save after draft edits', browserCase, async t => {
  await inBrowser(t, async (s, page, panel) => {
    await fillStart(panel, 'Delayed start', 'OLD REQUEST');
    const held = await holdResponse(page, 'review-start');
    try {
      await panel.getByRole('button', { name: '保存内容を確認', exact: true }).click();
      await held.responseArrived;
      await panel.getByLabel('依頼文', { exact: true }).fill('NEW REQUEST');
    } finally { held.release(); }
    await page.waitForFunction(() => [...document.querySelectorAll('.starting-conditions button')].some(b => b.textContent === '保存内容を確認' && !b.disabled));
    assert.equal(await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).count(), 0);
    assert.equal(await panel.getByText('開始時のファイルを読み取り、内容を確認しています。', { exact: true }).count(), 0);
    await held.remove();
    await reviewStart(panel);
    const saved = await holdResponse(page, 'save-start');
    try {
      await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).click();
      await saved.responseArrived;
      await panel.getByLabel('依頼文', { exact: true }).fill('LATER DRAFT');
    } finally { saved.release(); }
    await panel.getByText('保存済み：Delayed start', { exact: true }).waitFor();
    assert.equal(await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).count(), 0);
    assert.equal(await panel.getByLabel('依頼文', { exact: true }).inputValue(), 'LATER DRAFT');
    const pageOfStarts = await service.listUserStarts({ workspace: s.workspace });
    assert.equal(pageOfStarts.starts.length, 1);
    assert.equal((await service.readUserStart({ workspace: s.workspace, startId: pageOfStarts.starts[0].startId })).declaration.request, 'NEW REQUEST');
  });
});
test('built form keeps confirmed saves through list failure and resolves a dropped save response through explicit history', browserCase, async t => {
  await inBrowser(t, async (s, page, panel) => {
    await fillStart(panel, 'Confirmed start'); await reviewStart(panel);
    await page.route('**/api/sources/starts', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { kind: 'operation-failed' } }) }));
    await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).click();
    await panel.getByText('保存済み：Confirmed start', { exact: true }).waitFor();
    await panel.getByText('保存は確認済みです。開始条件の一覧だけを更新できませんでした。', { exact: true }).waitFor();
    await page.unroute('**/api/sources/starts');
    await fillStart(panel, 'Uncertain start', 'SECOND REQUEST'); await reviewStart(panel);
    let writes = 0;
    await page.route('**/api/sources/save-start', async route => { writes++; await route.fetch(); await route.abort('failed'); });
    await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).click();
    await panel.getByRole('alert').filter({ hasText: '保存結果は未確認です。' }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await panel.getByText('保存済み：Confirmed start', { exact: true }).count(), 1);
    assert.equal((await service.listUserStarts({ workspace: s.workspace })).starts.length, 2);
    await page.unroute('**/api/sources/save-start');
    await page.route('**/api/sources/starts', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { kind: 'operation-failed' } }) }));
    await panel.getByRole('button', { name: '保存した開始条件を読む', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.starting-conditions button')].some(b => b.textContent === '保存した開始条件を読む' && !b.disabled));
    await page.unroute('**/api/sources/starts');
    await panel.getByRole('button', { name: '保存した開始条件を読む', exact: true }).click();
    await panel.getByText('保存済み：Uncertain start', { exact: true }).waitFor();
    assert.equal(writes, 1);
    assert.equal(await panel.getByRole('alert').count(), 0);
  });
});
test('built form clears drafts, reviews and explicit details after an actual same-port server relaunch', browserCase, async t => {
  await inBrowser(t, async (s, page, panel) => {
    await fillStart(panel, 'Before relaunch'); await reviewStart(panel);
    await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).click();
    await panel.getByText('保存済み：Before relaunch', { exact: true }).waitFor();
    await panel.locator('.starting-history li').getByRole('button', { name: '詳細を開く', exact: true }).click();
    await panel.locator('.starting-request').waitFor();
    const closing = s.close(); s.server.closeAllConnections(); await closing;
    const next = await startGuiServer({ manageSources: s.profile.context, assetsDirectory: resolve('dist'), port: Number(new URL(s.url).port) });
    t.after(() => next.close());
    await panel.getByRole('button', { name: '保存した開始条件を読む', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#starting-request-input')?.value === '');
    assert.equal(await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).count(), 0);
    assert.equal(await panel.locator('.starting-request').count(), 0);
    assert.equal(await panel.locator('.starting-history li').count(), 0);
    assert.equal(await panel.locator('.starting-saved').count(), 0);
  });
});

test('built form stops an old reviewed save when the same URL is rebound to another owned project and home', browserCase, async t => {
  await inBrowser(t, async (s, page, panel) => {
    await fillStart(panel, 'Old scope', 'PRIVATE OLD SCOPE REQUEST'); await reviewStart(panel);
    const other = await setup(t, true);
    await other.close();
    const closing = s.close(); s.server.closeAllConnections(); await closing;
    const next = await startGuiServer({ manageSources: other.profile.context, assetsDirectory: resolve('dist'), port: Number(new URL(s.url).port) });
    t.after(() => next.close());
    await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#starting-request-input')?.value === '');
    assert.equal(await panel.getByRole('button', { name: 'この開始条件を保存', exact: true }).count(), 0);
    assert.equal((await service.listUserStarts({ workspace: other.workspace })).starts.length, 0);
    assert.equal((await service.listUserStarts({ workspace: s.workspace })).starts.length, 0);
    assert.equal((await service.userSourceState({ workspace: other.workspace })).conflict, null);
  });
});
