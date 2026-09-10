import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { startGuiServer } from '../src/gui/server.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

const browserCase = { timeout: 45000, skip: process.platform !== 'darwin' ? 'Mac setup browser qualification'
  : !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };
async function fixture(t, { clipboardFails = false } = {}) {
  const p = await aiProfile(t), gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
  if (clipboardFails) await context.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw Error('Synthetic clipboard failure'); } }));
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], posts = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (r.method() === 'POST') posts.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() }); });
  await page.goto(gui.url);
  await page.getByRole('button', { name: 'AIと初期設定を作る', exact: true }).waitFor();
  assert.match(await page.title(), /Unharness/i);
  assert.equal(new URL(page.url()).origin, gui.url);
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  return { ...p, gui, page, browserContext: context, errors, posts };
}

test('initial setup and fresh-task handoffs are copyable, bounded, and do not prepare a mode', browserCase, async t => {
  const s = await fixture(t), { page } = s;
  const before = await readFile(join(s.workspace, 'state.json'));
  await page.getByRole('button', { name: 'AIと初期設定を作る', exact: true }).click();
  assert.equal(await page.getByLabel('零式で初期設定を見直す（推奨）').isChecked(), true);
  const prompt = await page.getByLabel('設定相談の依頼文', { exact: true }).inputValue();
  assert.ok(prompt.indexOf('退避') < prompt.indexOf('確認済みの対象だけを準備'));
  assert.ok(prompt.includes(s.normalId));
  assert.ok(!prompt.includes(s.context.codexHome));
  assert.ok(!prompt.includes(s.context.project));
  assert.ok(!prompt.includes('PRIVATE_TEST'));
  await page.locator('.setup-handoff').getByRole('button', { name: '依頼文をコピー', exact: true }).click();
  await page.getByText('コピーしました。AIの入力欄に貼り付けて送信してください。', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), prompt);
  await page.getByLabel('現在の構成から相談する', { exact: true }).check();
  assert.match(await page.getByLabel('設定相談の依頼文', { exact: true }).inputValue(), /自動で零式へ切り替えない/);
  assert.equal(await page.getByText('コピーしました。AIの入力欄に貼り付けて送信してください。', { exact: true }).count(), 0);
  await page.getByText('この設定で新しいタスクを始める', { exact: true }).click();
  assert.match(await page.getByLabel('新しいタスクへの依頼文', { exact: true }).inputValue(), /古いタスク/);
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), before);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.filter(r => /\/(plan|apply|register|review-setup|apply-setup|recover)$/.test(r.path)).length, 0);
  assert.deepEqual(s.errors, []);
  if (process.env.UNHARNESS_SETUP_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_SETUP_SCREENSHOT_DIR, { recursive: true });
    await page.locator('.setup-handoff').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.UNHARNESS_SETUP_SCREENSHOT_DIR, 'setup-desktop.png') });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.setup-handoff').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const choices = await page.locator('.setup-conversation fieldset label span').evaluateAll(elements => elements.map(e => {
    const r = e.getBoundingClientRect(); return { right: r.right, width: r.width, height: r.height, viewport: innerWidth };
  }));
  assert.equal(choices.length, 2);
  assert.ok(choices.every(c => c.right <= c.viewport && c.width > 120 && c.height < 80), JSON.stringify(choices));
  if (process.env.UNHARNESS_SETUP_SCREENSHOT_DIR) await page.screenshot({ path: join(process.env.UNHARNESS_SETUP_SCREENSHOT_DIR, 'setup-mobile.png') });
});

test('clipboard failure leaves a selectable prompt and source conflicts suspend handoffs', browserCase, async t => {
  const s = await fixture(t, { clipboardFails: true }), { page } = s;
  await page.getByRole('button', { name: 'AIと初期設定を作る', exact: true }).click();
  await page.locator('.setup-handoff').getByRole('button', { name: '依頼文をコピー', exact: true }).click();
  await page.getByText('コピーできませんでした。上の依頼文を選択してコピーしてください。', { exact: true }).waitFor();
  const selection = await page.getByLabel('設定相談の依頼文', { exact: true }).evaluate(e => ({ active: e === document.activeElement, count: e.selectionEnd - e.selectionStart, length: e.value.length }));
  assert.equal(selection.active, true); assert.equal(selection.count, selection.length);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(s.context.codexHome, 'AGENTS.md'), '# An independent edit\n');
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.getByText(/外部の変更を確認してください/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'AIと初期設定を作る', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('設定相談の依頼文', { exact: true }).count(), 0);
  assert.deepEqual(s.errors, []);
});

test('MCP-adopted presets refresh the open GUI and TRUEFORM prepares manual invocation with truthful copy', browserCase, async t => {
  const s = await fixture(t), { page } = s, ai = await fixtureAiClient(t, s.workspace);
  const skills = s.sources.filter(source => source.id.startsWith('skill-'));
  const proposal = { schemaVersion: 1, scopeId: s.scopeId, normalId: s.normalId,
    basis: { application: 'codex', modelId: 'gpt-6-astra', modelSource: 'user-specified', desktopVersion: null, runtimeVersion: '0.153.4',
      references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model', title: 'Official guide', checkedAt: '2026-09-09T00:00:00.000Z' }], rationale: 'Reviewed synthetic proposal.' },
    roles: skills.map(skill => ({ sourceId: skill.id, origin: 'self', reason: 'Explicit synthetic decision.' })),
    unseal: { instructions: 'minimal', automaticSkillIds: skills.map(skill => skill.id) }, trueform: { automaticExternalSkillIds: [] } };
  const review = await ai.mutate('review_setup', { proposal });
  const saved = await ai.mutate('apply_setup', { reviewId: review.reviewId });
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).waitFor();
  assert.equal(await page.getByText('対象を調整', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).click();
  assert.equal(await page.getByLabel('現在の構成から相談する', { exact: true }).isChecked(), true);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await page.getByRole('button', { name: /TRUEFORM/ }).click();
  const apply = page.getByRole('button', { name: 'この計画で準備する', exact: true });
  await apply.and(page.locator(':enabled')).waitFor();
  await page.getByText('選んだ追加指示を外す。自作Skillは明示的に呼び出す。', { exact: true }).waitFor();
  const request = s.posts.findLast(r => r.path.endsWith('/plan')).body;
  assert.equal(request.selectedIds, undefined);
  await apply.click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'TRUEFORM' }).waitFor();
  assert.match((await readSourceProfileFiles(s.context)).policy.text, /allow_implicit_invocation: false/);
  const status = await ai.call('read_setup');
  assert.equal(status.preparedSetupId, saved.setupId);
  assert.deepEqual(s.errors, []);
});
