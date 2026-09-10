import { randomUUID } from 'node:crypto';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { canonical, parentBinding, checkBinding, captureFileBytes, defaultMetadata, writeCompleteBytes, publish, mkdir, unlink } from '../sources/platform.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';
import { normalizeLayerPng } from './assets.mjs';
import { LAYER_IMAGE_LIMIT } from './template.mjs';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = () => fail('appearance-image-store-invalid');
async function imageDirectory(w, create = false) {
  const scopeId = w.rootScopeId ?? w.scopeId;
  if (!hash(scopeId)) invalid();
  await canonical(w.workspace);
  const directory = join(w.workspace, 'appearance-assets');
  let exists = true;
  try { await lstat(directory); } catch (error) { if (error.code !== 'ENOENT') throw error; exists = false; }
  if (!exists) { if (!create) return null; await mkdir(directory, { mode: 0o700 }); }
  await canonical(directory);
  const binding = await parentBinding(join(directory, 'scope.json'), { persistent: false });
  const markerPath = join(directory, 'scope.json'), expected = Buffer.from(JSON.stringify({ kind: 'unharness-image-store', schemaVersion: 1, scopeId }));
  let marker = await captureFileBytes(markerPath, 1024);
  if (!marker && create) {
    // A failed first initialization may leave only its own private staging
    // files. A fresh atomic marker can complete it without deleting them.
    if ((await readdir(directory)).some(name => !/^\.scope-[a-f0-9-]{36}\.next$/.test(name))) invalid();
    const stage = join(directory, '.scope-' + randomUUID() + '.next');
    await writeCompleteBytes(stage, { bytes: expected, meta: await defaultMetadata(directory) }, 1024);
    await sourceTransactionHook('appearance-asset-scope-staged'); await checkBinding(binding);
    await publish(stage, markerPath, null);
    marker = await captureFileBytes(markerPath, 1024);
  }
  if (!marker || !marker.bytes.equals(expected)) invalid();
  await checkBinding(binding);
  return { directory, binding };
}
export async function readAppearanceImage(w, assetId) {
  try {
    if (!hash(assetId)) invalid();
    const location = await imageDirectory(w);
    if (!location) return null;
    const file = await captureFileBytes(join(location.directory, assetId + '.png'), LAYER_IMAGE_LIMIT);
    if (!file) return null;
    const normalized = normalizeLayerPng(file.bytes);
    if (normalized.asset.assetId !== assetId || !normalized.bytes.equals(file.bytes)) invalid();
    await checkBinding(location.binding);
    return { asset: normalized.asset, bytes: file.bytes };
  } catch { invalid(); }
}
// Internal writer: the caller holds the registered workspace operation lock.
// An unreferenced image after interruption is not a saved/selected artwork.
export async function storeAppearanceImage(w, input) {
  const normalized = normalizeLayerPng(input), location = await imageDirectory(w, true);
  const previous = await readAppearanceImage(w, normalized.asset.assetId);
  if (previous) return { asset: previous.asset, created: false };
  if ((await readdir(location.directory)).length >= 4096) fail('appearance-collection-full');
  const path = join(location.directory, normalized.asset.assetId + '.png');
  const stage = join(location.directory, '.image-' + randomUUID() + '.next');
  const file = { bytes: normalized.bytes, meta: await defaultMetadata(location.directory) };
  try {
    await writeCompleteBytes(stage, file, LAYER_IMAGE_LIMIT);
    await sourceTransactionHook('appearance-asset-staged'); await checkBinding(location.binding);
    if (!isDeepStrictEqual(await captureFileBytes(stage, LAYER_IMAGE_LIMIT), file)) fail('appearance-image-conflict');
    if (await captureFileBytes(path, LAYER_IMAGE_LIMIT)) fail('appearance-image-conflict');
    await publish(stage, path, null);
    await sourceTransactionHook('appearance-asset-published'); await checkBinding(location.binding);
    const saved = await readAppearanceImage(w, normalized.asset.assetId);
    if (!saved || !saved.bytes.equals(file.bytes)) fail('appearance-image-conflict');
    return { asset: normalized.asset, created: true };
  } catch (error) {
    // Never replace a competing target or remove an independently edited stage.
    try { if (isDeepStrictEqual(await captureFileBytes(stage, LAYER_IMAGE_LIMIT), file)) await unlink(stage); } catch {}
    if (error.kind === 'appearance-image-conflict') throw error;
    fail('appearance-image-publication-uncertain');
  }
}
