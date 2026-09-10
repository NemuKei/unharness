// Owned, static PNG bytes for image-boundary tests; no files or personal data.
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
export function pngCrc(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function pngChunk(type, data = Buffer.alloc(0)) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); out.write(type, 4, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(pngCrc(out.subarray(4, out.length - 4)), out.length - 4);
  return out;
}
export function layerPng({ side = 724, rgba = [34, 155, 211, 255], beforeData = [], data } = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(side); header.writeUInt32BE(side, 4); header[8] = 8; header[9] = 6;
  const pixels = Buffer.alloc((side * 4 + 1) * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++)
    for (let c = 0; c < 4; c++) pixels[y * (side * 4 + 1) + 1 + x * 4 + c] = rgba[c];
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', header), ...beforeData,
    pngChunk('IDAT', data ?? deflateSync(pixels)), pngChunk('IEND')]);
}
export const imageAsset = bytes => ({ assetId: createHash('sha256').update(bytes).digest('hex'), format: 'png', width: 724, height: 724, bytes: bytes.length });
export function replaceLayerParts(stock, replacements) {
  const manifest = structuredClone(stock), added = new Map();
  for (const [partId, bytes] of Object.entries(replacements)) {
    const asset = imageAsset(bytes); added.set(asset.assetId, asset);
    if (partId === 'entity' || partId === 'background') manifest.layers[partId].assetId = asset.assetId;
    else manifest.layers.restraints.find(part => part.partId === partId).assetId = asset.assetId;
  }
  const used = new Set([manifest.layers.entity.assetId, manifest.layers.background.assetId, ...manifest.layers.restraints.map(p => p.assetId)]);
  manifest.assets = [...manifest.assets, ...added.values()].filter((asset, index, all) => used.has(asset.assetId)
    && all.findIndex(a => a.assetId === asset.assetId) === index);
  return manifest;
}
