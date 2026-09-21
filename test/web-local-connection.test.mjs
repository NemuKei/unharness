import { openWorkbenchPage } from '../test-support/workbench-navigation.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startGuiServer } from '../src/gui/server.mjs';
import { PUBLIC_WEB_ORIGIN } from '../src/gui/remote-policy.mjs';
import { CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

const browserCase = { timeout: 45000, skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE
  && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };
async function setup(t, { clipboardFails = false } = {}) {
  const cleanups = [], p = await aiProfile({ after: fn => cleanups.push(fn) });
  let time = Date.now();
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') }, { remoteNow: () => time });
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(async () => { await browser.close(); await gui.close(); for (const cleanup of cleanups) await cleanup(); });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
  if (clipboardFails) await context.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw Error('Synthetic clipboard refusal'); } }));
  const page = await context.newPage(), posts = [], errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (r.method() === 'POST') posts.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() }); });
  const headers = { Origin: PUBLIC_WEB_ORIGIN, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  const remote = async (action, body, token) => {
    const r = await fetch(gui.url + '/remote/v2/' + action, { method: 'POST', headers: { ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const snapshot = await readFile(join(p.workspace, 'state.json'));
  return { ...p, gui, page, browserContext: context, posts, errors, remote, snapshot, advance: ms => { time += ms; } };
}

test('an earlier pairing link opens the local workbench without creating or approving another public connection', browserCase, async t => {
  const s = await setup(t), { page } = s, ticket = await s.gui.requestPublicPairing();
  const redeem = { ticket: ticket.ticket, launchId: ticket.launchId, protocolVersion: 2 };
  await page.goto(s.gui.url + '/#pairing=' + ticket.pairingId);
  await page.getByText('公開画面への接続は不要になりました。このMacの画面で、そのまま使えます。', { exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  assert.equal(await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '公開画面と接続', exact: true }).count(), 0);
  assert.equal((await s.remote('redeem', redeem)).status, 401);
  await openWorkbenchPage(page, '記録・比較');
  await page.getByRole('heading', { name: '仕事の記録', exact: true }).waitFor();
  assert.equal(s.posts.filter(r => /\/remote\/(issue|approve)/.test(r.path)).length, 0);
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), s.snapshot);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(s.errors, []);
});

test('the local support screen reads earlier public results after expiry without replaying the operation', browserCase, async t => {
  const s = await setup(t), { page } = s, ticket = await s.gui.requestPublicPairing();
  // Simulate a connection already authorized by a previous release. The new UI
  // has no pairing/approval controls and only reads its saved operation below.
  const localHeaders = { Origin: s.gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  localHeaders['X-Unharness-Token'] = (await (await fetch(s.gui.url + '/api/bootstrap', { headers: localHeaders })).json()).token;
  const approved = await fetch(s.gui.url + '/api/remote/approve', { method: 'POST', headers: localHeaders,
    body: JSON.stringify({ requestId: randomUUID(), pairingId: ticket.pairingId }) });
  assert.equal(approved.status, 200);
  const exchanged = await s.remote('redeem', { ticket: ticket.ticket, launchId: ticket.launchId, protocolVersion: 2 });
  assert.equal(exchanged.status, 200);
  const operationId = randomUUID();
  const planned = await s.remote('plan', { requestId: operationId, mode: 'unseal', expectedRevision: 0 }, exchanged.data.token);
  assert.equal(planned.data.result.ok, true);
  s.advance(CONNECTION_TTL_MS);
  assert.equal((await s.remote('status', {}, exchanged.data.token)).status, 401);
  await page.goto(s.gui.url); await openWorkbenchPage(page, '接続・復旧');
  await page.getByText('公開画面での操作結果を確認', { exact: true }).click();
  await page.getByLabel('公開画面の操作ID', { exact: true }).fill(operationId);
  await page.getByRole('button', { name: '保存された結果を確認', exact: true }).click();
  await page.getByText('変更計画を作成した記録があります。この記録だけでは設定は変わっていません。', { exact: true }).waitFor();
  assert.equal(s.posts.filter(r => /\/(apply|plan|issue|approve|register|recover)$/.test(r.path)).length, 0);
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), s.snapshot);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(s.errors, []);
});
