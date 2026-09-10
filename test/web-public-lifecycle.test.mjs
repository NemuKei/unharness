import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { publicBrowser, publicBrowserCase } from '../test-support/public-browser.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { userSourceState } from '../src/sources/service.mjs';

// Uses the existing owned-profile, routed-HTTPS browser fixture. These cases
// do not qualify public deployment, real LNA permission or native WebMCP.
for (const late of ['success', 'failure']) test(`demo during redeem allows explicit reconnection despite late ${late}`, publicBrowserCase, async t => {
  const release = Promise.withResolvers(), entered = Promise.withResolvers(), finished = Promise.withResolvers();
  t.after(() => release.resolve());
  const s = await publicBrowser(t), { page } = s, oldLink = await s.approveLink();
  const oldTicket = new URLSearchParams(new URL(oldLink).hash.slice(1)).get('ticket');
  const redeems = [];
  page.on('request', r => { if (r.url().endsWith('/remote/v2/redeem')) redeems.push(r.postDataJSON().ticket); });
  await page.route(s.gui.url + '/remote/v2/redeem', async route => {
    if (route.request().postDataJSON().ticket !== oldTicket) { await route.fallback(); return; }
    const response = await route.fetch(); entered.resolve(); await release.promise;
    try { if (late === 'failure') await route.abort(); else await route.fulfill({ response }); }
    finally { finished.resolve(); }
  });
  await page.goto(oldLink);
  await page.getByRole('button', { name: 'このMacに接続', exact: true }).click(); await entered.promise;
  await page.getByRole('button', { name: 'デモ', exact: true }).click();
  const next = await s.approveLink();
  await page.evaluate(link => { location.hash = new URL(link).hash; }, next);
  const connect = page.getByRole('button', { name: 'このMacに接続', exact: true });
  await connect.waitFor(); assert.equal(await connect.isEnabled(), true);
  assert.equal(redeems.length, 1, 'a new handoff must not automatically redeem');
  await connect.click(); await page.locator('.prepared-mode').filter({ hasText: /^Normal$/ }).waitFor();
  release.resolve(); await finished.promise;
  const status = await s.callPageTool('unharness_status', {});
  assert.equal(status.ok, true); assert.equal(status.connectionState, 'connected');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.public-notice').count(), 0, 'obsolete connection errors do not reach the new screen');
  assert.equal(redeems.length, 2); assert.equal(new URL(page.url()).hash, '');
  assert.equal(s.posts.filter(r => r.path.endsWith('/apply') || r.path.endsWith('/plan')).length, 0);
  await s.assertNoSecrets();
});

test('GUI and page tools can repeatedly read running without enabling another mutation', publicBrowserCase, async t => {
  const entered = Promise.withResolvers(), release = Promise.withResolvers();
  t.after(() => { release.resolve(); setSourceTransactionTestHook(null); });
  const s = await publicBrowser(t), { page } = s;
  await page.goto(await s.approveLink());
  await page.getByRole('button', { name: 'このMacに接続', exact: true }).click();
  await page.locator('.prepared-mode').filter({ hasText: /^Normal$/ }).waitFor();
  const planned = await s.callPageTool('unharness_plan_mode', { mode: 'unseal', requestId: randomUUID() });
  assert.equal(planned.result.result.ok, true);
  setSourceTransactionTestHook(async phase => { if (phase === 'before-completion') { entered.resolve(); await release.promise; } });
  const id = randomUUID();
  const writing = s.callPageTool('unharness_apply_plan', { planRequestId: planned.result.requestId, requestId: id });
  // Attach the rejection path immediately while another page call observes it.
  const outcome = writing.then(value => ({ value }), error => ({ error }));
  await entered.promise;
  const lookup = page.getByRole('button', { name: '同じ操作の結果を確認', exact: true });
  assert.equal(await lookup.isEnabled(), true, 'result lookup is not blocked by the active apply');
  for (let i = 0; i < 2; i++) {
    await lookup.click();
    await page.getByText('処理中です。完了はまだ確認できていません。同じ操作IDで結果を確認してください。', { exact: true }).waitFor();
    const running = await s.callPageTool('unharness_operation_status', { operationId: id });
    assert.equal(running.ok, true); assert.equal(running.result.state, 'running');
    assert.equal(await page.getByLabel('操作ID', { exact: true }).inputValue(), id);
    assert.equal(await page.getByRole('button', { name: '変更計画を確認', exact: true }).isDisabled(), true);
    const blocked = await s.callPageTool('unharness_plan_mode', { mode: 'normal', requestId: randomUUID() });
    assert.equal(blocked.ok, false); assert.equal(blocked.error.kind, 'remote-operation-in-progress');
  }
  release.resolve(); const result = await outcome;
  assert.equal(result.error, undefined); assert.equal(result.value.result.result.ok, true);
  await page.getByText('UNSEALを準備し、ファイルの一致を確認した記録があります。', { exact: true }).waitFor();
  await page.locator('.prepared-mode').filter({ hasText: /^UNSEAL$/ }).waitFor();
  assert.equal(s.posts.filter(r => r.path.endsWith('/apply')).length, 1);
  assert.equal((await userSourceState({ workspace: s.workspace })).recovery.pending, false);
  await s.assertNoSecrets(); assert.deepEqual(s.errors, []);
});
