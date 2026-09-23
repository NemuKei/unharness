import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { publicBrowser, publicBrowserCase, PUBLIC_WEB_ORIGIN } from '../test-support/public-browser.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkbenchPage } from '../test-support/workbench-navigation.mjs';

test('public entry, synthetic demo and platform guidance do not connect or change real settings', publicBrowserCase, async t => {
  const s = await publicBrowser(t, { clipboardFails: true }), { page } = s;
  await page.goto(PUBLIC_WEB_ORIGIN);
  await page.getByRole('button', { name: '設定を変えずにデモを試す', exact: true }).waitFor();
  await page.getByText('ローカル画面は「モード」が入口です。「記録・比較」「外観」「設定」「接続・復旧」は「その他」から開けます。公開サイトへの接続許可は不要です。', { exact: true }).waitFor();
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
  assert.equal(await page.evaluate(() => window.__unharnessTestTools.size), 0, 'ordinary public visitors have no operating tools');
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
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: '開き方を見る', exact: true }).click();
  await page.getByRole('heading', { name: '操作は、このMacの画面で。', exact: true }).waitFor();
  assert.equal(await page.locator('.local-launch-entry .public-panel').evaluate(element => {
    const box = element.getBoundingClientRect();
    return Math.abs((box.left + box.right) / 2 - innerWidth / 2) < 2;
  }), true, 'opening guidance is centered instead of leaving an empty workbench column');
  await s.screenshot('public-opening-guidance.png');
  await page.getByRole('button', { name: '開くための依頼文をコピー', exact: true }).click();
  await page.getByText('コピーできませんでした。依頼文を選択してコピーしてください。', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Unharnessを開く依頼', { exact: true }).evaluate(e => document.activeElement === e && e.selectionEnd - e.selectionStart === e.value.length), true);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.length, 0); assert.deepEqual(s.errors, []); await s.assertNoSecrets();
});


test('production entry offers Japanese and English drafts without an operating connection', publicBrowserCase, async t => {
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



test('English local workbench preserves the selected mode, artwork brief and user text across language switches', publicBrowserCase, async t => {
  const s = await publicBrowser(t), { page } = s, localPosts = [];
  page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname.startsWith('/api/sources/')) localPosts.push(new URL(r.url()).pathname); });
  await page.goto(s.gui.url + '/?lang=en');
  await page.getByRole('button', { name: /UNSEAL/ }).click();
  const reviewMode = page.getByRole('button', { name: 'Review changes', exact: true });
  await reviewMode.and(page.locator(':enabled')).waitFor(); await reviewMode.click();
  await page.getByRole('button', { name: 'Apply these changes', exact: true }).and(page.locator(':enabled')).waitFor();
  await openWorkbenchPage(page, 'Appearance');
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
  await openWorkbenchPage(page, 'Mode');
  assert.equal(await page.getByRole('button', { name: /UNSEAL/ }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: 'Apply these changes', exact: true }).isEnabled(), true);
  await s.screenshot('guided-local-en-plan.png');
  await openWorkbenchPage(page, 'Work records');
  await page.getByRole('heading', { name: 'Your work', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await s.screenshot('guided-local-en-history-mobile.png');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(localPosts.filter(path => /\/(apply|register|save-appearance-import|apply-setup)$/.test(path)).length, 0);
  assert.deepEqual(s.errors, []);
});
