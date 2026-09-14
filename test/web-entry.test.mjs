import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { publicBrowser, publicBrowserCase } from '../test-support/public-browser.mjs';
import { PUBLIC_WEB_ORIGIN } from '../src/gui/remote-policy.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

test('public entry, synthetic demo and platform guidance do not connect or change real settings', publicBrowserCase, async t => {
  const s = await publicBrowser(t, { clipboardFails: true }), { page } = s;
  await page.goto(PUBLIC_WEB_ORIGIN);
  await page.getByRole('button', { name: '設定を変えずにデモを試す', exact: true }).waitFor();
  assert.match(await page.title(), /Unharness/); assert.equal(new URL(page.url()).origin, PUBLIC_WEB_ORIGIN);
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  await page.getByRole('button', { name: '「零式に切り替えて」', exact: true }).click();
  await page.getByText('コピーできませんでした。下の依頼文を選択してコピーしてください。', { exact: true }).waitFor();
  assert.match(await page.getByLabel('AIへの依頼文', { exact: true }).inputValue(), /アプリ内ブラウザで操作画面も開いて/);
  assert.equal(s.posts.length, 0, 'chat-entry copying never connects or switches visitor settings');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByLabel('標準外観のプレビュー', { exact: true }).locator('.scene-indicator').filter({ hasText: /静止画表示/ }).waitFor();
  assert.equal(await page.locator('.original-example-comparison figure').count(), 3);
  await s.screenshot('public-entry-desktop.png');
  await page.setViewportSize({ width: 1280, height: 720 });
  assert.equal(await page.locator('.entry-choices').evaluate(element => {
    const box = element.getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight;
  }), true, 'demo and installation actions fit the native desktop viewport before scrolling');
  await s.screenshot('public-entry-short-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await s.screenshot('public-entry-mobile.png');
  await page.setViewportSize({ width: 1440, height: 1050 });
  const modes = page.getByRole('group', { name: '比較プレビューのモード', exact: true });
  const summary = page.getByRole('region', { name: 'このモードで試せること', exact: true });
  for (const [name, instruction, externalSkill] of [
    ['零式', '選んだ追加指示を外す', '使わない'],
    ['限定解除', '最小ガイドを使う', '自分で呼び出して使う'],
    ['通常', '保存した指示を使う', '自動で使う'],
  ]) {
    await modes.getByRole('button', { name, exact: true }).click();
    await summary.getByText(instruction, { exact: true }).waitFor();
    assert.equal(await summary.locator('dl > div').filter({ hasText: '外部Skillの例' }).locator('dd').innerText(), externalSkill);
  }
  assert.equal(s.posts.length, 0, 'landing-page mode previews never call local operations');
  assert.equal(await page.getByRole('link', { name: 'DeltaHelm Lab', exact: true }).getAttribute('href'), 'https://deltahelmlab.com/');
  await page.getByRole('button', { name: '設定を変えずにデモを試す', exact: true }).click();
  await page.getByRole('button', { name: '設定のデモ', exact: true }).click();
  for (const name of ['TRUEFORM', 'UNSEAL', 'Normal']) await page.getByRole('button', { name: new RegExp('^' + name) }).click();
  await page.getByText('このデモは架空のデータです。モードを選んでも、あなたのAI設定は変わりません。', { exact: true }).waitFor();
  assert.equal((await s.callPageTool('unharness_plan_mode', { mode: 'unseal', requestId: randomUUID() })).ok, false);
  assert.equal(s.posts.length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await s.screenshot('public-demo-mobile.png');
  await page.getByRole('button', { name: '導入', exact: true }).click();
  await page.getByRole('heading', { name: /^(Mac版の公開配布を準備しています|Codexに導入を頼む)$/ }).waitFor();
  await page.getByLabel('使うOS', { exact: true }).selectOption('windows');
  await page.getByRole('heading', { name: 'この組み合わせは後続の対応です', exact: true }).waitFor();
  await page.getByLabel('使うOS', { exact: true }).selectOption('mac');
  await page.getByLabel('使うAI', { exact: true }).selectOption('claude');
  await page.getByRole('heading', { name: 'この組み合わせは後続の対応です', exact: true }).waitFor();
  await page.getByRole('button', { name: '接続して開く', exact: true }).click();
  await page.getByRole('button', { name: '依頼文をコピー', exact: true }).click();
  await page.getByText('コピーできませんでした。依頼文を選択してコピーしてください。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('AIへの依頼文', { exact: true }).evaluate(e => document.activeElement === e && e.selectionEnd - e.selectionStart === e.value.length), true);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.length, 0); assert.deepEqual(s.errors, []); await s.assertNoSecrets();
});


test('production entry hands off Japanese and English drafts and retains live connection state across language changes', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s;
  await page.goto(PUBLIC_WEB_ORIGIN);
  const source = page.getByRole('link', { name: 'GitHub', exact: true });
  assert.equal(await source.getAttribute('href'), 'https://github.com/NemuKei/unharness');
  const start = page.getByRole('link', { name: 'CodexでUnharnessを始める', exact: true });
  const ja = new URL(await start.getAttribute('href'));
  assert.equal(ja.protocol, 'codex:');
  assert.match(ja.searchParams.get('prompt'), /日本語で案内/);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('heading', { name: 'New model. Same old harness?', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const en = new URL(await page.getByRole('link', { name: 'Start Unharness in Codex', exact: true }).getAttribute('href'));
  assert.match(en.searchParams.get('prompt'), /guide me in English/);
  assert.equal(s.posts.length, 0);
  await page.getByRole('button', { name: 'Get started', exact: true }).click();
  await page.getByRole('heading', { name: 'Ask Codex to help you start', exact: true }).waitFor();
  await page.getByRole('button', { name: '日本語', exact: true }).click();
  await page.getByRole('heading', { name: 'Codexに導入を頼む', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'CodexでUnharnessを始める', exact: true }).count(), 1);
  assert.equal(s.posts.length, 0);
  await s.assertNoSecrets();
});

test('language changes preserve the live connection, selected mode and reviewed plan without applying it', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s;
  await page.goto(await s.approveLink());
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Connect to this Mac', exact: true }).click();
  await page.locator('.prepared-mode').filter({ hasText: /^Normal$/ }).waitFor();
  const before = await s.callPageTool('unharness_status', {});
  await page.getByRole('button', { name: /^UNSEAL/ }).click();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await page.getByLabel('Change plan to review', { exact: true }).waitFor();
  const planned = await s.callPageTool('unharness_status', {}), posts = s.posts.length;
  await page.getByRole('button', { name: '日本語', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'この内容で確定する', exact: true }).isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: /^UNSEAL/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(s.posts.length, posts);
  await page.getByRole('button', { name: 'English', exact: true }).click();
  const after = await s.callPageTool('unharness_status', {});
  assert.equal(after.connectionState, before.connectionState);
  assert.deepEqual(after, planned);
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('heading', { name: 'Appearance', exact: true }).waitFor();
  await page.getByText('Choose a bundled appearance', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Review local loadouts and targets', { exact: true }).click();
  const local = page.getByRole('link', { name: 'Review settings on this Mac', exact: true });
  assert.equal(new URL(await local.getAttribute('href')).searchParams.get('lang'), 'en');
  await page.getByRole('button', { name: '日本語', exact: true }).click();
  assert.equal(new URL(await page.getByRole('link', { name: 'このMacで設定を確認する', exact: true }).getAttribute('href')).searchParams.get('lang'), 'ja');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.filter(p => p.path.endsWith('/apply')).length, 0);
  assert.deepEqual(s.errors, []); await s.assertNoSecrets();
});

test('English local workbench preserves the selected mode, artwork brief and user text across language switches', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s, localPosts = [];
  page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/sources/')) localPosts.push(new URL(r.url()).pathname); });
  await page.goto(s.gui.url + '/?lang=en');
  await page.getByRole('button', { name: /UNSEAL/ }).click();
  await page.getByRole('button', { name: 'Apply these changes', exact: true }).and(page.locator(':enabled')).waitFor();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Create original artwork', exact: true }).click();
  const brief = '金色の竜 & my own artwork', draft = page.getByRole('textbox', { name: 'Your idea (optional)', exact: true });
  await draft.fill(brief);
  await page.getByLabel('Part to replace', { exact: true }).selectOption('entity');
  await page.getByRole('dialog').getByRole('button', { name: '日本語', exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: '作りたいイメージ（任意）', exact: true }).inputValue(), brief);
  assert.equal(await page.getByLabel('作り替える部分', { exact: true }).inputValue(), 'entity');
  await page.getByRole('dialog').getByRole('button', { name: 'English', exact: true }).click();
  assert.equal(await draft.inputValue(), brief);
  await page.getByRole('button', { name: 'Close appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Mode', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: /UNSEAL/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Apply these changes', exact: true }).isEnabled(), true);
  await s.screenshot('guided-local-en-plan.png');
  await page.getByText('More', { exact: true }).click();
  await page.getByRole('button', { name: 'Comparisons & records', exact: true }).click();
  await page.getByRole('heading', { name: 'Review ordinary work and replays of saved conditions.', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await s.screenshot('guided-local-en-history-mobile.png');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(localPosts.filter(path => /\/(apply|register|save-appearance-import|apply-setup)$/.test(path)).length, 0);
  assert.deepEqual(s.errors, []);
});

test('an older connected workbench keeps its original local links when it does not advertise language support', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s;
  await s.browserContext.route(s.gui.url + '/remote/v2/redeem', async route => {
    const response = await route.fetch(), headers = response.headers();
    delete headers['x-unharness-ui-languages'];
    await route.fulfill({ response, headers });
  });
  await page.goto(await s.approveLink());
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Connect to this Mac', exact: true }).click();
  await page.locator('.prepared-mode').filter({ hasText: /^Normal$/ }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByText('Review local loadouts and targets', { exact: true }).click();
  const url = new URL(await page.getByRole('link', { name: 'Review settings on this Mac', exact: true }).getAttribute('href'));
  assert.equal(url.origin, s.gui.url);
  assert.equal(url.search, '');
  assert.equal(url.hash, '#view=settings');
  assert.equal((await s.callPageTool('unharness_status', {})).connectionState, 'connected');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(s.errors, []);
});
