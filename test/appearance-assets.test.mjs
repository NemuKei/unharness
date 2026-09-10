import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { normalizeLayerPng } from '../src/appearances/assets.mjs';

function sample() {
  const data = Buffer.from([255,0,0,255, 0,255,0,128, 0,0,255,0, 255,255,255,255]);
  return PNG.sync.write({ width: 2, height: 2, data });
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length);
  out.write(type, 4, 'ascii'); data.copy(out, 8); out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function chunks(bytes) {
  const parts = []; let offset = 8;
  while (offset < bytes.length) { const size = bytes.readUInt32BE(offset); parts.push(bytes.subarray(offset, offset + size + 12)); offset += size + 12; }
  return parts;
}
test('PNG copies normalize to the shared canvas, keep alpha and do not modify their original', () => {
  const input = sample(), original = Buffer.from(input), result = normalizeLayerPng(input);
  assert.deepEqual(input, original);
  const decoded = PNG.sync.read(result.bytes);
  assert.equal(decoded.width, 724); assert.equal(decoded.height, 724);
  assert.deepEqual([...decoded.data.subarray(0, 4)], [255,0,0,255]);
  assert.deepEqual([...decoded.data.subarray(723 * 4, 724 * 4)], [0,255,0,128]);
  assert.equal(decoded.data[(723 * 724) * 4 + 3], 0);
  assert.equal(result.asset.assetId, createHash('sha256').update(result.bytes).digest('hex'));
  assert.equal(result.asset.bytes, result.bytes.length); assert.equal(result.asset.format, 'png');
  assert.equal(result.resized, true);
  assert.deepEqual(normalizeLayerPng(result.bytes).bytes, result.bytes);
});
test('metadata is removed from the stored copy without changing image pixels', () => {
  const plain = sample(), tagged = Buffer.concat([plain.subarray(0, 33), chunk('tEXt', Buffer.from('Comment\0PRIVATE fixture metadata')), plain.subarray(33)]);
  const result = normalizeLayerPng(tagged);
  assert.ok(!result.bytes.includes(Buffer.from('PRIVATE')));
  assert.deepEqual(result.bytes, normalizeLayerPng(plain).bytes);
  assert.deepEqual(chunks(result.bytes).map(value => value.toString('ascii', 4, 8)), ['IHDR', 'IDAT', 'IEND']);
});
test('interlaced and 16-bit PNGs fully decode into the same normalized pixels', () => {
  const plain = sample(), parts = chunks(plain), signature = plain.subarray(0, 8);
  const interlacedHeader = Buffer.from(parts[0].subarray(8, 21)); interlacedHeader[12] = 1;
  const adam7 = Buffer.from([0, 255,0,0,255, 0, 0,255,0,128, 0, 0,0,255,0, 255,255,255,255]);
  const interlaced = Buffer.concat([signature, chunk('IHDR', interlacedHeader), chunk('IDAT', deflateSync(adam7)), parts.at(-1)]);
  const deepHeader = Buffer.from(parts[0].subarray(8, 21)); deepHeader[8] = 16;
  const pixels = PNG.sync.read(plain).data, deepRows = Buffer.alloc(34);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) deepRows.writeUInt16BE(pixels[y * 8 + x] * 257, y * 17 + 1 + x * 2);
  const deep = Buffer.concat([signature, chunk('IHDR', deepHeader), chunk('IDAT', deflateSync(deepRows)), parts.at(-1)]);
  assert.deepEqual(normalizeLayerPng(interlaced).bytes, normalizeLayerPng(plain).bytes);
  assert.deepEqual(normalizeLayerPng(deep).bytes, normalizeLayerPng(plain).bytes);
});
test('animated, oversized, truncated, corrupt and over-expanding PNG inputs are rejected', () => {
  const plain = sample(), signature = plain.subarray(0, 8), parts = chunks(plain), header = Buffer.from(parts[0].subarray(8, 21));
  const huge = Buffer.from(header); huge.writeUInt32BE(50000, 0); huge.writeUInt32BE(50000, 4);
  const rectangle = Buffer.from(header); rectangle.writeUInt32BE(3, 0);
  const corrupt = Buffer.from(plain); corrupt[29] ^= 1;
  const extraPixels = Buffer.concat([signature, parts[0], chunk('IDAT', deflateSync(Buffer.alloc(5000))), parts.at(-1)]);
  const inputs = [Buffer.from('<svg></svg>'), Buffer.alloc(8 * 1024 * 1024 + 1), plain.subarray(0, -2), corrupt,
    Buffer.concat([plain, Buffer.from('trailing content')]),
    Buffer.concat([signature, chunk('IHDR', huge), ...parts.slice(1)]),
    Buffer.concat([signature, chunk('IHDR', rectangle), ...parts.slice(1)]), extraPixels,
    ...['acTL', 'fcTL', 'fdAT'].map(type => Buffer.concat([plain.subarray(0, 33), chunk(type, Buffer.alloc(8)), plain.subarray(33)]))];
  for (const input of inputs) assert.throws(() => normalizeLayerPng(input));
});
