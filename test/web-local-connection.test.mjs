import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startGuiServer } from '../src/gui/server.mjs';
import { PUBLIC_WEB_ORIGIN } from '../src/gui/remote-policy.mjs';
import { PAIRING_TTL_MS } from '../src/gui/pairing.mjs';
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
    const r = await fetch(gui.url + '/remote/v1/' + action, { method: 'POST', headers: { ...headers, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, data: await r.json() };
  };
  const snapshot = await readFile(join(p.workspace, 'state.json'));
  return { ...p, gui, page, browserContext: context, posts, errors, remote, snapshot, advance: ms => { time += ms; } };
}

test('AI-issued local handoff requires visible approval, permits cancellation, and retains old operation lookup', browserCase, async t => {
  const s = await setup(t), { page } = s, ticket = await s.gui.requestPublicPairing();
  const redeem = { ticket: ticket.ticket, launchId: ticket.launchId, protocolVersion: 1 };
  assert.equal((await s.remote('redeem', redeem)).status, 401);
  await page.goto(s.gui.url + '/#pairing=' + ticket.pairingId);
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  assert.match(await page.title(), /Unharness/i);
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'このMacへの接続許可' }).evaluate(e => document.activeElement === e), true);
  assert.equal(await page.getByRole('link', { name: '公開画面を開く', exact: true }).count(), 0);
  await page.getByText(PUBLIC_WEB_ORIGIN, { exact: true }).waitFor();
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).click();
  const link = page.getByRole('link', { name: '公開画面を開く', exact: true }); await link.waitFor();
  const url = new URL(await link.getAttribute('href')), fragment = new URLSearchParams(url.hash.slice(1));
  assert.equal(url.origin, PUBLIC_WEB_ORIGIN); assert.equal(fragment.get('ticket'), ticket.ticket);
  assert.equal(fragment.get('port'), new URL(s.gui.url).port);
  if (process.env.UNHARNESS_CONNECTION_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_CONNECTION_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.UNHARNESS_CONNECTION_SCREENSHOT_DIR, 'connection-approval-desktop.png') });
  }
  const exchanged = await s.remote('redeem', redeem); assert.equal(exchanged.status, 200);
  await page.getByText('接続中', { exact: true }).waitFor();
  assert.equal(await link.count(), 0);
  await page.reload(); await page.getByText('接続中', { exact: true }).waitFor();
  const storage = await page.evaluate(() => ({ session: JSON.stringify(sessionStorage), local: JSON.stringify(localStorage) }));
  assert.ok(!JSON.stringify(storage).includes(ticket.ticket)); assert.ok(!JSON.stringify(storage).includes(exchanged.data.token));
  const operationId = randomUUID();
  const planned = await s.remote('plan', { requestId: operationId, mode: 'unseal', expectedRevision: 0 }, exchanged.data.token);
  assert.equal(planned.data.result.ok, true, JSON.stringify(planned.data));
  await page.getByRole('button', { name: '接続許可を取り消す', exact: true }).click();
  await page.getByText('無効', { exact: true }).waitFor();
  assert.equal((await s.remote('status', {}, exchanged.data.token)).status, 401);
  await page.getByText('公開画面での操作結果を確認', { exact: true }).click();
  await page.getByLabel('公開画面の操作ID', { exact: true }).fill(operationId);
  await page.getByRole('button', { name: '保存された結果を確認', exact: true }).click();
  await page.getByText('変更計画を作成した記録があります。この記録だけでは設定は変わっていません。', { exact: true }).waitFor();
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), s.snapshot);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.filter(r => /\/sources\/(apply|plan|register|recover)/.test(r.path)).length, 0);
  assert.deepEqual(s.errors, []);
});

test('lost issuance is retried with the same ID; clipboard fallback, mobile, expiry and refusal remain usable', browserCase, async t => {
  const s = await setup(t, { clipboardFails: true }), { page } = s;
  await page.goto(s.gui.url);
  await page.getByRole('button', { name: '公開画面と接続', exact: true }).click();
  let drop = true;
  await page.route('**/api/remote/issue', async route => {
    if (drop) { drop = false; await route.fetch(); await route.abort(); } else await route.continue();
  });
  await page.getByRole('button', { name: '接続許可を確認する', exact: true }).click();
  await page.getByRole('button', { name: '同じ操作の結果を確認', exact: true }).click();
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).waitFor();
  const issued = s.posts.filter(r => r.path === '/api/remote/issue');
  assert.equal(issued.length, 2); assert.deepEqual(issued[0].body, issued[1].body);
  await page.route('**/api/remote/approve', async route => { await route.fetch(); await route.abort(); });
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).click();
  await page.getByRole('link', { name: '公開画面を開く', exact: true }).waitFor();
  await page.getByText('Codex内ブラウザーへ接続用リンクを渡す', { exact: true }).click();
  await page.getByRole('button', { name: '接続用リンクをコピー', exact: true }).click();
  await page.getByText('コピーできませんでした。接続用リンクを選択してコピーしてください。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('接続用リンク', { exact: true }).evaluate(e => document.activeElement === e && e.selectionEnd - e.selectionStart === e.value.length), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('heading', { name: 'このMacへの接続許可' }).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.UNHARNESS_CONNECTION_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.UNHARNESS_CONNECTION_SCREENSHOT_DIR, 'connection-approval-mobile.png') });
  s.advance(PAIRING_TTL_MS);
  await page.getByText('期限切れ', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '公開画面を開く', exact: true }).count(), 0);
  await page.getByRole('button', { name: '接続許可を確認する', exact: true }).click();
  await page.getByRole('button', { name: '許可しない', exact: true }).click();
  await page.getByText('無効', { exact: true }).waitFor();
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(s.errors.filter(e => !e.includes('net::ERR_FAILED')), []);
});

test('unconfirmed polling hides the approved link and fresh state must restore it', browserCase, async t => {
  const s = await setup(t), { page } = s, ticket = await s.gui.requestPublicPairing();
  await page.goto(s.gui.url + '/#pairing=' + ticket.pairingId);
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).click();
  await page.getByRole('link', { name: '公開画面を開く', exact: true }).waitFor();
  await page.route('**/api/remote/details', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ pairingId: ticket.pairingId, status: 'connected', connection: { token: 'unexpected' } }) }));
  await page.getByText('接続状態を確認できません。接続用リンクと許可操作を停止しています。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: '公開画面を開く', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).count(), 0);
  await page.unroute('**/api/remote/details');
  await page.getByRole('link', { name: '公開画面を開く', exact: true }).waitFor();
  await page.getByRole('button', { name: '公開画面と接続', exact: true }).click();
  await page.locator('a.wordmark').click();
  assert.equal(new URL(page.url()).hash, '#main');
  assert.equal(await page.getByRole('heading', { name: 'このMacへの接続許可' }).count(), 0);
  assert.deepEqual(s.errors, []);
});

test('expiry while approval is dispatched ends pending verification without issuing a replacement automatically', browserCase, async t => {
  const s = await setup(t), { page } = s, ticket = await s.gui.requestPublicPairing();
  await page.goto(s.gui.url + '/#pairing=' + ticket.pairingId);
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).waitFor();
  await page.route('**/api/remote/approve', async route => { s.advance(PAIRING_TTL_MS); await route.continue(); });
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).click();
  await page.getByText('期限切れ', { exact: true }).waitFor();
  await page.getByRole('button', { name: '接続許可を確認する', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '同じ操作の結果を確認', exact: true }).count(), 0);
  assert.equal(s.posts.filter(r => r.path === '/api/remote/issue').length, 0);
  assert.equal((await s.remote('redeem', { ticket: ticket.ticket, launchId: ticket.launchId, protocolVersion: 1 })).status, 401);
  await page.getByRole('button', { name: '接続許可を確認する', exact: true }).click();
  await page.getByRole('button', { name: 'このサイトへの接続を許可', exact: true }).waitFor();
  assert.equal(s.posts.filter(r => r.path === '/api/remote/issue').length, 1);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});
