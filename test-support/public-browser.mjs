import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { aiProfile } from './ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { PUBLIC_WEB_ORIGIN } from '../src/gui/remote-policy.mjs';

export const publicBrowserCase = { timeout: 60000, skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE
  && 'Browser plugin not available; set UNHARNESS_PLAYWRIGHT_MODULE for built Playwright checks' };

/** Browser UI qualification with a synthetic HTTPS origin and routed transport.
 * This does not qualify real public TLS or local-network permission. */
export async function publicBrowser(t, { clipboardFails = false, siteAssetsDirectory = resolve('site-dist') } = {}) {
  const cleanups = [], p = await aiProfile({ after: fn => cleanups.push(fn) });
  const assetsDirectory = resolve('dist');
  let time = Date.now(), dropApply = false;
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory }, { remoteNow: () => time });
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  const browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  let browserContext;
  t.after(async () => {
    try { await browserContext?.unrouteAll({ behavior: 'wait' }); }
    finally { await browser.close(); await gui.close(); for (const cleanup of cleanups) await cleanup(); }
  });
  browserContext = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 1050 } });
  await browserContext.addInitScript(() => {
    const definitions = new Map();
    Object.defineProperty(window, '__unharnessTestTools', { value: definitions });
    Object.defineProperty(document, 'modelContext', { configurable: true, value: {
      async registerTool(tool, { signal }) {
        if (signal.aborted) throw Error('Aborted registration');
        definitions.set(tool.name, tool);
        signal.addEventListener('abort', () => definitions.delete(tool.name), { once: true });
      },
    } });
  });
  if (clipboardFails) await browserContext.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw Error('Synthetic clipboard failure'); } }));
  const siteRoot = resolve(siteAssetsDirectory);
  const requests = [], posts = [], errors = [], httpErrors = [], secrets = new Set();
  await browserContext.route(PUBLIC_WEB_ORIGIN + '/**', async route => {
    const url = new URL(route.request().url()), path = resolve(siteRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    assert.ok(path.startsWith(siteRoot + '/'));
    requests.push({ url: url.href, method: route.request().method() });
    assert.equal(route.request().method(), 'GET', 'public origin never receives private operations');
    const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[extname(path)] ?? 'application/octet-stream';
    await route.fulfill({ status: 200, contentType, headers: { 'Referrer-Policy': 'no-referrer' }, body: await readFile(path) });
  });
  await browserContext.route(gui.url + '/remote/v2/**', async route => {
    const r = route.request();
    const authorization = r.headers().authorization;
    if (authorization?.startsWith('Bearer ')) secrets.add(authorization.slice(7));
    if (r.method() === 'POST') posts.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() });
    const response = await route.fetch();
    if (dropApply && r.url().endsWith('/apply')) { dropApply = false; await route.abort(); }
    else await route.fulfill({ response });
  });
  const page = await browserContext.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => {
    if (response.status() < 400) return;
    const failure = { path: new URL(response.url()).pathname, status: response.status(), kind: null };
    httpErrors.push(failure);
    void response.json().then(value => {
      if (typeof value?.error?.kind === 'string' && /^[a-z-]{1,64}$/.test(value.error.kind)) failure.kind = value.error.kind;
    }).catch(() => {});
  });
  const localHeaders = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  localHeaders['X-Unharness-Token'] = (await (await fetch(gui.url + '/api/bootstrap', { headers: localHeaders })).json()).token;
  async function approveLink() {
    const ticket = await gui.requestPublicPairing();
    secrets.add(ticket.ticket);
    assert.equal((await fetch(gui.url + '/api/remote/approve', { method: 'POST', headers: localHeaders,
      body: JSON.stringify({ requestId: randomUUID(), pairingId: ticket.pairingId }) })).status, 200);
    return PUBLIC_WEB_ORIGIN + '/#' + new URLSearchParams({ unharness: '2', port: new URL(gui.url).port, launch: ticket.launchId, ticket: ticket.ticket });
  }
  async function callPageTool(name, input) {
    return page.evaluate(async ({ name, input }) => JSON.parse(await window.__unharnessTestTools.get(name).execute(input)), { name, input });
  }
  async function screenshot(name) {
    if (!process.env.UNHARNESS_PUBLIC_SCREENSHOT_DIR) return;
    await mkdir(process.env.UNHARNESS_PUBLIC_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.UNHARNESS_PUBLIC_SCREENSHOT_DIR, name) });
  }
  async function assertNoSecrets() {
    const visible = await page.evaluate(() => JSON.stringify({ url: location.href, text: document.body.innerText, local: localStorage, session: sessionStorage }));
    for (const secret of secrets) assert.ok(!visible.includes(secret), 'ticket/token absent from URL, visible content and storage');
    assert.ok(!visible.includes(p.context.project)); assert.ok(!visible.includes('PRIVATE_TEST'));
  }
  return { ...p, gui, browser, browserContext, page, requests, posts, errors, httpErrors, approveLink, callPageTool, screenshot,
    assertNoSecrets, advance: ms => { time += ms; }, dropNextApply: () => { dropApply = true; } };
}
