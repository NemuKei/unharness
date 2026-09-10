import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { captureFileBytes } from '../sources/platform.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { getAppearanceTemplate, validateLayeredAppearance, LAYER_IMAGE_LIMIT } from './template.mjs';

const directory = fileURLToPath(new URL('../../assets/appearance-templates/hangar-layered-v1/', import.meta.url));
const invalid = () => fail('appearance-stock-invalid');
export async function readStockAppearance() {
  try {
    const template = getAppearanceTemplate(), file = await captureFileBytes(join(directory, 'stock.json'), 1024 * 1024);
    if (!file) invalid();
    const value = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    exactKeys(value, ['kind', 'schemaVersion', 'manifest', 'files'], [], 'appearance-stock-invalid');
    if (value.kind !== 'unharness-stock-layers' || value.schemaVersion !== 1 || !Array.isArray(value.files)
      || value.files.length !== template.parts.length) invalid();
    const manifest = validateLayeredAppearance(value.manifest, template), seen = new Set();
    for (const row of value.files) {
      exactKeys(row, ['partId', 'file', 'assetId'], [], 'appearance-stock-invalid');
      if (!template.parts.some(part => part.id === row.partId) || seen.has(row.partId) || row.file !== row.partId + '.png') invalid();
      const selected = row.partId === 'entity' || row.partId === 'background' ? manifest.layers[row.partId].assetId
        : manifest.layers.restraints.find(part => part.partId === row.partId)?.assetId;
      if (selected !== row.assetId) invalid(); seen.add(row.partId);
    }
    const savedTemplate = await captureFileBytes(join(directory, 'template.json'), 1024 * 1024);
    if (!savedTemplate || !isDeepStrictEqual(parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(savedTemplate.bytes)), template)) invalid();
    return { template, manifest, files: value.files };
  } catch { invalid(); }
}
export async function readStockImage(assetId) {
  try {
    const stock = await readStockAppearance(), row = stock.files.find(row => row.assetId === assetId);
    const asset = stock.manifest.assets.find(asset => asset.assetId === assetId);
    if (!row || !asset) invalid();
    const file = await captureFileBytes(join(directory, row.file), LAYER_IMAGE_LIMIT);
    if (!file || file.bytes.length !== asset.bytes || createHash('sha256').update(file.bytes).digest('hex') !== assetId) invalid();
    return { asset, bytes: file.bytes };
  } catch { invalid(); }
}
