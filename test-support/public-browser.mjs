import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { aiProfile } from './ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';

export const PUBLIC_WEB_ORIGIN = 'https://unharness.deltahelmlab.com';
export const publicBrowserCase = { timeout: 60000, skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE
  && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };

/** Synthetic public origin for informational pages, with a separate local workbench. */
export async function publicBrowser(t, { clipboardFails = false, siteAssetsDirectory = resolve('site-dist') } = {}) {
  const cleanups = [], p = await aiProfile({ after: fn => cleanups.push(fn) });
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory: resolve('dist') });
  let browser, browserContext;
  t.after(async () => {
    try { await browserContext?.unrouteAll({ behavior: 'wait' }); }
    finally {
      try { await browser?.close(); }
      finally { await gui.close(); for (const cleanup of cleanups) await cleanup(); }
    }
  });
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  browserContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1050 } });
  if (clipboardFails) await browserContext.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw Error('Synthetic clipboard failure'); } }));
  const siteRoot = resolve(siteAssetsDirectory), requests = [], posts = [], errors = [], httpErrors = [];
  await browserContext.route(PUBLIC_WEB_ORIGIN + '/**', async route => {
    const url = new URL(route.request().url()), path = resolve(siteRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    assert.ok(path.startsWith(siteRoot + '/'));
    requests.push({ url: url.href, method: route.request().method() });
    assert.equal(route.request().method(), 'GET');
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream';
    await route.fulfill({ status: 200, contentType, headers: { 'Referrer-Policy': 'no-referrer' }, body: await readFile(path) });
  });
  const page = await browserContext.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
  async function screenshot(name) {
    if (!process.env.UNHARNESS_PUBLIC_SCREENSHOT_DIR) return;
    await mkdir(process.env.UNHARNESS_PUBLIC_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.UNHARNESS_PUBLIC_SCREENSHOT_DIR, name) });
  }
  async function assertNoSecrets() {
    const visible = await page.evaluate(() => JSON.stringify({ url: location.href, text: document.body.innerText, local: localStorage, session: sessionStorage }));
    assert.ok(!visible.includes(p.context.project)); assert.ok(!visible.includes('PRIVATE_TEST'));
  }
  return { ...p, gui, browser, browserContext, page, requests, posts, errors, httpErrors, screenshot, assertNoSecrets };
}
