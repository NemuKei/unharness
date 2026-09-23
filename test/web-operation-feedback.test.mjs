import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import packageInfo from '../package.json' with { type: 'json' };

const browserCase = {
  timeout: 60000,
  skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE
    && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks',
};

test('Modes keeps overview, preview, confirmation and saved versions close while navigation follows history', browserCase, async t => {
  const p = await aiProfile(t);
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.UNHARNESS_BROWSER_EXECUTABLE
      ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE }
      : {}),
  });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 536, height: 900 } });
  await context.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async text => { window.__copiedRequest = text; } }));
  const page = await context.newPage();
  const posts = [];
  page.on('request', request => {
    if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
  });
  await page.goto(gui.url);

  await page.getByRole('region', { name: '次のタスク用の準備', exact: true }).waitFor();
  assert.equal(await page.locator('.source-workbench').getAttribute('data-appearance'), 'default');
  const choices = page.getByLabel('モードを選択', { exact: true });
  await choices.getByRole('button', { name: /^零式/ }).click();
  await page.getByRole('heading', { name: '零式（TRUEFORM）の内容', exact: true }).waitFor();
  assert.equal(posts.filter(path => /\/(plan|apply)$/.test(path)).length, 0, 'previewing a mode never plans or applies it');
  await page.getByRole('region', { name: 'モード切替', exact: true }).getByRole('button', { name: '変更内容を確認', exact: true }).waitFor();
  await page.getByRole('region', { name: '保存した構成', exact: true }).waitFor();

  const nav = page.getByRole('navigation', { name: 'ワークベンチ', exact: true });
  await nav.locator('summary').click();
  await nav.getByRole('button', { name: '設定', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '#view=settings');
  const settings = page.getByRole('region', { name: '設定の流れ', exact: true });
  assert.equal(await settings.evaluate(element => getComputedStyle(element.closest('.workbench-pane')).animationName), 'ui-surface-in');
  assert.equal(await settings.evaluate(element => parseFloat(getComputedStyle(element.closest('.workbench-pane')).animationDuration)), 0.00001);
  for (const name of ['1. 保存内容を見る', '2. AIと相談する', '3. このMacで詳細を確認']) {
    await settings.getByRole('heading', { name, exact: true }).waitFor();
  }
  const updates = page.getByRole('region', { name: '更新情報', exact: true });
  assert.equal((await updates.innerText()).match(/表示中の画面版\s*([0-9.]+)/)?.[1], packageInfo.version);
  assert.match(await updates.innerText(), /導入版\s*未確認/);
  await updates.getByRole('button', { name: '更新をAIに確認', exact: true }).click();
  assert.match(await page.evaluate(() => window.__copiedRequest), /check_updates/);
  assert.match(await page.evaluate(() => window.__copiedRequest), /更新の適用はしない/);
  await page.goBack();
  await page.getByRole('region', { name: '次のタスク用の準備', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hash, '');
  await page.goForward(); await settings.waitFor(); assert.equal(new URL(page.url()).hash, '#view=settings');
  await page.goBack(); await page.getByRole('region', { name: '次のタスク用の準備', exact: true }).waitFor();
  await page.getByRole('button', { name: /^通常装備/ }).click();
  await page.getByRole('heading', { name: '通常装備（Normal）の内容', exact: true }).waitFor();

  const entered = Promise.withResolvers(), release = Promise.withResolvers(); t.after(() => release.resolve());
  await page.route('**/api/sources/mode-source', async route => { const response = await route.fetch(); entered.resolve(); await release.promise; await route.fulfill({ response }); });
  const readText = page.getByRole('button', { name: '指示の本文を読む', exact: true });
  await readText.waitFor();
  await readText.click(); await entered.promise;
  const refresh = page.getByRole('button', { name: '状態を再取得', exact: true });
  await refresh.click(); release.resolve(); await refresh.and(page.locator(':enabled')).waitFor();
  assert.equal(await page.getByText('本文を確認しています…', { exact: true }).count(), 0);
  await page.unroute('**/api/sources/mode-source'); await readText.click();
  await page.getByRole('region', { name: '保存した本文', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
});
