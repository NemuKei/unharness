import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { join } from 'node:path';
import { artworkBrowser, artworkBrowserCase, importEntity } from '../test-support/artwork-browser.mjs';
import { readUserAppearance } from '../src/appearances/service.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { reviewAppearanceImport, saveAppearanceImport } from '../src/appearances/import.mjs';
import { getAppearanceTemplate } from '../src/appearances/template.mjs';

test('creation stays available without comparison and copying a brief does not send it or change settings', artworkBrowserCase, async t => {
  const s = await artworkBrowser(t, { clipboardFails: true }), { page } = s;
  await page.goto(s.gui.url);
  await page.getByRole('button', { name: 'オリジナルイメージを作成', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('作りたいイメージ（任意）', { exact: true }).fill('金色の小さな機械竜');
  await dialog.getByRole('button', { name: '依頼文をコピー', exact: true }).click();
  await dialog.getByText('コピーできませんでした。依頼文を選択してコピーしてください。', { exact: true }).waitFor();
  assert.match(await dialog.getByLabel('AIへの依頼文', { exact: true }).inputValue(), /金色の小さな機械竜/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await s.screenshot('creation-mobile.png');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal((await readUserAppearance({ workspace: s.workspace })).state, null);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.filter(row => /\/(apply|plan|register|save-appearance-import)$/.test(row.path)).length, 0);
  assert.deepEqual(s.errors, []);
});

test('entity import shows three modes, saves a version, survives reload and reselects the older work', artworkBrowserCase, async t => {
  const s = await artworkBrowser(t), { page } = s;
  await page.goto(s.gui.url);
  let dialog = await importEntity(s, '金色の本体');
  assert.equal(await dialog.getByRole('img').count(), 3);
  await s.screenshot('import-three-modes-desktop.png');
  await dialog.getByRole('button', { name: 'この作品を保存', exact: true }).click();
  await page.getByText('作品をコレクションに保存しました。', { exact: true }).waitFor();
  const first = await readUserAppearance({ workspace: s.workspace });
  assert.equal(first.state.items.at(-1).name, '金色の本体');
  await page.reload();
  await page.locator('.artwork-panel-heading strong').filter({ hasText: '金色の本体' }).waitFor();
  dialog = await importEntity(s, '金色の本体・次の版');
  await dialog.getByRole('button', { name: 'この作品を保存', exact: true }).click();
  await page.getByText('作品をコレクションに保存しました。', { exact: true }).waitFor();
  const second = await readUserAppearance({ workspace: s.workspace });
  assert.notEqual(second.state.selectedItemId, first.state.selectedItemId);
  await page.getByRole('button', { name: 'コレクション', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('img', { name: '金色の本体の見た目', exact: true }).waitFor();
  await dialog.getByRole('img', { name: '金色の本体・次の版の見た目', exact: true }).waitFor();
  await dialog.getByRole('article').filter({ has: page.getByRole('heading', { name: '金色の本体', exact: true }) }).getByRole('button', { name: 'この作品を選ぶ', exact: true }).click();
  try { await page.getByText('この作品を選びました。', { exact: true }).waitFor(); }
  catch (error) {
    t.diagnostic(JSON.stringify({ alerts: await page.getByRole('alert').allTextContents(),
      selectedItemId: (await readUserAppearance({ workspace: s.workspace })).state.selectedItemId,
      expectedItemId: first.state.selectedItemId, actions: s.posts.slice(-10).map(row => row.path) }));
    throw error;
  }
  assert.equal((await readUserAppearance({ workspace: s.workspace })).state.selectedItemId, first.state.selectedItemId);
  await page.locator('.pixi-host').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.pixi-host').getAttribute('data-appearance'), 'layered');
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), s.sourceState);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.filter(row => /\/(apply|plan|register)$/.test(row.path)).length, 0);
  assert.deepEqual(s.errors, []);
});

test('a lost save response is checked with the original operation ID and creates one version', artworkBrowserCase, async t => {
  const s = await artworkBrowser(t), { page } = s;
  await page.goto(s.gui.url);
  const dialog = await importEntity(s, '返答を確認する作品');
  let drop = true;
  await page.route('**/api/sources/save-appearance-import', async route => {
    if (drop) { drop = false; await route.fetch(); await route.abort(); } else await route.continue();
  });
  await dialog.getByRole('button', { name: 'この作品を保存', exact: true }).click();
  await dialog.getByRole('button', { name: '外観の画面を閉じる', exact: true }).click();
  await page.getByRole('button', { name: '同じ作品操作の結果を確認', exact: true }).click();
  await page.getByText('作品をコレクションに保存しました。', { exact: true }).waitFor();
  const saves = s.posts.filter(row => row.path.endsWith('/save-appearance-import'));
  assert.equal(saves.length, 2); assert.deepEqual(saves[0].body, saves[1].body);
  const saved = await readUserAppearance({ workspace: s.workspace });
  assert.equal(saved.state.items.filter(item => item.kind === 'layered').length, 1);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(s.errors, []);
});

test('a damaged older image is identified while later collection thumbnails remain usable', artworkBrowserCase, async t => {
  const s = await artworkBrowser(t), { page } = s;
  let expectedStateId = null, firstImageId;
  for (const [name, color] of [['赤い作品', [230, 60, 60, 255]], ['青い作品', [60, 100, 230, 255]]]) {
    const review = await reviewAppearanceImport({ workspace: s.workspace, expectedStateId, requestId: randomUUID(),
      manifest: { templateId: getAppearanceTemplate().id, baseItemId: null, name, author: '', parts: [{ partId: 'entity', fileId: 'entity' }] },
      files: [{ fileId: 'entity', bytes: PNG.sync.write({ width: 1, height: 1, data: Buffer.from(color) }) }] });
    firstImageId ??= review.manifest.layers.entity.assetId;
    expectedStateId = (await saveAppearanceImport({ workspace: s.workspace, reviewId: review.reviewId, expectedStateId })).stateId;
  }
  const damagedPath = join(s.workspace, 'appearance-assets', firstImageId + '.png');
  await writeFile(damagedPath, 'INDEPENDENT DAMAGED PNG');
  await page.goto(s.gui.url);
  await page.getByRole('button', { name: 'コレクション', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('img', { name: '青い作品の見た目', exact: true }).waitFor();
  await dialog.getByRole('article').filter({ has: page.getByRole('heading', { name: '赤い作品', exact: true }) }).getByText('画像を表示できません', { exact: true }).waitFor();
  assert.equal(await readFile(damagedPath, 'utf8'), 'INDEPENDENT DAMAGED PNG');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(s.errors, []);
});

test('a review response for different requested parts is refused before a save is offered', artworkBrowserCase, async t => {
  const s = await artworkBrowser(t), { page } = s;
  await page.route('**/api/sources/review-appearance-import', async route => {
    const response = await route.fetch(), data = await response.json();
    data.result.replacedParts = ['background'];
    await route.fulfill({ response, json: data });
  });
  await page.goto(s.gui.url);
  await page.getByRole('button', { name: '作品を読み込む', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('本体のPNG', { exact: true }).setInputFiles(s.image);
  await dialog.getByRole('button', { name: '画像を確認', exact: true }).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByRole('button', { name: 'この作品を保存', exact: true }).count(), 0);
  assert.equal((await readUserAppearance({ workspace: s.workspace })).state, null);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('the import form maps a complete set to all thirteen fixed parts without preparing settings', artworkBrowserCase, async t => {
  const s = await artworkBrowser(t), { page } = s, template = getAppearanceTemplate();
  const parts = template.parts.filter(part => part.role === 'restraints'), files = [];
  for (const part of parts) { const path = join(s.parent, part.id + '.png'); await writeFile(path, await readFile(s.image)); files.push(path); }
  assert.equal(parts.length, 11);
  await page.goto(s.gui.url);
  await page.getByRole('button', { name: '作品を読み込む', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('本体のPNG', { exact: true }).setInputFiles(s.image);
  await dialog.getByLabel('背景のPNG', { exact: true }).setInputFiles(s.image);
  await dialog.getByText('拘束具を作り替える', { exact: true }).click();
  await dialog.getByLabel('拘束具のPNG', { exact: true }).setInputFiles(files);
  await dialog.getByRole('button', { name: '画像を確認', exact: true }).click();
  await dialog.getByRole('img', { name: 'TRUEFORMの合成プレビュー', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'この作品を保存', exact: true }).click();
  await page.getByText('作品をコレクションに保存しました。', { exact: true }).waitFor();
  const saved = (await readUserAppearance({ workspace: s.workspace })).state.items.at(-1).manifest;
  assert.equal(saved.layers.restraints.length, 11);
  assert.equal(new Set([saved.layers.entity.assetId, saved.layers.background.assetId, ...saved.layers.restraints.map(part => part.assetId)]).size, 1);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(s.posts.filter(row => /\/(apply|plan|register)$/.test(row.path)).length, 0);
  assert.deepEqual(s.errors, []);
});
