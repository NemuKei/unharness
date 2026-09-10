import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { configurePlugin, openSavedPluginBinding } from '../src/setup/plugin-binding.mjs';
import { planUserMode, applyUserPlan, userSourceState } from '../src/sources/service.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';

const browserCase = { skip: process.platform !== 'darwin' ? 'Mac recovery UI' :
  !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };
async function setup(t) {
  const p = await aiProfile(t), dataDirectory = join(p.parent, 'data'); await mkdir(dataDirectory);
  const selected = await configurePlugin({ dataDirectory, workspace: p.workspace });
  const plan = await planUserMode({ workspace: p.workspace, mode: 'trueform' }); await applyUserPlan({ workspace: p.workspace, planId: plan.planId });
  const recoveryBinding = await openSavedPluginBinding({ directory: selected.directory, bindingId: selected.bindingId });
  const server = await startGuiServer({ recoveryBinding, assetsDirectory: resolve('dist') });
  t.after(() => server.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], urls = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', event => { if (event.type() === 'error' && !event.text().includes('status of 500') && !event.text().includes('status of 409')) errors.push(event.text()); });
  page.on('request', request => urls.push(request.url()));
  await page.goto(server.url);
  await page.getByRole('button', { name: '復帰内容を確認', exact: true }).waitFor();
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some(b => b.textContent === '復帰内容を確認' && !b.disabled));
  return { ...p, page, server, errors, urls };
}
async function screenshot(page, name) {
  if (!process.env.UNHARNESS_RECOVERY_SCREENSHOT_DIR) return;
  const directory = resolve(process.env.UNHARNESS_RECOVERY_SCREENSHOT_DIR); await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, name + '.png'), fullPage: true });
}

test('built recovery UI restores Normal at desktop and narrow widths using only local requests', browserCase, async t => {
  const p = await setup(t), { page } = p;
  assert.equal(await page.title(), 'Unharness');
  assert.equal(await page.getByRole('heading', { name: 'Normalへ、戻れる。' }).count(), 1);
  await page.getByRole('button', { name: '復帰内容を確認', exact: true }).click();
  await page.getByRole('button', { name: 'Normalへ戻す', exact: true }).waitFor();
  assert.equal(await page.getByText('Skillの読み込み設定', { exact: true }).count(), 1);
  await screenshot(page, 'normal-plan-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await screenshot(page, 'normal-plan-narrow');
  await page.getByRole('button', { name: 'Normalへ戻す', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Normalの保存ファイルへ戻しました。' }).waitFor();
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'normal');
  assert.ok(p.urls.every(url => new URL(url).origin === p.server.url));
  assert.deepEqual(p.errors, []);
});

test('independent edits and lost apply replies leave an explicit last-known state until readback', browserCase, async t => {
  const p = await setup(t), { page } = p;
  await page.getByRole('button', { name: '復帰内容を確認', exact: true }).click();
  await page.getByRole('button', { name: 'Normalへ戻す', exact: true }).waitFor();
  const path = join(p.context.codexHome, 'AGENTS.override.md'), original = await readFile(path);
  await writeFile(path, 'OWNED_INDEPENDENT_CHANGE');
  await page.getByRole('button', { name: 'Normalへ戻す', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '編集を残したまま停止しました' }).waitFor();
  assert.equal(await readFile(path, 'utf8'), 'OWNED_INDEPENDENT_CHANGE');
  assert.equal(await page.getByText('最後に確認した保存状態です。現在の状態は未確認です。', { exact: true }).count(), 1);
  await writeFile(path, original);
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.getByRole('button', { name: '復帰内容を確認', exact: true }).click();
  await page.getByRole('button', { name: 'Normalへ戻す', exact: true }).waitFor();
  let applies = 0;
  await page.route('**/api/sources/apply', async route => {
    applies++; await route.fetch();
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { kind: 'gui-operation-error' } }) });
  });
  await page.getByRole('button', { name: 'Normalへ戻す', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '操作の結果は未確認' }).waitFor();
  assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'normal');
  assert.equal(await page.getByText('最後に確認した保存状態です。現在の状態は未確認です。', { exact: true }).count(), 1);
  await screenshot(page, 'lost-response');
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '保存状態を確認しました' }).waitFor();
  assert.equal(await page.locator('.recovery-mode').textContent(), 'Normal');
  assert.equal(applies, 1);
  assert.deepEqual(p.errors, []);
});
