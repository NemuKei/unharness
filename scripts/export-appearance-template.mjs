// Development asset build. Uses an owned, temporary browser profile and the
// existing renderer. Does not connect to user configuration or call a model.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { getAppearanceTemplate, validateLayeredAppearance } from '../src/appearances/template.mjs';
import { normalizeLayerPng } from '../src/appearances/assets.mjs';
import { appearanceGuideSvg } from '../src/appearances/guide.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url))), template = getAppearanceTemplate();
const destination = resolve(process.argv[2] ?? join(root, 'assets/appearance-templates/hangar-layered-v1'));
if (!process.env.UNHARNESS_PLAYWRIGHT_MODULE) throw Error('Set UNHARNESS_PLAYWRIGHT_MODULE to the installed development Playwright module.');
const scratch = await mkdtemp(join(tmpdir(), 'unharness-template-export-'));
let server, browser;
try {
  const renderer = '/@fs' + join(root, 'web/src/renderer.ts');
  await writeFile(join(scratch, 'index.html'), `<!doctype html><html><body><p id="status">Loading</p><div id="scene" style="width:724px;height:724px"></div><script type="module">
    import { createScene } from ${JSON.stringify(renderer)};
    window.exportsReady = (async () => {
      const controller = new AbortController(), scene = await createScene(document.getElementById('scene'), controller.signal);
      if (!scene) throw Error('Renderer unavailable');
      try {
        scene.setEffects(false);
        const layers = await scene.templateLayers(), previews = [];
        for (const [mode, condition] of [['normal','baseline'],['unseal','manual-only'],['trueform','fixed-only']]) {
          scene.setCondition(condition, true); previews.push({mode, dataUrl: await scene.snapshot()});
        }
        document.getElementById('status').textContent = 'Ready'; return { layers, previews };
      } finally {scene.destroy();}
    })().catch(error => {document.getElementById('status').textContent = 'Failed'; throw error;});
  </script></body></html>`);
  server = await createServer({ configFile: false, root: scratch, cacheDir: join(scratch, 'cache'),
    logLevel: 'error', server: { host: '127.0.0.1', port: 0, fs: { allow: [root, scratch] } } });
  await server.listen();
  const address = server.httpServer.address();
  const { chromium } = await import(pathToFileURL(resolve(process.env.UNHARNESS_PLAYWRIGHT_MODULE)).href);
  browser = await chromium.launch({ headless: true, ...(process.env.UNHARNESS_BROWSER_EXECUTABLE ? { executablePath: process.env.UNHARNESS_BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 800, height: 800 }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const exported = await page.evaluate(() => window.exportsReady);
  if (!exported || errors.length) throw Error('Stock layer rendering failed: ' + errors.join('; '));
  const expected = template.parts.map(part => part.id).sort();
  if (JSON.stringify(exported.layers.map(part => part.id).sort()) !== JSON.stringify(expected)) throw Error('Stock layer set is incomplete.');
  const rows = exported.layers.map(part => {
    if (!/^data:image\/png;base64,/.test(part.dataUrl)) throw Error('Expected PNG export.');
    const normalized = normalizeLayerPng(Buffer.from(part.dataUrl.split(',')[1], 'base64'));
    return { partId: part.id, file: part.id + '.png', ...normalized };
  });
  const selected = new Map(rows.map(row => [row.partId, row.asset.assetId]));
  const manifest = validateLayeredAppearance({ kind: 'unharness-layered-appearance', schemaVersion: 1, templateId: template.id,
    assets: [...new Map(rows.map(row => [row.asset.assetId, row.asset])).values()],
    layers: { entity: { assetId: selected.get('entity') }, background: { assetId: selected.get('background') },
      restraints: template.parts.filter(part => part.role === 'restraints').map(part => ({ partId: part.id, assetId: selected.get(part.id) })) } }, template);
  // Refuse an existing destination rather than replacing a previous template.
  await mkdir(resolve(destination, '..'), { recursive: true }); await mkdir(destination);
  for (const row of rows) await writeFile(join(destination, row.file), row.bytes, { flag: 'wx' });
  for (const preview of exported.previews) await writeFile(join(destination, `preview-${preview.mode}.png`), Buffer.from(preview.dataUrl.split(',')[1], 'base64'), { flag: 'wx' });
  for (const role of ['all', 'entity', 'restraints', 'background']) {
    const svg = appearanceGuideSvg(role);
    const dataUrl = await page.evaluate(async source => {
      const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml' }));
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 724;
        canvas.getContext('2d').drawImage(image, 0, 0); return canvas.toDataURL('image/png');
      } finally { URL.revokeObjectURL(url); }
    }, svg);
    await writeFile(join(destination, `guide-${role}.svg`), svg, { flag: 'wx' });
    await writeFile(join(destination, `guide-${role}.png`), Buffer.from(dataUrl.split(',')[1], 'base64'), { flag: 'wx' });
  }
  await writeFile(join(destination, 'template.json'), JSON.stringify(template, null, 2) + '\n', { flag: 'wx' });
  const stock = { kind: 'unharness-stock-layers', schemaVersion: 1, manifest,
    files: rows.map(row => ({ partId: row.partId, file: row.file, assetId: row.asset.assetId })) };
  await writeFile(join(destination, 'stock.json'), JSON.stringify(stock, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ destination, templateId: template.id, layers: rows.length,
    bytes: rows.reduce((total, row) => total + row.bytes.length, 0), previews: exported.previews.length }));
} finally {
  await browser?.close(); await server?.close(); await rm(scratch, { recursive: true, force: true });
}
