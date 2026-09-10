import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { artworkBrowser, artworkBrowserCase, importEntity } from '../test-support/artwork-browser.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { readUserAppearance } from '../src/appearances/service.mjs';

async function setup(t, failure = false) {
  const s = await artworkBrowser(t);
  await s.browserContext.addInitScript(({ failure }) => {
    window.__cardDraw = []; window.__cardClipboard = []; window.__cardOpened = [];
    const draw = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, ...args) { window.__cardDraw.push(text); return draw.call(this, text, ...args); };
    Object.defineProperty(navigator.clipboard, 'write', { value: async items => {
      if (failure) throw Error('Synthetic clipboard refusal');
      const blob = await items[0].getType('image/png');
      const bytes = await blob.arrayBuffer(), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
      window.__cardClipboard.push({ types: items[0].types, bytes: bytes.byteLength, hash });
    } });
    Object.defineProperty(navigator.clipboard, 'writeText', { value: async text => { window.__cardClipboard.push({ text }); } });
    window.open = (...args) => {
      window.__cardOpened.push(args);
      return failure ? null : { opener: 'unconfirmed', location: { replace: url => { window.__cardOpened.push({ destination: url }); } } };
    };
  }, { failure });
  await s.page.goto(s.gui.url);
  return s;
}
async function card(s) {
  await s.page.getByRole('button', { name: '画像カード', exact: true }).click();
  const dialog = s.page.getByRole('dialog');
  await dialog.getByRole('img', { name: '公開する外観カードのプレビュー', exact: true }).waitFor();
  return dialog;
}

test('the real PNG card contains chosen public text, downloads, and passes identical image bytes to the explicit X handoff', artworkBrowserCase, async t => {
  const s = await setup(t), { page } = s;
  let dialog = await importEntity(s, 'PRIVATE_TEST_LOCAL_NAME');
  await dialog.getByRole('button', { name: 'この作品を保存', exact: true }).click();
  await page.getByText('作品をコレクションに保存しました。', { exact: true }).waitFor();
  const before = await readUserAppearance({ workspace: s.workspace });
  dialog = await card(s);
  assert.equal(await dialog.getByLabel('公開する作品名（任意）').inputValue(), '');
  assert.equal((await page.evaluate(() => window.__cardDraw)).some(text => text.includes('PRIVATE_TEST')), false);
  await dialog.getByLabel('公開する作品名（任意）').fill('金色の機械竜');
  await dialog.getByLabel('公開する作者名（任意）').fill('テスト作者');
  await dialog.getByLabel('画像に載せるひとこと（任意）').fill('本体だけを作り替えた、私のオリジナル。');
  await dialog.getByRole('img', { name: '公開する外観カードのプレビュー', exact: true }).waitFor();
  await dialog.getByRole('link', { name: '画像を保存', exact: true }).waitFor();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('link', { name: '画像を保存', exact: true }).click();
  const download = await downloaded, bytes = await readFile(await download.path()), png = PNG.sync.read(bytes);
  assert.equal(download.suggestedFilename(), 'unharness-appearance.png');
  assert.equal(png.width, 1200); assert.equal(png.height, 820);
  assert.equal(new Set(png.data).size > 100, true);
  assert.match(await dialog.getByLabel('画像の説明', { exact: true }).inputValue(), /金色の機械竜.*テスト作者/);
  assert.deepEqual(await page.evaluate(() => window.__cardOpened), []);
  await dialog.getByRole('button', { name: '画像をコピーしてXへ', exact: true }).click();
  await dialog.getByText('画像をコピーしました。Xで貼り付けてください。', { exact: true }).waitFor();
  const clipboard = await page.evaluate(() => window.__cardClipboard);
  assert.equal(clipboard.length, 1); assert.deepEqual(clipboard[0].types, ['image/png']);
  assert.equal(clipboard[0].hash, createHash('sha256').update(bytes).digest('hex'));
  const open = await page.evaluate(() => window.__cardOpened);
  assert.deepEqual(open[0], ['about:blank', '_blank']);
  const destination = new URL(open[1].destination);
  assert.equal(destination.origin, 'https://x.com'); assert.equal(destination.pathname, '/intent/tweet');
  assert.match(destination.searchParams.get('text'), /金色の機械竜/);
  assert.equal(destination.searchParams.has('url'), false);
  assert.equal(JSON.stringify(open).includes('PRIVATE_TEST'), false);
  assert.deepEqual(await readUserAppearance({ workspace: s.workspace }), before);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  if (process.env.UNHARNESS_ARTWORK_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_ARTWORK_SCREENSHOT_DIR, { recursive: true });
    await writeFile(join(process.env.UNHARNESS_ARTWORK_SCREENSHOT_DIR, 'card-export.png'), bytes);
  }
  await s.screenshot('appearance-card-desktop.png');
  assert.deepEqual(s.errors, []);
});

test('clipboard and popup refusal keep the prepared card and an editable explicit fallback on a narrow screen', artworkBrowserCase, async t => {
  const s = await setup(t, true), { page } = s;
  const dialog = await card(s), originalUrl = await dialog.getByRole('img').getAttribute('src');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await dialog.getByRole('button', { name: '画像をコピーしてXへ', exact: true }).click();
  await dialog.getByText('画像をコピーできませんでした。「画像を保存」から添付してください。', { exact: true }).waitFor();
  await dialog.getByText('Xの画面を開けませんでした。下のリンクから開いてください。', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('img').getAttribute('src'), originalUrl);
  assert.equal(await dialog.getByRole('link', { name: '画像を保存', exact: true }).getAttribute('href'), originalUrl);
  assert.match(await dialog.getByRole('link', { name: 'Xの投稿画面を開く', exact: true }).getAttribute('href'), /^https:\/\/x.com\/intent\/tweet\?/);
  await dialog.getByLabel('投稿文', { exact: true }).fill('あ'.repeat(141));
  assert.equal(await dialog.getByRole('button', { name: '画像をコピーしてXへ', exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('link', { name: 'Xの投稿画面を開く', exact: true }).count(), 0);
  await dialog.getByRole('button', { name: '投稿文をコピー', exact: true }).click();
  assert.equal((await page.evaluate(() => window.__cardClipboard))[0].text, 'あ'.repeat(141));
  await s.screenshot('appearance-card-mobile.png');
  assert.equal((await readUserAppearance({ workspace: s.workspace })).state, null);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(s.errors, []);
});

test('canvas readback failure is visible and cannot produce an export or a sharing action', artworkBrowserCase, async t => {
  const s = await setup(t), { page } = s;
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      if (this.width === 1200 && this.height === 820) { callback(null); return; }
      return original.call(this, callback, ...args);
    };
  });
  await page.getByRole('button', { name: '画像カード', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('カード画像を書き出せませんでした。画像と文字を確認して、カードを開き直してください。', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('link', { name: '画像を保存', exact: true }).count(), 0);
  assert.equal(await dialog.getByRole('button', { name: '画像をコピーしてXへ', exact: true }).isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => window.__cardOpened), []);
  assert.deepEqual(s.errors, []);
});
