// Test-only Vite/Chrome scene host; no source profile, API, or public deployment.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const layerBrowserCase = { timeout: 120000, skip: !process.env.UNHARNESS_PLAYWRIGHT_MODULE
  && 'Set UNHARNESS_PLAYWRIGHT_MODULE for real Pixi/Chrome pixel tests' };
export async function layerBrowser(t) {
  const { createServer } = await import('vite');
  const server = await createServer({ root: resolve('.'), configFile: false, logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, fs: { strict: true, allow: [resolve('.')] } },
    plugins: [{ name: 'owned-layer-scene-host', configureServer(vite) {
      vite.middlewares.use('/__layer-test', (_, response) => {
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws://127.0.0.1:*; style-src 'self' 'unsafe-inline'; object-src 'none'" });
        response.end('<!doctype html><html><body><div id="host"></div></body></html>');
      });
    } }] });
  let browser;
  t.after(async () => { try { await browser?.close(); } finally { await server.close(); } });
  await server.listen();
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  browser = await chromium.launch({ headless: true,
    ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 900, height: 900 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__layer-test`);
  await page.evaluate(async () => {
    const { layerFixture } = await import('/test-support/layer-renderer-browser.mjs');
    window.layerFixture = await layerFixture(document.getElementById('host'));
  });
  return { page, errors };
}
