import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupProfile, addSetupSkill } from '../test-support/setup-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { saveUserFavorite } from '../src/sources/service.mjs';

const browserCase = { timeout: 45000, skip: process.platform !== 'darwin' ? 'Mac enrollment browser qualification'
  : !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Browser plugin unavailable; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };
async function fixture(t) {
  const p = await setupProfile(t), newSkill = await addSetupSkill(p);
  await saveUserFavorite({ workspace: p.workspace, name: '追加前のNormal' });
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') }); t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [], posts = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('net::ERR_FAILED')) errors.push(m.text()); });
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  await page.goto(gui.url);
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).waitFor();
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  return { ...p, newSkill, page, browserContext: context, errors, posts };
}
async function reviewOnScreen(s) {
  const { page } = s;
  await page.getByText('未登録のSkillを確認する', { exact: true }).click();
  await page.getByRole('button', { name: '追加候補の一覧を確認', exact: true }).click();
  await page.getByText('登録済み 1件 / 未登録の候補 1件', { exact: true }).waitFor();
  const id = await page.getByLabel('登録するSkill', { exact: true }).locator('option').filter({ hasText: 'new-example' }).getAttribute('value');
  await page.getByLabel('登録するSkill', { exact: true }).selectOption(id);
  assert.equal(await page.getByLabel('このSkillの由来', { exact: true }).inputValue(), '');
  assert.equal(await page.getByRole('button', { name: '登録内容を確認', exact: true }).isDisabled(), true);
  await page.getByLabel('このSkillの由来', { exact: true }).selectOption('self');
  await page.getByLabel('限定解除での使用', { exact: true }).selectOption('automatic');
  assert.equal(await page.getByLabel('零式での使用', { exact: true }).inputValue(), 'manual');
  assert.equal(await page.getByLabel('零式での使用', { exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: '登録内容を確認', exact: true }).click();
  await page.getByRole('button', { name: 'この内容で登録', exact: true }).waitFor();
}

test('built GUI reviews source roles, enrolls without file writes, then prepares manual TRUEFORM and explains older favorites', browserCase, async t => {
  const s = await fixture(t), { page } = s, before = (await openWorkspace(s.workspace)).state;
  await reviewOnScreen(s);
  assert.deepEqual((await openWorkspace(s.workspace)).state, before);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(await readFile(s.newSkill.path), s.newSkill.bytes);
  if (process.env.UNHARNESS_ENROLLMENT_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_ENROLLMENT_SCREENSHOT_DIR, { recursive: true });
    await page.locator('.enrollment-review').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.UNHARNESS_ENROLLMENT_SCREENSHOT_DIR, 'enrollment-desktop.png') });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.enrollment-panel').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const boxes = await page.locator('.enrollment-form select, .enrollment-form textarea').evaluateAll(elements => elements.map(e => {
    const r = e.getBoundingClientRect(); return { width: r.width, right: r.right, viewport: innerWidth };
  }));
  assert.ok(boxes.every(r => r.width > 180 && r.right <= r.viewport), JSON.stringify(boxes));
  if (process.env.UNHARNESS_ENROLLMENT_SCREENSHOT_DIR) {
    await page.locator('.enrollment-form').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(process.env.UNHARNESS_ENROLLMENT_SCREENSHOT_DIR, 'enrollment-mobile.png') });
  }
  await page.getByRole('button', { name: 'この内容で登録', exact: true }).click();
  await page.getByText(/登録が更新されました/).waitFor();
  assert.equal((await openWorkspace(s.workspace)).reg.skills.length, 2);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(await readFile(s.newSkill.path), s.newSkill.bytes);
  await page.getByRole('button', { name: /TRUEFORM/ }).click();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).and(page.locator(':enabled')).waitFor();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'TRUEFORM' }).waitFor();
  assert.match(await readFile(join(s.newSkill.path, '..', 'agents', 'openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  assert.equal(await page.getByText(/登録が更新されました/).count(), 0);
  await page.getByRole('button', { name: '保存版を表示', exact: true }).click();
  await page.getByRole('button', { name: /追加前のNormal.*追加したSkill 1件を含む/ }).click();
  await page.getByText('追加後のSkillを含めて準備', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'Normal' }).waitFor();
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await assert.rejects(readFile(join(s.newSkill.path, '..', 'agents', 'openai.yaml')), { code: 'ENOENT' });
  assert.deepEqual(s.errors, []);
});

test('a lost enrollment response does not resend; explicit readback reveals the saved scope with sources unchanged', browserCase, async t => {
  const s = await fixture(t), { page } = s;
  await reviewOnScreen(s);
  let attempts = 0;
  await page.route('**/api/sources/apply-enrollment', async route => {
    attempts += 1;
    const result = await route.fetch(); assert.equal(result.status(), 200);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: 'この内容で登録', exact: true }).click();
  await page.getByText(/登録結果は未確認です/).waitFor();
  // A concurrent read can also block the old context and remove this control.
  // Neither representation may offer an enabled repeat of the uncertain write.
  assert.equal(await page.getByRole('button', { name: 'この内容で登録', exact: true }).and(page.locator(':enabled')).count(), 0);
  assert.equal(attempts, 1);
  assert.equal((await openWorkspace(s.workspace)).reg.skills.length, 2);
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.getByText(/登録が更新されました/).waitFor();
  assert.equal(attempts, 1);
  assert.equal(s.posts.filter(path => path.endsWith('/apply-enrollment')).length, 1);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(await readFile(s.newSkill.path), s.newSkill.bytes);
  assert.deepEqual(s.errors, []);
});

test('a directory-only rebind keeps the source count and never tells the user that Skills were added', browserCase, async t => {
  const { createOwnedSourceProfile } = await import('../src/sources/owned-profile.mjs');
  const { registerLegacySourceProfile } = await import('../test-support/legacy-source-registration.mjs');
  const sources = await import('../src/sources/service.mjs');
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-rebind-browser-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const p = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const registered = await registerLegacySourceProfile({ parent, context: p.context,
    revision: 'ba64cebbdc2a17179b13a6281668f75fb35dc668', directoryDeviceOffset: 17 });
  await registered.callLegacy('save', { workspace: registered.workspace, name: '再確認前のNormal' });
  const before = await sources.userSourceState({ workspace: registered.workspace });
  const review = await sources.reviewUserDirectoryRebind({ workspace: registered.workspace });
  await sources.applyUserDirectoryRebind({ workspace: registered.workspace, reviewId: review.reviewId, confirmedCurrentLocations: true });
  const after = await sources.userSourceState({ workspace: registered.workspace });
  assert.deepEqual(after.registration.sources, before.registration.sources);
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') }); t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  await page.goto(gui.url);
  await page.locator('.scope-enrollment-notice').waitFor();
  assert.doesNotMatch(await page.locator('#main').innerText(), /Skillの登録範囲が増えました|追加したSkillを含む|追加後の2構成/);
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).click();
  const prompt = await page.getByLabel('設定相談の依頼文', { exact: true }).inputValue();
  assert.doesNotMatch(prompt, /追加登録後/);
  assert.match(prompt, /以前の選択を置き換えない/);
  await page.getByRole('button', { name: /再確認前のNormal/ }).click();
  await page.getByText('再確認した場所へ保存内容を準備', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).click();
  await page.locator('.scope-enrollment-notice').waitFor({ state: 'detached' });
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});
