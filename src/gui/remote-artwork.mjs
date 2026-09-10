// Public DTO projection is a separate boundary, not permission to read raw
// appearance/evidence records. Core ownership and PNG decoding remain local.
import { createHash } from 'node:crypto';
import { getAppearanceTemplate } from '../appearances/template.mjs';
import { isHash, isRevision, remoteFail, REMOTE_IMAGE_LIMIT, REMOTE_SET_LIMIT } from './remote-policy.mjs';

const template = getAppearanceTemplate();
const invalid = () => remoteFail('remote-state-unconfirmed');
const check = condition => { if (!condition) invalid(); };
const nullableHash = value => value === null || isHash(value);
const text = (value, max = 80) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
function pick(value, keys) {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(keys.every(key => Object.hasOwn(value, key)));
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}
function scope(value, binding, collection = true) {
  check(isHash(value?.scopeId) && (!binding || value.scopeId === binding.scopeId));
  if (collection) check(isHash(value.collectionScopeId) && (!binding || value.collectionScopeId === binding.collectionScopeId));
}
function asset(value) {
  const a = pick(value, ['assetId', 'format', 'width', 'height', 'bytes']);
  check(isHash(a.assetId) && a.format === 'png' && a.width === 724 && a.height === 724
    && Number.isSafeInteger(a.bytes) && a.bytes > 0 && a.bytes <= REMOTE_IMAGE_LIMIT);
  return a;
}
function manifest(value) {
  const m = pick(value, ['kind', 'schemaVersion', 'templateId', 'assets', 'layers']);
  check(m.kind === 'unharness-layered-appearance' && m.schemaVersion === 1 && m.templateId === template.id);
  check(Array.isArray(m.assets) && m.assets.length > 0 && m.assets.length <= 64);
  m.assets = m.assets.map(asset);
  const ids = new Set(m.assets.map(a => a.assetId)), used = new Set();
  check(ids.size === m.assets.length && m.assets.reduce((n, a) => n + a.bytes, 0) <= REMOTE_SET_LIMIT);
  const layers = pick(m.layers, ['entity', 'background', 'restraints']);
  for (const role of ['entity', 'background']) {
    layers[role] = pick(layers[role], ['assetId']); check(ids.has(layers[role].assetId)); used.add(layers[role].assetId);
  }
  const parts = template.parts.filter(part => part.role === 'restraints').map(part => part.id), seen = new Set();
  check(Array.isArray(layers.restraints) && layers.restraints.length === parts.length);
  layers.restraints = layers.restraints.map(value => {
    const p = pick(value, ['partId', 'assetId']); check(parts.includes(p.partId) && !seen.has(p.partId) && ids.has(p.assetId));
    seen.add(p.partId); used.add(p.assetId); return p;
  });
  check(used.size === ids.size); m.layers = layers; return m;
}
function recipe(value) {
  const r = pick(value, ['schemaVersion', 'selectorVersion', 'rendererVersion', 'seed', 'origin', 'artPack', 'body', 'palette', 'details', 'modes', 'treatments']);
  check(r.schemaVersion === 1 && r.selectorVersion === 'weighted-sha256/v1' && r.rendererVersion === 'mechanical-appearance/v1'
    && isHash(r.seed) && ['prepared', 'original'].includes(r.origin) && r.body === 'mechanical-lattice'
    && ['filament', 'forked-light', 'facet-light'].includes(r.details));
  r.artPack = pick(r.artPack, ['version', 'sourceSha256', 'backgroundSha256']);
  check(r.artPack.version === 'hangar-v4-mechanical-cels' && isHash(r.artPack.sourceSha256) && isHash(r.artPack.backgroundSha256));
  r.palette = pick(r.palette, ['id', 'colors']);
  check(typeof r.palette.id === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(r.palette.id));
  r.palette.colors = pick(r.palette.colors, ['core', 'light', 'metal', 'dark']);
  check(Object.values(r.palette.colors).every(c => typeof c === 'string' && /^#[0-9a-f]{6}$/.test(c)));
  for (const [key, allowed] of [['modes', ['normal', 'unseal', 'trueform']], ['treatments', ['neutral', 'good', 'bad']]]) {
    check(Array.isArray(r[key]) && r[key].length > 0 && r[key].length <= allowed.length
      && new Set(r[key]).size === r[key].length && r[key].every(v => allowed.includes(v)));
    r[key] = [...r[key]];
  }
  return r;
}
function item(value) {
  const v = pick(value, ['id', 'kind', 'name']);
  check(isHash(v.id) && (v.name === null || text(v.name)));
  if (v.kind === 'recipe') return { ...v, recipe: recipe(value.recipe) };
  check(v.kind === 'layered' && text(value.author) && nullableHash(value.parentItemId));
  return { ...v, author: value.author, parentItemId: value.parentItemId, manifest: manifest(value.manifest) };
}
export function projectArtworkItem(value, binding) {
  scope(value, binding); check(nullableHash(value.stateId));
  return { scopeId: value.scopeId, collectionScopeId: value.collectionScopeId, stateId: value.stateId, item: item(value.item) };
}
export function projectArtwork(value, binding) {
  scope(value, binding);
  const v = pick(value, ['scopeId', 'collectionScopeId', 'collectionRevision', 'stateId', 'recoveryRequired',
    'pendingStateId', 'selectedItem', 'itemCount', 'collection', 'nextCursor']);
  check(isRevision(v.collectionRevision) && nullableHash(v.stateId) && typeof v.recoveryRequired === 'boolean'
    && nullableHash(v.pendingStateId) && v.recoveryRequired === (v.pendingStateId !== null)
    && isRevision(v.itemCount) && nullableHash(v.nextCursor) && Array.isArray(v.collection)
    && v.collection.length <= 20 && v.collection.length <= v.itemCount);
  v.selectedItem = v.selectedItem === null ? null : item(v.selectedItem);
  v.collection = v.collection.map(value => {
    const row = pick(value, ['id', 'kind', 'name', 'origin', 'paletteId', 'details', 'author', 'parentItemId']);
    check(isHash(row.id) && ['recipe', 'layered'].includes(row.kind) && (row.name === null || text(row.name))
      && ['imported', 'prepared', 'original'].includes(row.origin) && (row.paletteId === null || text(row.paletteId, 32))
      && (row.details === null || ['filament','forked-light','facet-light'].includes(row.details))
      && (row.author === null || text(row.author)) && nullableHash(row.parentItemId));
    return row;
  });
  check(new Set(v.collection.map(row => row.id)).size === v.collection.length);
  return v;
}
export function projectArtworkReview(value, binding) {
  scope(value, binding);
  const v = pick(value, ['scopeId', 'collectionScopeId', 'reviewId', 'expectedStateId', 'proposedItemId', 'baseItemId',
    'name', 'author', 'manifest', 'replacedParts', 'images']);
  check(isHash(v.reviewId) && isHash(v.proposedItemId) && nullableHash(v.expectedStateId) && nullableHash(v.baseItemId)
    && text(v.name) && v.name.trim().length > 0 && text(v.author));
  v.manifest = manifest(v.manifest);
  const parts = template.parts.map(part => part.id), assetIds = new Set(v.manifest.assets.map(a => a.assetId));
  check(Array.isArray(v.replacedParts) && v.replacedParts.length > 0 && v.replacedParts.length <= parts.length
    && new Set(v.replacedParts).size === v.replacedParts.length && v.replacedParts.every(p => parts.includes(p)));
  v.replacedParts = [...v.replacedParts];
  check(Array.isArray(v.images) && v.images.length > 0 && v.images.length <= 64);
  v.images = v.images.map(value => {
    const image = pick(value, ['fileId', 'assetId', 'sourceWidth', 'sourceHeight', 'resized']);
    check(typeof image.fileId === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(image.fileId)
      && assetIds.has(image.assetId) && Number.isSafeInteger(image.sourceWidth) && image.sourceWidth > 0 && image.sourceWidth <= 2048
      && image.sourceHeight === image.sourceWidth && image.resized === (image.sourceWidth !== 724));
    return image;
  });
  check(new Set(v.images.map(i => i.fileId)).size === v.images.length);
  return v;
}
export function projectArtworkReceipt(value, binding) {
  scope(value, binding, false);
  const v = pick(value, ['scopeId', 'collectionRevision', 'stateId', 'selectedItemId', 'recoveryRequired', 'pendingStateId']);
  check(isRevision(v.collectionRevision) && nullableHash(v.stateId) && nullableHash(v.selectedItemId)
    && typeof v.recoveryRequired === 'boolean' && nullableHash(v.pendingStateId)
    && v.recoveryRequired === (v.pendingStateId !== null));
  if (Object.hasOwn(value, 'savedItemId') || Object.hasOwn(value, 'reviewId')) {
    check(isHash(value.savedItemId) && isHash(value.reviewId));
    v.savedItemId = value.savedItemId; v.reviewId = value.reviewId;
  }
  return v;
}
export function projectArtworkImage(value, assetId) {
  const a = asset(value?.asset), b = value.bytes;
  check(a.assetId === assetId && b instanceof Uint8Array && b.byteLength === a.bytes);
  const bytes = Buffer.from(b);
  check(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    && bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR'
    && bytes.readUInt32BE(16) === 724 && bytes.readUInt32BE(20) === 724
    && createHash('sha256').update(bytes).digest('hex') === assetId);
  // Complete decoding/normalization and item/review membership are checked by
  // controller.image's shared core before this response-only projection.
  return { bytes };
}
