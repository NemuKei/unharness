import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicBrowser, publicBrowserCase } from '../test-support/public-browser.mjs';
import { CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { userSourceState } from '../src/sources/service.mjs';
import { openWorkbenchPage } from '../test-support/workbench-navigation.mjs';

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
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  await page.getByRole('button', { name: 'この内容で確定する', exact: true }).click();
  await page.locator('.prepared-mode').filter({ hasText: /^UNSEAL$/ }).waitFor();
  assert.equal((await userSourceState({ workspace: s.workspace })).preparedMode, 'unseal');
  await page.evaluate(() => window.scrollTo(0, 0));
  await s.screenshot('public-connected-desktop.png');
  for (const mode of ['trueform', 'normal']) {
    assert.equal((await s.callPageTool('unharness_status', {})).ok, true);
    const planned = await s.callPageTool('unharness_plan_mode', { mode, requestId: randomUUID() });
    assert.equal(planned.ok, true, JSON.stringify(planned)); assert.equal(planned.result.result.ok, true);
    await page.getByRole('button', { name: 'この内容で確定する', exact: true }).waitFor();
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
  await openWorkbenchPage(page, '接続・復旧');
  await page.getByRole('link', { name: 'このMacで接続・復旧を確認する', exact: true }).click();
  const local = await popupPromise; await local.waitForLoadState();
  await local.getByRole('heading', { name: '接続・復旧', exact: true }).waitFor();
  assert.equal(new URL(local.url()).origin, s.gui.url); await local.close();
  assert.deepEqual(s.errors, []);
});

test('a transient status failure keeps diagnostics, tools and same-grant recovery without another redeem', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s; await connect(s);
  const redeems = s.posts.filter(post => post.path.endsWith('/redeem')).length;
  s.dropNextStatus();
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.getByRole('heading', { name: '接続状態は未確認', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__unharnessTestTools.size > 0), true);
  assert.equal(await page.getByRole('button', { name: '状態を再取得', exact: true }).count(), 1);
  await page.getByRole('button', { name: '状態を再取得', exact: true }).click();
  await page.locator('.prepared-mode').filter({ hasText: /^Normal$/ }).waitFor();
  assert.equal(s.posts.filter(post => post.path.endsWith('/redeem')).length, redeems);
  assert.equal(s.posts.filter(post => post.path.endsWith('/plan') || post.path.endsWith('/apply')).length, 0);
  assert.ok(s.errors.every(error => error.includes('net::ERR_FAILED')), JSON.stringify(s.errors));
  await s.assertNoSecrets();
});

test('the browser retains shared edits while preventing old plan IDs and changed source contents from being applied', publicBrowserCase, async t => {
  const s = await publicBrowser(t); await connect(s);
  const oldId = randomUUID();
  const old = await s.callPageTool('unharness_plan_mode', { mode: 'unseal', requestId: oldId });
  assert.equal(old.result.result.ok, true);
  const config = join(s.context.codexHome, 'config.toml');
  const original = await readFile(config, 'utf8');
  await writeFile(config, original.replace(/^model = .*$/m, 'model = "PRIVATE_SHARED_FIRST"'));
  await s.callPageTool('unharness_status', {});
  const count = action => s.posts.filter(post => post.path.endsWith('/' + action)).length;
  const sentPlans = count('plan');
  const reused = await s.callPageTool('unharness_plan_mode', { mode: 'unseal', requestId: oldId });
  assert.equal(reused.error.kind, 'remote-operation-conflict');
  assert.equal(count('plan'), sentPlans);
  assert.deepEqual((await s.callPageTool('unharness_operation_status', { operationId: oldId })).result, old.result);
  assert.equal((await s.callPageTool('unharness_apply_plan', { planRequestId: oldId, requestId: randomUUID() })).error.kind, 'remote-plan-unavailable');
  assert.equal(count('apply'), 0);

  // This real browser must receive the exposed retained-v1 capability before
  // it can plan across a shared-settings mismatch. No fake capability is set.
  const freshId = randomUUID();
  const fresh = await s.callPageTool('unharness_plan_mode', { mode: 'unseal', requestId: freshId });
  assert.equal(fresh.result.result.ok, true, JSON.stringify(fresh));
  await writeFile(config, original.replace(/^model = .*$/m, 'model = "PRIVATE_SHARED_SECOND"'));
  const changed = await readSourceProfileFiles(s.context);
  await s.callPageTool('unharness_status', {});
  const stale = await s.callPageTool('unharness_apply_plan', { planRequestId: freshId, requestId: randomUUID() });
  assert.equal(stale.result.result.ok, false);
  assert.equal(stale.result.result.error.kind, 'source-conflict');
  assert.deepEqual(await readSourceProfileFiles(s.context), changed, 'conflict=true twice is not proof that source contents still match');

  await s.callPageTool('unharness_status', {});
  const latestId = randomUUID();
  const latest = await s.callPageTool('unharness_plan_mode', { mode: 'unseal', requestId: latestId });
  assert.equal(latest.result.result.ok, true, JSON.stringify(latest));
  const applied = await s.callPageTool('unharness_apply_plan', { planRequestId: latestId, requestId: randomUUID() });
  assert.equal(applied.result.result.ok, true);
  assert.match(await readFile(config, 'utf8'), /PRIVATE_SHARED_SECOND/);
  assert.equal(count('redeem'), 1);
  await s.assertNoSecrets();
});

test('lost public responses preserve the original operation and expiry clears current-state claims', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s; await connect(s);
  await page.getByRole('button', { name: /^UNSEAL/ }).click();
  await page.getByRole('button', { name: '変更内容を確認', exact: true }).click();
  s.dropNextApply();
  await page.getByRole('button', { name: 'この内容で確定する', exact: true }).click();
  await page.getByRole('heading', { name: '接続状態は未確認', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '変更内容を確認', exact: true }).isDisabled(), true);
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
  const redeems = s.posts.filter(r => r.path.endsWith('/redeem')).length;
  await page.getByText('紹介・導入', { exact: true }).click();
  await page.getByRole('button', { name: '開き方を見る', exact: true }).click();
  await page.getByRole('heading', { name: '操作は、このMacの画面で。', exact: true }).waitFor();
  await page.getByRole('button', { name: '以前の接続・操作結果を確認', exact: true }).click();
  assert.equal(await page.getByLabel('操作ID', { exact: true }).inputValue(), operationId);
  assert.equal(s.posts.filter(r => r.path.endsWith('/redeem')).length, redeems);
  assert.equal(s.posts.filter(r => r.path.endsWith('/apply')).length, 1);
  await s.assertNoSecrets();
  await page.getByText('紹介・導入', { exact: true }).click();
  await page.getByRole('button', { name: 'デモ', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__unharnessTestTools.size), 0, 'leaving the legacy view unregisters operation tools');
  assert.equal((await userSourceState({ workspace: s.workspace })).preparedMode, 'unseal');
  assert.deepEqual(s.errors.filter(error => !error.includes('net::ERR_FAILED') && !error.includes('401')), []);
});
