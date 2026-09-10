import { isDeepStrictEqual } from 'node:util';
import { putRecord, readRecord, recordId } from '../core/local-store.mjs';
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { fail } from '../sources/errors.mjs';
import { withAppearanceWorkspace } from './workspace.mjs';
import { getAppearanceTemplate, validateLayeredAppearance, LAYER_COUNT_LIMIT, LAYER_IMAGE_LIMIT, LAYER_SET_LIMIT } from './template.mjs';
import { normalizeLayerPng, MAX_LAYER_INPUT_SIDE } from './assets.mjs';
import { readStockAppearance, readStockImage } from './stock.mjs';
import { readAppearanceImage, storeAppearanceImage } from './image-store.mjs';
import { readAppearanceStore, publishAppearanceState, appearanceStoreSummary } from './store.mjs';
import { appendLayeredAppearance, layeredItemId } from './lifecycle.mjs';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const fileId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
const invalid = () => fail('appearance-import-invalid');
const shape = (value, keys) => exactKeys(value, keys, [], 'appearance-import-invalid');
const request = (args, keys) => exactKeys(args, ['workspace', ...keys], [], 'invalid-request');
const stateId = value => value === null || hash(value);
export const APPEARANCE_UPLOAD_BODY_LIMIT = Math.ceil(LAYER_SET_LIMIT * 4 / 3) + 64 * 1024;

export async function reviewAppearanceUpload(args) {
  request(args, ['expectedStateId', 'importId', 'manifest', 'files']);
  if (!Array.isArray(args.files) || !args.files.length || args.files.length > LAYER_COUNT_LIMIT) invalid();
  let total = 0;
  const files = args.files.map(file => {
    shape(file, ['fileId', 'base64']);
    if (typeof file.base64 !== 'string' || file.base64.length > Math.ceil(LAYER_IMAGE_LIMIT / 3) * 4
      || file.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.base64)) invalid();
    const bytes = Buffer.from(file.base64, 'base64');
    total += bytes.length;
    if (bytes.toString('base64') !== file.base64 || total > LAYER_SET_LIMIT) invalid();
    return { fileId: file.fileId, bytes };
  });
  return reviewAppearanceImport({ workspace: args.workspace, expectedStateId: args.expectedStateId, requestId: args.importId, manifest: args.manifest, files });
}

function importInput(args) {
  if (!stateId(args.expectedStateId) || !uuid(args.requestId)) invalid();
  const value = args.manifest, template = getAppearanceTemplate();
  recordId('appearance', value);
  shape(value, ['templateId', 'baseItemId', 'name', 'author', 'parts']);
  if (value.templateId !== template.id || !stateId(value.baseItemId)) invalid();
  boundedText(value.name, 80, false, 'appearance-import-invalid');
  boundedText(value.author, 80, false, 'appearance-import-invalid', true);
  if (!Array.isArray(value.parts) || !value.parts.length || value.parts.length > template.parts.length
    || !Array.isArray(args.files) || !args.files.length || args.files.length > LAYER_COUNT_LIMIT) invalid();
  const parts = new Set(), used = new Set();
  for (const part of value.parts) {
    shape(part, ['partId', 'fileId']);
    if (!template.parts.some(p => p.id === part.partId) || parts.has(part.partId) || !fileId(part.fileId)) invalid();
    parts.add(part.partId); used.add(part.fileId);
  }
  let total = 0;
  const seen = new Set();
  for (const file of args.files) {
    shape(file, ['fileId', 'bytes']);
    if (!fileId(file.fileId) || seen.has(file.fileId) || !used.has(file.fileId)
      || !(file.bytes instanceof Uint8Array) || file.bytes.byteLength > LAYER_IMAGE_LIMIT) invalid();
    total += file.bytes.byteLength; seen.add(file.fileId);
  }
  if (total > LAYER_SET_LIMIT || seen.size !== used.size) invalid();
  // Decode the entire explicit input before creating any store files.
  return new Map(args.files.map(file => [file.fileId, normalizeLayerPng(file.bytes)]));
}
function validateReview(value, scopeId) {
  try {
    recordId('appearance', value);
    shape(value, ['kind', 'schemaVersion', 'scopeId', 'requestId', 'expectedStateId', 'baseItemId', 'name', 'author', 'manifest', 'replacedParts', 'images']);
    if (value.kind !== 'unharness-appearance-import-review' || value.schemaVersion !== 1 || value.scopeId !== scopeId
      || !uuid(value.requestId) || !stateId(value.expectedStateId) || !stateId(value.baseItemId)) invalid();
    boundedText(value.name, 80, false, 'appearance-import-invalid');
    boundedText(value.author, 80, false, 'appearance-import-invalid', true);
    validateLayeredAppearance(value.manifest);
    const template = getAppearanceTemplate();
    if (!Array.isArray(value.replacedParts) || !value.replacedParts.length || new Set(value.replacedParts).size !== value.replacedParts.length
      || value.replacedParts.some(id => !template.parts.some(p => p.id === id))
      || !Array.isArray(value.images) || !value.images.length || value.images.length > LAYER_COUNT_LIMIT) invalid();
    const ids = new Set();
    for (const image of value.images) {
      shape(image, ['fileId', 'assetId', 'sourceWidth', 'sourceHeight', 'resized']);
      if (!fileId(image.fileId) || ids.has(image.fileId) || !value.manifest.assets.some(a => a.assetId === image.assetId)
        || !Number.isSafeInteger(image.sourceWidth) || image.sourceWidth < 1 || image.sourceWidth > MAX_LAYER_INPUT_SIDE
        || image.sourceHeight !== image.sourceWidth || image.resized !== (image.sourceWidth !== 724)) invalid();
      ids.add(image.fileId);
    }
    return value;
  } catch { invalid(); }
}
async function loadReview(w, reviewId) {
  if (!hash(reviewId)) invalid();
  return validateReview(await readRecord({ store: w.workspace, type: 'appearance', id: reviewId }), w.rootScopeId ?? w.scopeId);
}
function reviewSummary(w, reviewId, value) {
  return { scopeId: w.scopeId, collectionScopeId: value.scopeId, reviewId, expectedStateId: value.expectedStateId,
    baseItemId: value.baseItemId, name: value.name, author: value.author, manifest: value.manifest,
    replacedParts: value.replacedParts, images: value.images };
}
async function verifiedImages(w, manifest) {
  for (const asset of manifest.assets) {
    const image = await readAppearanceImage(w, asset.assetId);
    if (!image || !isDeepStrictEqual(image.asset, asset)) fail('appearance-image-store-invalid');
  }
}

export async function reviewAppearanceImport(args) {
  request(args, ['expectedStateId', 'requestId', 'manifest', 'files']);
  const images = importInput(args);
  const input = structuredClone(args.manifest), expectedStateId = args.expectedStateId, requestId = args.requestId;
  return withAppearanceWorkspace(args.workspace, async w => {
    const stored = await readAppearanceStore(w), scopeId = w.rootScopeId ?? w.scopeId;
    if (stored.journal) fail('appearance-recovery-required');
    if (stored.stateId !== expectedStateId) fail('appearance-state-conflict');
    const base = input.baseItemId === null ? null : stored.state?.items.find(item => item.id === input.baseItemId);
    if (input.baseItemId !== null && base?.kind !== 'layered') fail('appearance-not-owned');
    const stock = base ? null : await readStockAppearance(), original = base?.manifest ?? stock.manifest;
    if (base) await verifiedImages(w, original);
    const manifest = structuredClone(original), assets = new Map(original.assets.map(asset => [asset.assetId, asset]));
    for (const part of input.parts) {
      const image = images.get(part.fileId);
      assets.set(image.asset.assetId, image.asset);
      if (part.partId === 'entity' || part.partId === 'background') manifest.layers[part.partId] = { assetId: image.asset.assetId };
      else manifest.layers.restraints.find(row => row.partId === part.partId).assetId = image.asset.assetId;
    }
    const used = new Set([manifest.layers.entity.assetId, manifest.layers.background.assetId, ...manifest.layers.restraints.map(p => p.assetId)]);
    manifest.assets = [...used].sort().map(id => assets.get(id));
    const valid = validateLayeredAppearance(manifest);
    const value = validateReview({ kind: 'unharness-appearance-import-review', schemaVersion: 1, scopeId, requestId,
      expectedStateId, baseItemId: input.baseItemId, name: input.name.trim(), author: input.author.trim(), manifest: valid,
      replacedParts: input.parts.map(p => p.partId).sort(),
      images: [...images].map(([fileId, image]) => ({ fileId, assetId: image.asset.assetId, sourceWidth: image.sourceWidth,
        sourceHeight: image.sourceHeight, resized: image.resized })).sort((a, b) => a.fileId < b.fileId ? -1 : a.fileId > b.fileId ? 1 : 0) }, scopeId);
    // Freeze stock bytes into this collection too. A later bundled template
    // update cannot replace or remove any image used by this saved version.
    const uploaded = new Map([...images.values()].map(image => [image.asset.assetId, image]));
    for (const asset of valid.assets) {
      const image = uploaded.get(asset.assetId) ?? (base ? await readAppearanceImage(w, asset.assetId) : await readStockImage(asset.assetId));
      if (!image || !isDeepStrictEqual(image.asset, asset)) invalid();
      await storeAppearanceImage(w, image.bytes);
    }
    await verifiedImages(w, valid);
    const { id: reviewId } = await putRecord({ store: w.workspace, type: 'appearance', payload: value });
    const saved = await loadReview(w, reviewId);
    return reviewSummary(w, reviewId, saved);
  });
}
export async function readAppearanceImportReview(args) {
  request(args, ['reviewId']);
  const w = await openWorkspace(args.workspace);
  return reviewSummary(w, args.reviewId, await loadReview(w, args.reviewId));
}
export async function readAppearanceReferencedImage(args) {
  request(args, ['referenceId', 'assetId']);
  if (!hash(args.referenceId) || !hash(args.assetId)) fail('invalid-request');
  const w = await openWorkspace(args.workspace), stored = await readAppearanceStore(w);
  const item = stored.state?.items.find(item => item.id === args.referenceId);
  const manifest = item?.kind === 'layered' ? item.manifest : (await loadReview(w, args.referenceId)).manifest;
  const asset = manifest.assets.find(asset => asset.assetId === args.assetId);
  if (!asset) fail('appearance-not-owned');
  const image = await readAppearanceImage(w, args.assetId);
  if (!image || !isDeepStrictEqual(image.asset, asset)) fail('appearance-image-store-invalid');
  return image;
}
export async function saveAppearanceImport(args) {
  request(args, ['reviewId', 'expectedStateId']);
  if (!hash(args.reviewId) || !stateId(args.expectedStateId)) fail('invalid-request');
  return withAppearanceWorkspace(args.workspace, async w => {
    const reviewed = await loadReview(w, args.reviewId), before = await readAppearanceStore(w);
    if (reviewed.expectedStateId !== args.expectedStateId) fail('appearance-state-conflict');
    if (before.journal) fail('appearance-recovery-required');
    const existing = before.state?.items.find(item => item.reviewId === args.reviewId);
    if (existing) return { ...appearanceStoreSummary(w, before), savedItemId: existing.id, reviewId: args.reviewId };
    if (before.stateId !== args.expectedStateId) fail('appearance-state-conflict');
    await verifiedImages(w, reviewed.manifest);
    const item = { kind: 'layered', reviewId: args.reviewId, requestId: reviewed.requestId, parentItemId: reviewed.baseItemId,
      manifest: reviewed.manifest, name: reviewed.name, author: reviewed.author };
    item.id = layeredItemId(item);
    const state = appendLayeredAppearance(before.state, w.rootScopeId ?? w.scopeId, item);
    const saved = await publishAppearanceState(w, before, state);
    return { ...appearanceStoreSummary(w, saved), savedItemId: item.id, reviewId: args.reviewId };
  });
}
