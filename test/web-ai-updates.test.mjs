import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { startGuiServer } from '../src/gui/server.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { replayRecording } from '../test-support/replay-recording.mjs';

const browserCase = { timeout: 45000, skip: process.platform !== 'darwin' ? 'Mac AI browser qualification'
  : !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };
async function setup(t) {
  const p = await aiProfile(t, { skills: false });
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  t.after(() => gui.close());
  const ai = await fixtureAiClient(t, p.workspace);
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], posts = [], consoleMessages = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text(), url: message.location().url }); });
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  const tab = name => page.getByRole('navigation', { name: 'ワークベンチ' }).getByRole('button', { name, exact: true }).click();
  const expectMode = mode => page.locator('.control-column .selected-name').filter({ hasText: mode }).waitFor();
  return { ...p, gui, ai, browser, browserContext: context, page, errors, posts, consoleMessages, tab, expectMode };
}

test('an open built GUI receives MCP modes, favorites and histories while preserving a request draft', browserCase, async t => {
  const s = await setup(t), { page, ai } = s;
  await page.goto(s.gui.url); await s.expectMode('Normal');
  assert.match(await page.title(), /Unharness/i);
  assert.equal(new URL(page.url()).origin, s.gui.url);
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  await ai.mutate('save_favorite', { name: 'AI side favorite' });
  await page.locator('.source-favorites').getByRole('button', { name: 'AI side favorite · Normal', exact: true }).waitFor();
  await page.getByRole('button', { name: /TRUEFORM/ }).click();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).and(page.locator(':enabled')).waitFor();
  await s.tab('比較');
  await page.getByText('実行前に条件を保存', { exact: true }).click();
  await page.getByLabel('依頼文', { exact: true }).fill('KEEP THIS UNSAVED REQUEST');
  await ai.mode('unseal');
  await s.tab('装備'); await s.expectMode('UNSEAL');
  assert.equal(await page.getByRole('button', { name: 'この計画で準備する', exact: true }).isDisabled(), true);
  await s.tab('比較');
  assert.equal(await page.getByLabel('依頼文', { exact: true }).inputValue(), 'KEEP THIS UNSAVED REQUEST');

  const declaration = { title: 'AI saved start', request: '  READY\n', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true }], ratings: [],
    budget: { maxAttempts: 2, maxTurnsPerAttempt: 1, maxRecordedTokens: 150 } };
  const review = await ai.mutate('review_start', { declaration }), start = await ai.mutate('save_start', { reviewId: review.reviewId });
  await page.locator('.starting-history').getByText('AI saved start', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('依頼文', { exact: true }).inputValue(), 'KEEP THIS UNSAVED REQUEST');

  const taskId = randomUUID(), instructions = (await readFile(join(s.context.codexHome, 'AGENTS.override.md'), 'utf8')).trim();
  const rows = replayRecording({ taskId, project: s.context.project, createdAt: new Date().toISOString(),
    instructions: instructions + '\n\n--- project-doc ---\n\n# Required project instructions' });
  await mkdir(join(s.context.codexHome, 'sessions'), { recursive: true });
  await writeFile(join(s.context.codexHome, 'sessions', `rollout-${taskId}.jsonl`), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  await new Promise(resolve => setTimeout(resolve, 25));
  const run = await ai.mutate('review_run', { taskId });
  await ai.mutate('save_run', { reviewId: run.reviewId, title: 'AI observed run',
    assessment: { outcome: 'accepted', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true, result: 'pass' }], ratings: [], provenance: 'agent' } });
  await page.getByText('AI observed run', { exact: true }).waitFor();
  const replay = await ai.mutate('review_replay', { startId: start.startId });
  const prepared = await ai.mutate('prepare_replay', { reviewId: replay.reviewId });
  await page.locator('.replay-history').getByText(/^作業場所の準備済み ／/).waitFor();
  await ai.mutate('cancel_replay', { attemptId: prepared.attemptId });
  await page.locator('.replay-history').getByText(/^取り消し済み ／/).waitFor();
  assert.equal(await page.getByLabel('依頼文', { exact: true }).inputValue(), 'KEEP THIS UNSAVED REQUEST');
  assert.equal(s.posts.filter(path => /save|apply|prepare|cancel|observe|review-start/.test(path)).length, 0);
  await ai.mode('normal'); await s.tab('装備'); await s.expectMode('Normal');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.consoleMessages.filter(message => message.type === 'error'), []);
  if (process.env.UNHARNESS_AI_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_AI_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.UNHARNESS_AI_SCREENSHOT_DIR, 'ai-updates-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(process.env.UNHARNESS_AI_SCREENSHOT_DIR, 'ai-updates-desktop.png') });
    await writeFile(join(process.env.UNHARNESS_AI_SCREENSHOT_DIR, 'ai-updates-console.json'), JSON.stringify(s.consoleMessages, null, 2));
  }
});

test('a delayed background snapshot cannot undo a completed GUI mode change or clear its next plan', browserCase, async t => {
  const s = await setup(t), { page } = s;
  let release, captured;
  const held = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { captured = resolve; });
  let first = true;
  await page.route('**/api/sources/updates?*', async route => {
    if (!first) return route.continue();
    first = false;
    const response = await route.fetch({ headers: { ...route.request().headers(), Origin: s.gui.url } });
    assert.equal(response.status(), 200);
    assert.equal((await response.json()).status, 'updated');
    captured();
    await held; await route.fulfill({ response });
  });
  t.after(() => release());
  await page.goto(s.gui.url); await s.expectMode('Normal');
  let deadline;
  try { await Promise.race([ready, new Promise((_, reject) => { deadline = setTimeout(() => reject(Error('background poll did not start')), 10000); })]); }
  finally { clearTimeout(deadline); }
  await page.getByRole('button', { name: /TRUEFORM/ }).click();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).click();
  await s.expectMode('TRUEFORM');
  const response = page.waitForResponse(r => r.url().includes('/api/sources/updates?'));
  release(); await response;
  assert.match(await page.locator('.control-column .selected-name').textContent(), /TRUEFORM/);
  await page.getByRole('button', { name: /Normal/ }).click();
  const nextPlan = page.getByRole('button', { name: 'この計画で準備する', exact: true });
  await nextPlan.and(page.locator(':enabled')).waitFor();
  await page.waitForResponse(r => r.url().includes('/api/sources/updates?'));
  assert.equal(await nextPlan.isEnabled(), true);
  await nextPlan.click(); await s.expectMode('Normal');
  assert.deepEqual(s.errors, []);
});

test('background readback does not confirm or repeat an uncertain GUI application', browserCase, async t => {
  const s = await setup(t), { page } = s;
  let drop = true;
  await page.route('**/api/sources/apply', async route => {
    if (!drop) return route.continue();
    drop = false;
    await route.fetch(); await route.abort('failed');
  });
  await page.goto(s.gui.url); await s.expectMode('Normal');
  await page.getByRole('button', { name: /TRUEFORM/ }).click();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).click();
  await page.getByText('結果は未確認です。状態を再取得してください。自動再送は行いません。', { exact: true }).first().waitFor();
  await s.expectMode('最後に確認した保存状態：TRUEFORM');
  assert.equal(s.posts.filter(path => path.endsWith('/apply')).length, 1);
  assert.equal(await page.getByRole('button', { name: 'この計画で準備する', exact: true }).isDisabled(), true);
  await s.ai.mode('normal'); await s.expectMode('最後に確認した保存状態：Normal');
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.locator('.control-column .selected-name').filter({ hasText: /^Normal$/ }).waitFor();
  assert.deepEqual(s.errors, []);
});

test('malformed background history leaves Equipment usable and retries without losing the current source view', browserCase, async t => {
  const s = await setup(t), { page } = s;
  let corrupt = true;
  await page.route('**/api/sources/updates?*', async route => {
    const response = await route.fetch({ headers: { ...route.request().headers(), Origin: s.gui.url } }), value = await response.json();
    assert.equal(response.status(), 200);
    if (corrupt && value.status === 'updated') value.history.runs.data.runs = [null];
    await route.fulfill({ response, json: value });
  });
  await page.goto(s.gui.url); await s.expectMode('Normal');
  await page.getByText('一部の履歴を更新できません。各欄で読み直せます。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /TRUEFORM/ }).isEnabled(), true);
  await s.tab('比較');
  const warning = page.getByText('通常利用の履歴を自動更新できません。履歴を読み直してください。', { exact: true });
  await warning.waitFor();
  corrupt = false;
  await warning.waitFor({ state: 'hidden' });
  await s.ai.mode('unseal'); await s.tab('装備'); await s.expectMode('UNSEAL');
  assert.deepEqual(s.errors, []);
  await s.ai.mode('normal');
});

test('a same-port replacement stays unaccepted until the user refreshes the new context', browserCase, async t => {
  const s = await setup(t), { page } = s;
  await page.goto(s.gui.url); await s.expectMode('Normal');
  await s.tab('比較'); await page.getByText('実行前に条件を保存', { exact: true }).click();
  await page.getByLabel('依頼文', { exact: true }).fill('DRAFT IN ORIGINAL SCOPE');
  await s.tab('装備');
  const second = await aiProfile(t, { skills: false });
  await s.gui.close();
  const replacement = await startGuiServer({ manageSources: second.context, assetsDirectory: resolve('dist'), port: Number(new URL(s.gui.url).port) });
  t.after(() => replacement.close());
  await page.getByText('接続先が変わりました。「状態を再取得」で対象を確認してください。', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /TRUEFORM/ }).isDisabled(), true);
  const before = s.posts.length;
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.getByRole('button', { name: /TRUEFORM/ }).and(page.locator(':enabled')).waitFor();
  assert.equal(s.posts.length, before);
  await s.tab('比較'); await page.getByText('実行前に条件を保存', { exact: true }).click();
  assert.equal(await page.getByLabel('依頼文', { exact: true }).inputValue(), '');
  assert.deepEqual(s.errors, []);
});
