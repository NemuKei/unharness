import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';

const browserCase = {
  timeout: 60000,
  skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE
    && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks',
};
const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
const luminance = value => rgb(value).map(channel => channel / 255).map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
const contrast = (a, b) => { const values = [luminance(a), luminance(b)].sort((x, y) => y - x); return (values[0] + 0.05) / (values[1] + 0.05); };

test('the local workbench exposes a session theme choice and reduced motion removes decorative transitions', browserCase, async t => {
  const p = await aiProfile(t);
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  t.after(() => gui.close());
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.UNHARNESS_BROWSER_EXECUTABLE
      ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE }
      : {}),
  });
  t.after(() => browser.close());
  const context = await browser.newContext({
    colorScheme: 'light',
    reducedMotion: 'reduce',
    viewport: { width: 536, height: 900 },
  });
  const page = await context.newPage();
  const posts = [];
  page.on('request', request => {
    if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
  });

  await page.goto(gui.url);
  const theme = page.getByRole('group', { name: '表示テーマ', exact: true });
  await theme.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'system');
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');

  await theme.getByRole('button', { name: '暗色', exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await theme.getByRole('button', { name: '暗色', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-fast'))), 0.01);
  assert.equal(posts.filter(path => /\/(apply|apply-setup|register|recover)$/.test(path)).length, 0);
  const palettes = [];
  for (const themeName of ['light', 'dark']) for (const appearance of ['default', 'silver', 'amber']) {
    await page.evaluate(({ themeName, appearance }) => {
      document.documentElement.dataset.theme = themeName;
      document.documentElement.dataset.resolvedTheme = themeName;
      document.querySelector('.source-workbench').dataset.appearance = appearance;
    }, { themeName, appearance });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    palettes.push(await page.evaluate(({ themeName, appearance }) => {
      const root = document.documentElement, app = document.querySelector('.source-workbench'), probe = document.createElement('span');
      app.append(probe);
      probe.style.color = 'var(--appearance-accent)'; const accent = getComputedStyle(probe).color;
      probe.style.color = 'var(--destructive)'; const destructive = getComputedStyle(probe).color;
      probe.style.color = 'var(--foreground)'; const foreground = getComputedStyle(probe).color;
      probe.style.backgroundColor = 'var(--surface)'; const surface = getComputedStyle(probe).backgroundColor;
      probe.style.backgroundColor = 'var(--surface-raised)'; const surfaceRaised = getComputedStyle(probe).backgroundColor;
      const cards = [...document.querySelectorAll('.mode-card button')].map(element => {
        const style = getComputedStyle(element); return { background: style.backgroundColor, image: style.backgroundImage };
      });
      const selectedTheme = getComputedStyle(document.querySelector('.theme-switch button[aria-pressed="true"]'));
      const selectedColor = getComputedStyle(document.querySelector('.selected-name')).color;
      probe.remove(); return { theme: themeName, appearance, accent, destructive, foreground, selectedColor, surface, surfaceRaised, cards,
        selectedThemeColor: selectedTheme.color, selectedThemeBackground: selectedTheme.backgroundColor, background: getComputedStyle(root).backgroundColor };
    }, { themeName, appearance }));
  }
  for (const themeName of ['light', 'dark']) {
    const rows = palettes.filter(row => row.theme === themeName);
    assert.equal(new Set(rows.map(row => row.accent)).size, 3);
    assert.equal(new Set(rows.map(row => row.destructive)).size, 1, 'appearance never changes destructive semantics');
    for (const row of rows) for (const card of row.cards) {
      assert.ok([row.surface, row.surfaceRaised].includes(card.background), JSON.stringify(row)); assert.equal(card.image, 'none');
    }
    for (const row of rows) assert.equal(row.selectedColor, row.foreground);
    for (const row of rows) assert.ok(contrast(row.selectedThemeColor, row.selectedThemeBackground) >= 4.5);
  }
  assert.notEqual(palettes.find(row => row.theme === 'light').background, palettes.find(row => row.theme === 'dark').background);

  if (process.env.UNHARNESS_UI_SCREENSHOT_DIR) {
    await mkdir(process.env.UNHARNESS_UI_SCREENSHOT_DIR, { recursive: true });
    for (const shot of [
      { name: 'wide-default-dark.png', width: 1440, height: 1000, theme: 'dark', appearance: 'default' },
      { name: 'pane-silver-light.png', width: 536, height: 1000, theme: 'light', appearance: 'silver' },
      { name: 'mobile-amber-dark.png', width: 390, height: 844, theme: 'dark', appearance: 'amber' },
    ]) {
      await page.setViewportSize({ width: shot.width, height: shot.height });
      await page.evaluate(({ themeName, appearance }) => {
        document.documentElement.style.fontSize = '';
        document.documentElement.dataset.theme = themeName;
        document.documentElement.dataset.resolvedTheme = themeName;
        document.querySelector('.source-workbench').dataset.appearance = appearance;
      }, { themeName: shot.theme, appearance: shot.appearance });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: join(process.env.UNHARNESS_UI_SCREENSHOT_DIR, shot.name), fullPage: false });
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.evaluate(() => {
    const header = document.querySelector('.topbar').getBoundingClientRect();
    const controls = document.querySelector('.header-right').getBoundingClientRect();
    return controls.top >= header.top && controls.bottom <= header.bottom;
  }), true, 'header controls remain inside the top bar');
  assert.ok(['none', ''].includes(await page.locator('.mode-card button').first().evaluate(element => getComputedStyle(element).backgroundImage)));
  await theme.getByRole('button', { name: '暗色', exact: true }).focus();
  assert.ok(await theme.getByRole('button', { name: '暗色', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).outlineWidth)) >= 2);
  const nav = page.getByRole('navigation', { name: 'ワークベンチ', exact: true });
  await nav.locator('summary').focus(); await page.keyboard.press('Enter');
  await nav.getByRole('button', { name: '設定', exact: true }).focus(); await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#view=settings');
  if (process.env.UNHARNESS_UI_SCREENSHOT_DIR) {
    await page.setViewportSize({ width: 536, height: 1000 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
      document.documentElement.dataset.theme = 'light';
      document.documentElement.dataset.resolvedTheme = 'light';
      document.querySelector('.source-workbench').dataset.appearance = 'silver';
    });
    await page.screenshot({ path: join(process.env.UNHARNESS_UI_SCREENSHOT_DIR, 'settings-silver-light.png'), fullPage: false });
  }
});
