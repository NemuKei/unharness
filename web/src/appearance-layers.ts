import stock from '../../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };

export type LayerAsset = { assetId: string; format: 'png'; width: 724; height: 724; bytes: number };
export type LayerManifest = { kind: 'unharness-layered-appearance'; schemaVersion: 1; templateId: string;
  assets: LayerAsset[]; layers: { entity: { assetId: string }; background: { assetId: string };
    restraints: Array<{ partId: string; assetId: string }> } };
export const stockLayerManifest = stock.manifest as LayerManifest;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function validLayerManifest(value: unknown): value is LayerManifest {
  if (!exact(value, ['kind', 'schemaVersion', 'templateId', 'assets', 'layers']) || value.kind !== 'unharness-layered-appearance'
    || value.schemaVersion !== 1 || value.templateId !== stock.manifest.templateId || !Array.isArray(value.assets)
    || !value.assets.length || value.assets.length > 64 || !exact(value.layers, ['entity', 'background', 'restraints'])) return false;
  const ids = new Set<string>(); let bytes = 0;
  for (const asset of value.assets) {
    if (!exact(asset, ['assetId', 'format', 'width', 'height', 'bytes']) || !hash(asset.assetId) || ids.has(asset.assetId)
      || asset.format !== 'png' || asset.width !== 724 || asset.height !== 724 || typeof asset.bytes !== 'number'
      || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > 8 * 1024 * 1024) return false;
    ids.add(asset.assetId); bytes += asset.bytes;
  }
  if (bytes > 64 * 1024 * 1024) return false;
  const used = new Set<string>();
  for (const role of ['entity', 'background']) {
    const part = value.layers[role];
    if (!exact(part, ['assetId']) || !hash(part.assetId) || !ids.has(part.assetId)) return false;
    used.add(part.assetId);
  }
  const expected = stock.manifest.layers.restraints.map(part => part.partId), seen = new Set<string>();
  if (!Array.isArray(value.layers.restraints) || value.layers.restraints.length !== expected.length) return false;
  for (const part of value.layers.restraints) {
    if (!exact(part, ['partId', 'assetId']) || typeof part.partId !== 'string' || !expected.includes(part.partId) || seen.has(part.partId)
      || !hash(part.assetId) || !ids.has(part.assetId)) return false;
    seen.add(part.partId); used.add(part.assetId);
  }
  return used.size === ids.size;
}

// The caller owns authentication/transport. Rendering never accepts a URL/path.
export type LayerImageLoader = (asset: LayerAsset, signal: AbortSignal) => Promise<Blob>;
export type PreparedLayerImages = {
  manifest: LayerManifest; replacements: ReadonlyMap<string, string>;
  images: ReadonlyMap<string, ImageBitmap>; destroy: () => void;
};
const standardAssets = new Map(stock.manifest.assets.map(asset => [asset.assetId, { ...asset }]));
const imageInvalid = (): never => { throw Error('appearance-image-invalid'); };
const abortError = () => new DOMException('Layer selection cancelled', 'AbortError');
function checkAbort(signal: AbortSignal) { if (signal.aborted) throw abortError(); }

// createImageBitmap has no AbortSignal. A late result still belongs to the
// abandoned selection and must be closed, not attached to a subsequent one.
function abortable<T>(pending: Promise<T>, signal: AbortSignal, releaseLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const abort = () => { if (!finished) { finished = true; reject(abortError()); } };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    pending.then(value => {
      signal.removeEventListener('abort', abort);
      if (finished) { releaseLate?.(value); return; }
      finished = true; resolve(value);
    }, error => {
      signal.removeEventListener('abort', abort);
      if (!finished) { finished = true; reject(error); }
    });
  });
}
const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 255];
  return (value ^ 0xffffffff) >>> 0;
}
function inspectLayerPng(bytes: Uint8Array) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 45 || signature.some((byte, i) => bytes[i] !== byte)) imageInvalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), single = new Set<string>();
  let offset = 8, count = 0, dataBytes = 0, dataClosed = false, ended = false;
  while (offset < bytes.length) {
    if (++count > 4096 || offset + 12 > bytes.length) imageInvalid();
    const size = view.getUint32(offset), end = offset + 12 + size;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase()
      || crc32(bytes.subarray(offset + 4, end - 4)) !== view.getUint32(end - 4)
      || ['acTL', 'fcTL', 'fdAT'].includes(type) || (count === 1 && type !== 'IHDR')) imageInvalid();
    if (['IHDR', 'PLTE', 'tRNS', 'gAMA', 'IEND'].includes(type)) {
      if (single.has(type)) imageInvalid(); single.add(type);
    }
    if (type === 'IHDR') {
      if (count !== 1 || size !== 13 || view.getUint32(offset + 8) !== 724 || view.getUint32(offset + 12) !== 724) imageInvalid();
      const depth = bytes[offset + 16], color = bytes[offset + 17];
      const depths: Record<number, number[]> = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] };
      if (!depths[color]?.includes(depth) || bytes[offset + 18] || bytes[offset + 19] || ![0, 1].includes(bytes[offset + 20])) imageInvalid();
    } else if (type === 'IDAT') {
      if (dataClosed) imageInvalid(); dataBytes += size;
    } else {
      if (dataBytes) dataClosed = true;
      if (['PLTE', 'tRNS', 'gAMA'].includes(type) && dataBytes) imageInvalid();
      if (type === 'IEND') {
        if (size || !dataBytes || end !== bytes.length) imageInvalid(); ended = true;
      } else if (type[0] === type[0].toUpperCase() && type !== 'PLTE') imageInvalid();
    }
    offset = end;
  }
  if (!ended) imageInvalid();
}
async function decodeLayerImage(asset: LayerAsset, blob: Blob, signal: AbortSignal): Promise<ImageBitmap> {
  checkAbort(signal);
  if (!(blob instanceof Blob) || blob.size !== asset.bytes || blob.size > 8 * 1024 * 1024) imageInvalid();
  const bytes = new Uint8Array(await abortable(blob.arrayBuffer(), signal));
  inspectLayerPng(bytes);
  const digest = await abortable(crypto.subtle.digest('SHA-256', bytes), signal);
  const id = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (id !== asset.assetId) imageInvalid();
  checkAbort(signal);
  if (typeof globalThis.createImageBitmap !== 'function') throw Error('appearance-image-decode-unavailable');
  let image: ImageBitmap;
  try {
    image = await abortable(createImageBitmap(new Blob([bytes], { type: 'image/png' }), {
      imageOrientation: 'none', premultiplyAlpha: 'premultiply', colorSpaceConversion: 'default',
    }), signal, late => late.close());
  } catch { if (signal.aborted) throw abortError(); throw Error('appearance-image-invalid'); }
  if (signal.aborted || image.width !== 724 || image.height !== 724) {
    image.close(); checkAbort(signal); imageInvalid();
  }
  return image;
}

/** Validate/decode a complete replacement set off-stage. Stock IDs are skipped
 * only for their original part, so the accepted renderer remains pixel-stable. */
export async function prepareLayerImages(manifest: LayerManifest, loadImage: LayerImageLoader | undefined,
  signal: AbortSignal): Promise<PreparedLayerImages> {
  checkAbort(signal);
  if (!validLayerManifest(manifest)) throw Error('appearance-layer-invalid');
  const selected = structuredClone(manifest), assets = new Map(selected.assets.map(asset => [asset.assetId, asset]));
  for (const asset of selected.assets) {
    const standard = standardAssets.get(asset.assetId);
    if (standard && (asset.bytes !== standard.bytes || asset.width !== standard.width || asset.height !== standard.height))
      throw Error('appearance-layer-invalid');
  }
  const parts = new Map([['background', selected.layers.background.assetId], ['entity', selected.layers.entity.assetId],
    ...selected.layers.restraints.map(part => [part.partId, part.assetId] as [string, string])]);
  const replacements = new Map(stock.files.filter(part => parts.get(part.partId) !== part.assetId)
    .map(part => [part.partId, parts.get(part.partId)!]));
  if (replacements.size && typeof loadImage !== 'function') throw Error('appearance-image-loader-required');
  const images = new Map<string, ImageBitmap>(); let destroyed = false;
  const destroy = () => { if (!destroyed) { destroyed = true; images.forEach(image => image.close()); images.clear(); } };
  try {
    // Sequential decoding bounds live intermediate memory. Repeated references
    // share one owned bitmap; cancellation also cleans previously decoded parts.
    for (const id of new Set(replacements.values())) {
      checkAbort(signal);
      const asset = Object.freeze({ ...assets.get(id)! });
      const blob = await abortable(Promise.resolve(loadImage!(asset, signal)), signal);
      images.set(id, await decodeLayerImage(asset, blob, signal));
    }
    checkAbort(signal);
    return { manifest: selected, replacements, images, destroy };
  } catch (error) { destroy(); throw error; }
}
