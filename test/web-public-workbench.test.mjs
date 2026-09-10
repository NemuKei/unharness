import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { publicBrowser, publicBrowserCase } from '../test-support/public-browser.mjs';
import { CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { userSourceState } from '../src/sources/service.mjs';

async function connect(s) {
  await s.page.goto(await s.approveLink());
  await s.page.getByRole('button', { name: 'このMacに接続', exact: true }).waitFor();
  assert.equal(new URL(s.page.url()).hash, ''); assert.equal(s.posts.length, 0);
  assert.equal((await s.callPageTool('unharness_status', {})).connectionState, 'pairing');
  await s.page.getByRole('button', { name: 'このMacに接続', exact: true }).click();
  await s.page.locator('.prepared-mode').filter({ hasText: /^Normal$/ }).waitFor();
}
test('public GUI and page-tool calls share plans, state updates, Normal restoration and the local workbench', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s; await connect(s);
  const choices = await page.locator('.public-mode-choices').boundingBox();
  assert.ok(choices && choices.y >= 0 && choices.y + choices.height < 1050, 'mode choices are visible before scrolling');
  await page.getByRole('button', { name: /^UNSEAL/ }).click();
  await page.getByRole('button', { name: '変更計画を確認', exact: true }).click();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).click();
  await page.locator('.prepared-mode').filter({ hasText: /^UNSEAL$/ }).waitFor();
  assert.equal((await userSourceState({ workspace: s.workspace })).preparedMode, 'unseal');
  await page.evaluate(() => window.scrollTo(0, 0));
  await s.screenshot('public-connected-desktop.png');
  for (const mode of ['trueform', 'normal']) {
    assert.equal((await s.callPageTool('unharness_status', {})).ok, true);
    const planned = await s.callPageTool('unharness_plan_mode', { mode, requestId: randomUUID() });
    assert.equal(planned.ok, true, JSON.stringify(planned)); assert.equal(planned.result.result.ok, true);
    await page.getByRole('button', { name: 'この計画で準備する', exact: true }).waitFor();
    const applied = await s.callPageTool('unharness_apply_plan', { planRequestId: planned.result.requestId, requestId: randomUUID() });
    assert.equal(applied.ok, true, JSON.stringify(applied)); assert.equal(applied.result.result.ok, true);
    await page.locator('.prepared-mode').filter({ hasText: mode === 'normal' ? /^Normal$/ : /^TRUEFORM$/ }).waitFor();
  }
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await page.getByText('この設定で新しいタスクを始める', { exact: true }).click();
  assert.match(await page.getByLabel('新しいタスクへの依頼文', { exact: true }).inputValue(), /古い会話に反映済みとは扱わず/);
  assert.equal(s.posts.filter(r => r.path.endsWith('/apply')).length, 3);
  assert.equal(s.requests.filter(r => r.method !== 'GET').length, 0);
  await s.assertNoSecrets();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.preparation-panel').scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await s.screenshot('public-connected-mobile.png');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: '保存・比較・復旧のローカル画面を開く', exact: true }).click();
  const local = await popupPromise; await local.waitForLoadState();
  await local.getByRole('button', { name: 'AIと初期設定を作る', exact: true }).waitFor();
  assert.equal(new URL(local.url()).origin, s.gui.url); await local.close();
  assert.deepEqual(s.errors, []);
});

test('lost public responses preserve the original operation and expiry clears current-state claims', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s; await connect(s);
  await page.getByRole('button', { name: /^UNSEAL/ }).click();
  await page.getByRole('button', { name: '変更計画を確認', exact: true }).click();
  s.dropNextApply();
  await page.getByRole('button', { name: 'この計画で準備する', exact: true }).click();
  await page.getByRole('heading', { name: '接続状態は未確認', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '変更計画を確認', exact: true }).isDisabled(), true);
  const operationId = await page.getByLabel('操作ID', { exact: true }).inputValue();
  assert.equal(s.posts.filter(r => r.path.endsWith('/apply')).length, 1);
  await page.getByRole('button', { name: '同じ操作の結果を確認', exact: true }).click();
  await page.getByText('UNSEALを準備し、ファイルの一致を確認した記録があります。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.locator('.prepared-mode').filter({ hasText: /^UNSEAL$/ }).waitFor();
  s.advance(CONNECTION_TTL_MS);
  await page.getByRole('heading', { name: '接続期限切れ', exact: true }).waitFor();
  assert.equal(await page.locator('.prepared-mode').innerText(), '未確認');
  assert.equal(await page.getByLabel('操作ID', { exact: true }).inputValue(), operationId);
  assert.equal(s.posts.filter(r => r.path.endsWith('/apply')).length, 1);
  await s.screenshot('public-expired-result.png');
  await s.assertNoSecrets();
  await page.getByRole('button', { name: 'デモ', exact: true }).click();
  assert.equal((await s.callPageTool('unharness_plan_mode', { mode: 'normal', requestId: randomUUID() })).ok, false);
  assert.equal((await userSourceState({ workspace: s.workspace })).preparedMode, 'unseal');
  assert.deepEqual(s.errors.filter(error => !error.includes('net::ERR_FAILED') && !error.includes('401')), []);
});
