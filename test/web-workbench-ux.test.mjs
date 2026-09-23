import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, realpath, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

const browserCase = { timeout: 60000, skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Set the existing browser test runtime' };

test('a source conflict keeps a nearby AI state-check available without enabling a mode write', browserCase, async t => {
  const p = await aiProfile(t);
  await writeFile(join(p.context.codexHome, 'AGENTS.md'), '# Independent fixture change\n');
  const before = await readSourceProfileFiles(p.context);
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const posts = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.goto(gui.url);
  const actions = page.getByRole('region', { name: 'モード切替', exact: true });
  await actions.getByText('前に保存したときから設定が変わっています。安全のため、切り替えを止めています。', { exact: true }).waitFor();
  const choicesBox = await page.getByLabel('モードを選択', { exact: true }).boundingBox(), actionsBox = await actions.boundingBox();
  assert.ok(choicesBox && actionsBox && actionsBox.y - choicesBox.y - choicesBox.height <= 40, 'the reason and confirmation stay next to mode selection');
  assert.equal(await actions.getByRole('button', { name: 'この内容で確定する', exact: true }).isDisabled(), true);
  await actions.getByRole('button', { name: '状態の確認をAIに頼む', exact: true }).click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(prompt, /確認なしに設定変更/);
  assert.match(prompt, /新しい操作ID/);
  assert.ok(prompt.includes(p.scopeId));
  assert.match(prompt, /一致しない場合は別の接続で進めず/);
  assert.ok(!prompt.includes(p.context.codexHome));
  assert.deepEqual(await readSourceProfileFiles(p.context), before);
  assert.equal(posts.filter(path => /\/(apply|register|apply-setup|recover)$/.test(path)).length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.UNHARNESS_UX_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_UX_SCREENSHOT_DIR, { recursive: true });
    await actions.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.UNHARNESS_UX_SCREENSHOT_DIR, 'conflict-mobile.png') });
  }
});

test('initial setup is offered only after missing registration is confirmed and copying never registers sources', browserCase, async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-ux-initial-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const p = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async text => { window.__uxCopied = text; } }));
  const page = await context.newPage(), entered = Promise.withResolvers(), release = Promise.withResolvers(), posts = [];
  t.after(() => release.resolve());
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.route('**/api/sources/state', async route => {
    const response = await route.fetch({ headers: { ...route.request().headers(), Origin: gui.url } });
    assert.equal(response.status(), 200);
    entered.resolve(); await release.promise; await route.fulfill({ response });
  });
  await page.goto(gui.url); await entered.promise;
  assert.equal(await page.getByRole('button', { name: '初期設定をAIに頼む', exact: true }).count(), 0);
  release.resolve();
  await page.getByRole('heading', { name: '初期設定', exact: true }).waitFor();
  await page.getByRole('button', { name: '初期設定をAIに頼む', exact: true }).click();
  const prompt = await page.evaluate(() => window.__uxCopied);
  assert.match(prompt, /初回登録がまだなら、このMacの確認画面/);
  assert.ok(!prompt.includes(p.context.codexHome));
  assert.equal(posts.filter(path => /\/(register|apply|apply-setup)$/.test(path)).length, 0);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  if (process.env.UNHARNESS_UX_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_UX_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.UNHARNESS_UX_SCREENSHOT_DIR, 'initial-mobile.png') });
  }
});
