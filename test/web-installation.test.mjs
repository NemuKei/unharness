import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build, createServer } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { publicBrowser, publicBrowserCase } from '../test-support/public-browser.mjs';
import { PUBLIC_WEB_ORIGIN } from '../src/gui/remote-policy.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

const release = Object.freeze({ version: '0.0.1', archiveUrl: 'https://releases.example.test/unharness-0.0.1-macos-arm64.zip',
  archiveSha256: 'a'.repeat(64), distributionId: 'b'.repeat(64), sourceUrl: 'https://source.example.test/unharness/tree/reviewed' });

test('installation only exposes an exact published release and a bounded AI request', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { PublicInstall } = await vite.ssrLoadModule('/src/entry/PublicEntry.tsx');
  const pending = renderToStaticMarkup(createElement(PublicInstall, { release: null }));
  assert.match(pending, /公開配布を準備しています/);
  assert.doesNotMatch(pending, /Codexへの導入依頼|Mac版ZIPをダウンロード/);
  const available = renderToStaticMarkup(createElement(PublicInstall, { release }));
  assert.match(available, /Codexに導入を頼む/);
  assert.match(available, /Apple Silicon/);
  assert.match(available, /Intel Mac/);
  assert.ok(available.includes(release.archiveUrl));
  assert.ok(available.includes(release.archiveSha256));
  assert.ok(available.includes(release.distributionId));
  assert.ok(available.includes(release.sourceUrl));
  assert.match(available, /はじめに\.md/);
  assert.match(available, /SHA-256/);
  assert.match(available, /Normal/);
  assert.match(available, /メモリ/);
  assert.match(available, /権限/);
  assert.match(available, /解除対象は私が確認して選びます/);
  assert.doesNotMatch(available, /公開ダウンロードはまだ開始していません/);
});

test('built published installation copies the pinned request and withholds it for unsupported targets', publicBrowserCase, async t => {
  const assets = await mkdtemp(join(tmpdir(), 'unharness-installation-build-'));
  const fixtureConfig = { author: 'DeltaHelm Lab', authorUrl: 'https://deltahelmlab.com/', releaseLabel: 'Synthetic release test',
    publicRepositoryUrl: null, macCodexRelease: release };
  await build({ configFile: resolve('vite.site.config.mjs'), logLevel: 'silent', build: { outDir: assets, emptyOutDir: true },
    plugins: [{ name: 'synthetic-published-release', enforce: 'pre', load(id) {
      if (id === resolve('web/src/site-config.ts')) return 'export const siteConfig = Object.freeze(' + JSON.stringify(fixtureConfig) + ');';
    } }] });
  const s = await publicBrowser(t, { siteAssetsDirectory: assets }), { page } = s;
  t.after(() => rm(assets, { recursive: true, force: true }));
  await s.browserContext.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', {
    configurable: true, value: async text => { window.__copiedInstallation = text; },
  }));
  await page.goto(PUBLIC_WEB_ORIGIN);
  await page.getByRole('button', { name: /02.*自分のAIに導入する/ }).click();
  await page.getByRole('heading', { name: 'Codexに導入を頼む', exact: true }).waitFor();
  const field = page.getByRole('textbox', { name: 'Codexへの導入依頼', exact: true });
  const request = await field.inputValue();
  for (const value of Object.values(release)) assert.ok(request.includes(value));
  await page.getByRole('button', { name: '導入依頼をコピー', exact: true }).click();
  await page.getByText('コピーしました。AIの入力欄に貼り付けて送信してください。', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__copiedInstallation), request);
  await page.getByText('自分でダウンロード・配布物を確認', { exact: true }).click();
  assert.equal(await page.getByRole('link', { name: 'Mac版ZIPをダウンロード', exact: true }).getAttribute('href'), release.archiveUrl);
  assert.equal(await page.getByRole('link', { name: 'ソースとライセンスを確認', exact: true }).getAttribute('href'), release.sourceUrl);
  await s.screenshot('public-install-published-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await s.screenshot('public-install-published-mobile.png');
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw Error('Synthetic failure'); } }));
  await page.getByRole('button', { name: '導入依頼をコピー', exact: true }).click();
  await page.getByText('コピーできませんでした。依頼文を選択してコピーしてください。', { exact: true }).waitFor();
  assert.equal(await field.evaluate(e => document.activeElement === e && e.selectionEnd - e.selectionStart === e.value.length), true);
  await page.getByLabel('使うOS', { exact: true }).selectOption('windows');
  await page.getByRole('heading', { name: 'この組み合わせは後続の対応です', exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Codexへの導入依頼', exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Mac版ZIPをダウンロード', exact: true }).count(), 0);
  await page.getByLabel('使うOS', { exact: true }).selectOption('mac');
  await page.getByLabel('使うAI', { exact: true }).selectOption('claude');
  await page.getByRole('heading', { name: 'この組み合わせは後続の対応です', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '導入依頼をコピー', exact: true }).count(), 0);
  await page.getByLabel('使うAI', { exact: true }).selectOption('codex');
  assert.equal(await field.inputValue(), request);
  assert.equal(s.posts.length, 0);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(s.errors, []);
  await s.assertNoSecrets();
  await s.browserContext.unrouteAll({ behavior: 'wait' });
});
