import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setupProfile, addSetupSkill } from '../test-support/setup-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { saveUserFavorite } from '../src/sources/service.mjs';

const browserCase = { timeout: 60000, skip: process.platform !== 'darwin' ? 'Mac inheritance browser qualification'
  : !process.env.UNHARNESS_PLAYWRIGHT_MODULE && 'Browser plugin unavailable; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };
async function fixture(t) {
  const p = await setupProfile(t);
  await saveUserFavorite({ workspace: p.workspace, name: '登録前のNormal' });
  const inventory = (await readSetup({ workspace: p.workspace })).inventory;
  const proposal = { ...p.proposal, schemaVersion: 2, inventoryId: inventory.inventoryId,
    trueform: { retainedOfficialPluginIds: [] },
    unseal: { instructions: 'minimal', additionalAutomaticSkillIds: p.proposal.roles.map(r => r.sourceId) } };
  const setup = await applySetup({ workspace: p.workspace, reviewId: (await reviewSetup({ workspace: p.workspace, proposal })).reviewId });
  const newSkill = await addSetupSkill(p);
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') }); t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  const errors = [], posts = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (r.method() === 'POST') posts.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() }); });
  await page.goto(gui.url);
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).waitFor();
  return { ...p, proposal, setup, newSkill, page, browserContext: context, errors, posts };
}
async function showSaved(page) {
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).click();
  const read = page.getByRole('button', { name: '保存した2構成を確認', exact: true });
  await read.focus(); await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: '零式から引き継ぐもの', exact: true }).waitFor();
  assert.equal(await read.evaluate(e => e === document.activeElement), true);
}
async function screenshot(page, name) {
  if (!process.env.UNHARNESS_SETUP_SCREENSHOT_DIR) return;
  await mkdir(process.env.UNHARNESS_SETUP_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: join(process.env.UNHARNESS_SETUP_SCREENSHOT_DIR, name + '.png') });
}

test('built v2 GUI separates saved inheritance, role-only registration, setup approval and mode preparation', browserCase, async t => {
  const s = await fixture(t), { page } = s;
  const before = await readFile(join(s.workspace, 'state.json'));
  await showSaved(page);
  const summary = page.getByRole('region', { name: '保存した2構成', exact: true });
  assert.match(await summary.innerText(), /零式から引き継ぐもの[\s\S]*0件/);
  assert.match(await summary.innerText(), /限定解除で追加するもの[\s\S]*1件/);
  assert.equal(await summary.locator('input, select').count(), 0);
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), before);
  await summary.scrollIntoViewIfNeeded(); await screenshot(page, 'inheritance-desktop');
  await page.setViewportSize({ width: 390, height: 844 });
  await summary.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await screenshot(page, 'inheritance-mobile');
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.getByText('未登録のSkillを確認する', { exact: true }).click();
  await page.getByRole('button', { name: '追加候補の一覧を確認', exact: true }).click();
  await page.getByText('登録済み 1件 / 未登録の候補 1件', { exact: true }).waitFor();
  const id = await page.getByLabel('登録するSkill', { exact: true }).locator('option').filter({ hasText: 'new-example' }).getAttribute('value');
  await page.getByLabel('登録するSkill', { exact: true }).selectOption(id);
  await page.getByLabel('このSkillの由来', { exact: true }).selectOption('self');
  assert.equal(await page.getByLabel('限定解除での使用', { exact: true }).count(), 0);
  assert.equal(await page.getByLabel('零式での使用', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '登録内容を確認', exact: true }).click();
  await page.getByText('両モードの自動使用：登録後にまとめて確認', { exact: true }).waitFor();
  const addition = s.posts.findLast(r => r.path.endsWith('/review-enrollment')).body.additions[0];
  assert.deepEqual(Object.keys(addition).sort(), ['origin', 'reason', 'sourceId']);
  await page.getByRole('button', { name: 'この内容で登録', exact: true }).click();
  await page.getByText(/先に「設定をAIに相談」で両モード/).waitFor();
  assert.equal(await page.getByRole('button', { name: /TRUEFORM/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /UNSEAL/ }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: /^Normal/ }).isEnabled(), true);
  assert.equal(await page.getByText('対象を調整', { exact: true }).count(), 0);
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).click();
  assert.equal(await page.getByLabel('現在の構成から相談する', { exact: true }).isChecked(), true);
  const prompt = await page.getByLabel('設定相談の依頼文', { exact: true }).inputValue();
  assert.match(prompt, /登録更新後/); assert.match(prompt, /read_setup/);
  assert.ok(!prompt.includes(s.context.codexHome));
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(await readFile(s.newSkill.path), s.newSkill.bytes);
  assert.equal((await openWorkspace(s.workspace)).state.setupId, null);

  const ai = await fixtureAiClient(t, s.workspace), status = await ai.call('read_setup');
  const proposal = { ...s.proposal, scopeId: status.scopeId, normalId: status.normalId, inventoryId: status.inventory.inventoryId,
    roles: status.enrollment.roles, unseal: { ...s.proposal.unseal, additionalAutomaticSkillIds: status.enrollment.roles.map(r => r.sourceId) } };
  const review = await ai.mutate('review_setup', { proposal });
  const saved = await ai.mutate('apply_setup', { reviewId: review.reviewId });
  await page.getByText(/解除設定は保存済みです。 次に解除モード/).waitFor();
  assert.equal((await openWorkspace(s.workspace)).state.scopePreparationRequired, true);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await page.getByRole('button', { name: /TRUEFORM/ }).click();
  const apply = page.getByRole('button', { name: 'この計画で準備する', exact: true });
  await apply.and(page.locator(':enabled')).waitFor(); await apply.click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'TRUEFORM' }).waitFor();
  await page.getByText(/現在の準備にもこの保存版/).waitFor();
  assert.equal((await openWorkspace(s.workspace)).state.preparedSetupId, saved.setupId);
  assert.match(await readFile(join(s.newSkill.path, '..', 'agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  await page.getByRole('button', { name: '保存版を表示', exact: true }).click();
  await page.getByRole('button', { name: /登録前のNormal.*追加したSkill 1件/ }).click();
  await apply.and(page.locator(':enabled')).waitFor(); await apply.click();
  await page.locator('.control-column .selected-name').filter({ hasText: 'Normal' }).waitFor();
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await assert.rejects(readFile(join(s.newSkill.path, '..', 'agents/openai.yaml')), { code: 'ENOENT' });
  assert.deepEqual(s.errors, []);
});

test('render-only provenance fixture keeps inherited choices read-only and exposes unknown eligibility and disabled counts', browserCase, async t => {
  const s = await fixture(t), { page } = s;
  // This response replacement tests presentation only. The service never accepts
  // client-supplied provenance; no synthetic official record is persisted.
  await page.route('**/api/sources/setup', async route => {
    const response = await route.fetch(), body = await response.json(), data = body.result;
    const id = s.proposal.roles[0].sourceId;
    const inherited = { trueformAutomaticSkillIds: [id], unsealAutomaticSkillIds: [id], inheritedSkillIds: [id], additionalSkillIds: [] };
    data.review.inheritance = inherited;
    for (const preset of Object.values(data.review.presets)) {
      preset.automaticSkillIds = [id];
      preset.skillStates = [{ id, enabled: true, manualOnly: false }, { id: 'skill-' + 'b'.repeat(64), enabled: false, manualOnly: false }];
    }
    data.inventory.plugins = [{ id: 'unverified-package', eligibility: 'unknown', skillIds: [id], sourceRevision: null, evidence: null }];
    await route.fulfill({ response, json: body });
  });
  await showSaved(page);
  const summary = page.getByRole('region', { name: '保存した2構成', exact: true });
  assert.match(await summary.innerText(), /零式から引き継ぐもの[\s\S]*1件/);
  assert.match(await summary.innerText(), /無効のまま 1件/);
  await page.getByText('現在の候補確認', { exact: true }).click();
  await page.getByText(/unverified-package.*公式由来は未確認/).waitFor();
  assert.equal(await summary.locator('input, select').count(), 0);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await page.getByRole('button', { name: '設定をAIに相談', exact: true }).click();
  assert.equal(await summary.count(), 0);
  assert.deepEqual(s.errors, []);
});
