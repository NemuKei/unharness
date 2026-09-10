import { lstat, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { putRecord, readRecord, recordId } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { canonical, parentBinding, checkBinding, captureFileBytes, writeCompleteBytes, defaultMetadata } from '../sources/platform.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';
import { withAppearanceWorkspace } from './workspace.mjs';
import { getAppearanceTemplate, LAYER_IMAGE_LIMIT } from './template.mjs';
import { readStockAppearance, readStockImage } from './stock.mjs';
import { readAppearanceStore } from './store.mjs';
import { readAppearanceImage } from './image-store.mjs';
import { reviewAppearanceImport } from './import.mjs';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const fields = ['kind', 'schemaVersion', 'scopeId', 'creationId', 'templateId', 'baseItemId'];
const invalid = () => fail('appearance-authoring-invalid');
const request = (args, keys) => exactKeys(args, ['workspace', ...keys], [], 'invalid-request');
const templateDirectory = fileURLToPath(new URL('../../assets/appearance-templates/hangar-layered-v1/', import.meta.url));
const markerBytes = value => Buffer.from(JSON.stringify(value, fields));
function validate(value, w, authoringId) {
  exactKeys(value, fields, [], 'appearance-authoring-invalid');
  if (value.kind !== 'unharness-appearance-authoring' || value.schemaVersion !== 1 || value.scopeId !== (w.rootScopeId ?? w.scopeId)
    || !uuid(value.creationId) || value.baseItemId !== null && !hash(value.baseItemId)
    || value.templateId !== getAppearanceTemplate().id || recordId('appearance', value) !== authoringId) invalid();
  return value;
}
async function location(w, value, authoringId) {
  await canonical(w.workspace);
  const directory = join(w.workspace, 'appearance-authoring-' + authoringId);
  await canonical(directory);
  const binding = await parentBinding(join(directory, 'authoring.json'));
  const marker = await captureFileBytes(join(directory, 'authoring.json'), 4096);
  if (!marker || !marker.bytes.equals(markerBytes(value))) invalid();
  await checkBinding(binding);
  return { directory, binding };
}
async function load(w, authoringId) {
  if (!hash(authoringId)) invalid();
  const value = validate(await readRecord({ store: w.workspace, type: 'appearance', id: authoringId }), w, authoringId);
  return { value, ...await location(w, value, authoringId) };
}
async function referenceFiles(w, baseItemId) {
  const template = getAppearanceTemplate();
  if (baseItemId === null) {
    const stock = await readStockAppearance();
    for (const asset of stock.manifest.assets) await readStockImage(asset.assetId);
    return stock.files.map(row => ({ partId: row.partId, assetId: row.assetId, path: join(templateDirectory, row.file) }));
  }
  const stored = await readAppearanceStore(w), item = stored.state?.items.find(item => item.id === baseItemId);
  if (item?.kind !== 'layered') fail('appearance-not-owned');
  const rows = template.parts.map(part => ({ partId: part.id, assetId: ['entity', 'background'].includes(part.id)
    ? item.manifest.layers[part.id].assetId : item.manifest.layers.restraints.find(row => row.partId === part.id).assetId }));
  for (const asset of item.manifest.assets) {
    const image = await readAppearanceImage(w, asset.assetId);
    if (!image || image.asset.bytes !== asset.bytes) invalid();
  }
  return rows.map(row => ({ ...row, path: join(w.workspace, 'appearance-assets', row.assetId + '.png') }));
}
async function summary(w, authoringId, place) {
  const template = getAppearanceTemplate(), references = await referenceFiles(w, place.value.baseItemId);
  await checkBinding(place.binding);
  await location(w, place.value, authoringId);
  return { scopeId: w.scopeId, collectionScopeId: w.rootScopeId ?? w.scopeId, authoringId, directory: place.directory,
    templateId: template.id, templatePath: join(templateDirectory, 'template.json'), baseItemId: place.value.baseItemId,
    guidePaths: ['all', 'entity', 'restraints', 'background'].map(role => ({ role, path: join(templateDirectory, 'guide-' + role + '.png') })),
    files: template.parts.map(part => ({ partId: part.id, path: join(place.directory, part.id + '.png') })),
    referenceFiles: references, referencesReadOnly: true };
}
export async function prepareAppearanceAuthoring(args) {
  request(args, ['creationId', 'baseItemId']);
  if (!uuid(args.creationId) || args.baseItemId !== null && !hash(args.baseItemId)) fail('invalid-request');
  const creationId = args.creationId, baseItemId = args.baseItemId;
  return withAppearanceWorkspace(args.workspace, async w => {
    await referenceFiles(w, baseItemId);
    const value = { kind: 'unharness-appearance-authoring', schemaVersion: 1, scopeId: w.rootScopeId ?? w.scopeId,
      creationId, templateId: getAppearanceTemplate().id, baseItemId };
    const authoringId = recordId('appearance', value), directory = join(w.workspace, 'appearance-authoring-' + authoringId);
    let exists = true;
    try { await lstat(directory); } catch (e) { if (e.code !== 'ENOENT') throw e; exists = false; }
    if (!exists) {
      // A removed, previously issued place is not permission to invent its
      // missing draft files or silently reinitialize that historical place.
      try { await readRecord({ store: w.workspace, type: 'appearance', id: authoringId }); invalid(); }
      catch (e) { if (e.kind !== 'record-not-found') throw e; }
      if ((await readdir(w.workspace)).filter(name => name.startsWith('appearance-authoring-')).length >= 128) fail('appearance-collection-full');
      await mkdir(directory, { mode: 0o700 });
      await writeCompleteBytes(join(directory, 'authoring.json'), { bytes: markerBytes(value), meta: await defaultMetadata(directory) }, 4096);
    }
    const place = await location(w, value, authoringId);
    await putRecord({ store: w.workspace, type: 'appearance', payload: value });
    await sourceTransactionHook('appearance-authoring-issued');
    return summary(w, authoringId, { value, ...place });
  });
}
export async function readAppearanceAuthoring(args) {
  request(args, ['authoringId']);
  const w = await openWorkspace(args.workspace);
  return summary(w, args.authoringId, await load(w, args.authoringId));
}
export async function reviewAuthoredAppearance(args) {
  request(args, ['authoringId', 'importId', 'expectedStateId', 'name', 'author', 'partIds']);
  recordId('appearance', { ...args, workspace: null });
  const partIds = getAppearanceTemplate().parts.map(part => part.id);
  if (!Array.isArray(args.partIds) || !args.partIds.length || args.partIds.length > partIds.length
    || new Set(args.partIds).size !== args.partIds.length || args.partIds.some(id => !partIds.includes(id))) fail('invalid-request');
  const selected = [...args.partIds];
  const captured = await withAppearanceWorkspace(args.workspace, async w => {
    const place = await load(w, args.authoringId), files = [];
    for (const partId of selected) {
      const file = await captureFileBytes(join(place.directory, partId + '.png'), LAYER_IMAGE_LIMIT);
      if (!file) invalid();
      files.push({ fileId: partId, bytes: file.bytes });
    }
    await checkBinding(place.binding);
    await location(w, place.value, args.authoringId);
    return { files, templateId: place.value.templateId, baseItemId: place.value.baseItemId };
  });
  return reviewAppearanceImport({ workspace: args.workspace, expectedStateId: args.expectedStateId, requestId: args.importId,
    manifest: { templateId: captured.templateId, baseItemId: captured.baseItemId, name: args.name, author: args.author,
      parts: selected.map(partId => ({ partId, fileId: partId })) }, files: captured.files });
}
