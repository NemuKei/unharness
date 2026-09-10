import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { aiProfile } from './ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';

export async function importEntity(s, name) {
  const { page } = s;
  await page.getByRole('button', { name: '作品を読み込む', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('作品名', { exact: true }).fill(name);
  await dialog.getByLabel('本体のPNG', { exact: true }).setInputFiles(s.image);
  await dialog.getByRole('button', { name: '画像を確認', exact: true }).click();
  await dialog.getByRole('img', { name: 'TRUEFORMの合成プレビュー', exact: true }).waitFor();
  return dialog;
}

export const artworkBrowserCase = { timeout: 60000, skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE
  && 'Set UNHARNESS_PLAYWRIGHT_MODULE for the built browser checks.' };
export async function artworkBrowser(t, { clipboardFails = false } = {}) {
  const cleanups = [], p = await aiProfile({ after: fn => cleanups.push(fn) });
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  t.after(async () => { await browser.close(); await gui.close(); for (const cleanup of cleanups) await cleanup(); });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('unharness.effects.v1', 'off'));
  if (clipboardFails) await context.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw Error('Synthetic clipboard refusal'); } }));
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  const posts = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST') posts.push({ path: new URL(request.url()).pathname, body: request.postDataJSON() }); });
  const sourceState = await readFile(join(p.workspace, 'state.json'));
  const bytes = Buffer.alloc(724 * 724 * 4);
  for (let y = 200; y < 480; y++) for (let x = 300; x < 425; x++) {
    const i = (y * 724 + x) * 4; bytes[i] = 235; bytes[i + 1] = 155; bytes[i + 2] = 70; bytes[i + 3] = 255;
  }
  const image = join(p.parent, 'entity.png'); await writeFile(image, PNG.sync.write({ width: 724, height: 724, data: bytes }));
  async function screenshot(name) {
    if (!process.env.UNHARNESS_ARTWORK_SCREENSHOT_DIR) return;
    await mkdir(process.env.UNHARNESS_ARTWORK_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.UNHARNESS_ARTWORK_SCREENSHOT_DIR, name) });
  }
  return { ...p, gui, browser, browserContext: context, page, posts, errors, sourceState, image, screenshot };
}
