import { createHash } from 'node:crypto';
import { crc32, inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { fail } from '../sources/errors.mjs';
import { WORLD } from './parts.mjs';
import { LAYER_IMAGE_LIMIT } from './template.mjs';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const MAX_LAYER_INPUT_SIDE = 2048;
const invalid = () => fail('appearance-image-invalid');
function compressedSize(width, height, depth, channels, interlace) {
  const passes = interlace ? [[0,0,8,8], [4,0,8,8], [0,4,4,8], [2,0,4,4], [0,2,2,4], [1,0,2,2], [0,1,1,2]] : [[0,0,1,1]];
  return passes.reduce((size, [x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx)), rows = Math.max(0, Math.ceil((height - y) / dy));
    return size + (columns && rows ? (Math.ceil(columns * channels * depth / 8) + 1) * rows : 0);
  }, 0);
}
// Container checks bound work before the decoder allocates or inflates data.
// pngjs performs the actual pixel decoding and encoding; this is not a codec.
function inspectPng(bytes) {
  if (bytes.length < 45 || bytes.length > LAYER_IMAGE_LIMIT || !bytes.subarray(0, 8).equals(SIGNATURE)) invalid();
  const data = [], single = new Set(); let offset = 8, count = 0, ended = false, closed = false, image;
  while (offset < bytes.length) {
    if (++count > 4096 || offset + 12 > bytes.length) invalid();
    const size = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8), end = offset + 12 + size;
    if (end > bytes.length || !/^[A-Za-z]{4}$/.test(type) || type[2] !== type[2].toUpperCase()
      || crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid();
    if (count === 1 && type !== 'IHDR' || ['acTL', 'fcTL', 'fdAT'].includes(type)) invalid();
    if (['IHDR', 'PLTE', 'tRNS', 'gAMA', 'IEND'].includes(type)) {
      if (single.has(type)) invalid(); single.add(type);
    }
    if (type === 'IHDR') {
      if (count !== 1 || size !== 13) invalid();
      const width = bytes.readUInt32BE(offset + 8), height = bytes.readUInt32BE(offset + 12);
      const depth = bytes[offset + 16], color = bytes[offset + 17], interlace = bytes[offset + 20];
      const allowedDepth = { 0: [1,2,4,8,16], 2: [8,16], 3: [1,2,4,8], 4: [8,16], 6: [8,16] }[color];
      if (!width || width !== height || width > MAX_LAYER_INPUT_SIDE || !allowedDepth?.includes(depth)
        || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || ![0,1].includes(interlace)) invalid();
      image = { width, height, expected: compressedSize(width, height, depth, { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color], interlace) };
    } else if (type === 'IDAT') {
      if (closed) invalid(); data.push(bytes.subarray(offset + 8, end - 4));
    } else {
      if (data.length) closed = true;
      if (['PLTE', 'tRNS', 'gAMA'].includes(type) && data.length) invalid();
      if (type === 'IEND') { if (size !== 0 || !data.length || end !== bytes.length) invalid(); ended = true; }
      else if (type[0] === type[0].toUpperCase() && type !== 'PLTE') invalid();
    }
    offset = end;
  }
  if (!image || !ended) invalid();
  // The decoder's interlaced path inflates without a limit. Preflight both
  // paths with Node's bounded inflater, checking complete stream consumption.
  const compressed = Buffer.concat(data), decoded = inflateSync(compressed, { maxOutputLength: image.expected + 1, info: true });
  if (decoded.buffer.length !== image.expected || decoded.engine.bytesWritten !== compressed.length) invalid();
  return image;
}
export function normalizeLayerPng(input) {
  try {
    if (!(input instanceof Uint8Array) || input.byteLength > LAYER_IMAGE_LIMIT) invalid();
    const original = Buffer.from(input), size = inspectPng(original);
    const decoded = PNG.sync.read(original, { checkCRC: true, skipRescale: false });
    if (decoded.width !== size.width || decoded.height !== size.height || decoded.data.length !== size.width * size.height * 4) invalid();
    const data = Buffer.alloc(WORLD * WORLD * 4);
    for (let y = 0; y < WORLD; ++y) for (let x = 0; x < WORLD; ++x) {
      const from = (Math.min(size.height - 1, Math.floor((y + 0.5) * size.height / WORLD)) * size.width
        + Math.min(size.width - 1, Math.floor((x + 0.5) * size.width / WORLD))) * 4;
      const to = (y * WORLD + x) * 4;
      if (decoded.data[from + 3] !== 0) decoded.data.copy(data, to, from, from + 4);
    }
    const bytes = PNG.sync.write({ width: WORLD, height: WORLD, data, gamma: decoded.gamma || undefined },
      { colorType: 6, inputColorType: 6, inputHasAlpha: true, bitDepth: 8, filterType: 4, deflateLevel: 9 });
    if (bytes.length > LAYER_IMAGE_LIMIT) invalid();
    return { asset: { assetId: createHash('sha256').update(bytes).digest('hex'), format: 'png', width: WORLD, height: WORLD, bytes: bytes.length },
      bytes, sourceWidth: size.width, sourceHeight: size.height, resized: size.width !== WORLD };
  } catch { invalid(); }
}
