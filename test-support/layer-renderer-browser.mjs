import { Texture, ImageSource } from 'pixi.js';
import { createScene } from '../web/src/renderer.ts';
import { stockLayerManifest } from '../web/src/appearance-layers.ts';

// Actual decoder/Pixi resources, with counters only. No renderer implementation
// is replaced here; Node structural doubles live in separate test files.
export async function layerFixture(host) {
  const counts = new Map(), decode = globalThis.createImageBitmap, close = ImageBitmap.prototype.close;
  const destroyTexture = Texture.prototype.destroy, destroySource = ImageSource.prototype.destroy;
  globalThis.createImageBitmap = async (...args) => {
    const image = await decode.apply(globalThis, args); counts.set(image, { bitmap: 0, texture: 0, source: 0 }); return image;
  };
  ImageBitmap.prototype.close = function () { const c = counts.get(this); if (c) c.bitmap++; return close.call(this); };
  Texture.prototype.destroy = function (...args) { const c = counts.get(this.source?.resource); if (c) c.texture++; return destroyTexture.apply(this, args); };
  ImageSource.prototype.destroy = function (...args) { const c = counts.get(this.resource); if (c) c.source++; return destroySource.apply(this, args); };
  const abort = new AbortController(), scene = await createScene(host, abort.signal);
  if (!scene) throw Error('scene unavailable');
  scene.setEffects(false);
  async function png(color, rect = [0, 0, 724, 724]) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 724;
    const context = canvas.getContext('2d'); context.fillStyle = color; context.fillRect(...rect);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw Error('PNG generation failed');
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    const asset = { assetId: [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join(''),
      format: 'png', width: 724, height: 724, bytes: blob.size };
    return { blob, asset };
  }
  function selection(replacements) {
    const manifest = structuredClone(stockLayerManifest), images = new Map();
    for (const [partId, value] of Object.entries(replacements)) {
      const target = ['background', 'entity'].includes(partId) ? manifest.layers[partId]
        : manifest.layers.restraints.find(p => p.partId === partId);
      if (!target) throw Error('unknown part'); target.assetId = value.asset.assetId; images.set(value.asset.assetId, value);
    }
    const used = new Set([manifest.layers.background.assetId, manifest.layers.entity.assetId, ...manifest.layers.restraints.map(p => p.assetId)]);
    manifest.assets = [...new Map([...manifest.assets, ...[...images.values()].map(v => v.asset)].map(a => [a.assetId, a])).values()].filter(a => used.has(a.assetId));
    return { manifest, load: async asset => { const v = images.get(asset.assetId); if (!v) throw Error('missing image'); return v.blob; } };
  }
  async function pixels(url) {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 724;
    const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0);
    return context.getImageData(0, 0, 724, 724).data;
  }
  async function same(a, b) { const x = await pixels(a), y = await pixels(b); return x.length === y.length && x.every((v, i) => v === y[i]); }
  async function sample(url, x, y) { const data = await pixels(url); return [...data.slice((y * 724 + x) * 4, (y * 724 + x) * 4 + 4)]; }
  return { scene, host, abort, png, selection, same, sample, stock: stockLayerManifest,
    counts: () => [...counts.values()].map(c => ({ ...c })),
    restore() {
      scene.destroy(); globalThis.createImageBitmap = decode; ImageBitmap.prototype.close = close;
      Texture.prototype.destroy = destroyTexture; ImageSource.prototype.destroy = destroySource;
    } };
}
