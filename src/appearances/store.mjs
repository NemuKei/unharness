import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { putRecord, readRecord, recordId } from '../core/local-store.mjs';
import { captureFileBytes, defaultMetadata, writeCompleteBytes, publish, unlink, canonical } from '../sources/platform.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { validateAppearanceState, validateLegacyAppearanceState } from './lifecycle.mjs';

const LIMIT = 1024 * 1024;
const shape = (value, keys) => exactKeys(value, keys, [], 'appearance-record-invalid');
const invalid = () => fail('appearance-record-invalid');
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const collectionWorkspace = w => ({ ...w, scopeId: w.rootScopeId ?? w.scopeId });
const indexPath = w => join(w.workspace, 'appearance-index.json');
const journalPath = w => join(w.workspace, 'appearance-pending.json');
const markerPath = w => join(w.workspace, 'appearance-initialized.json');
const bytes = value => Buffer.from(JSON.stringify(value));
const markerValue = w => bytes({ kind: 'unharness-appearance-initialized', schemaVersion: 1, scopeId: w.scopeId });
function decode(file) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)); }
  catch { invalid(); }
}
function indexFor(w, stateId, state) {
  return { kind: 'unharness-appearance-index', schemaVersion: 1, scopeId: w.scopeId, stateId, revision: state.revision };
}
async function loadState(w, stateId) {
  try {
    const value = validateAppearanceState(await readRecord({ store: w.workspace, type: 'appearance', id: stateId }));
    if (value.scopeId !== w.scopeId) invalid();
    if (value.schemaVersion === 2 && value.legacyStateId) {
      const legacy = validateLegacyAppearanceState(await readRecord({ store: w.workspace, type: 'appearance', id: value.legacyStateId }));
      const identity = ({ id, recipe, acquisition }) => ({ id, recipe, acquisition });
      if (legacy.scopeId !== w.scopeId || legacy.revision >= value.revision
        || !isDeepStrictEqual(legacy.items.map(identity), value.items.slice(0, legacy.items.length).map(identity))
        || !isDeepStrictEqual(legacy.achievements, value.achievements)) invalid();
    }
    return value;
  } catch { invalid(); }
}
async function loadIndex(w, file) {
  if (!file) return { stateId: null, state: null };
  const value = decode(file);
  shape(value, ['kind', 'schemaVersion', 'scopeId', 'stateId', 'revision']);
  if (value.kind !== 'unharness-appearance-index' || value.schemaVersion !== 1 || value.scopeId !== w.scopeId || !hash(value.stateId)) invalid();
  const state = await loadState(w, value.stateId);
  if (value.revision !== state.revision) invalid();
  return { stateId: value.stateId, state };
}
function validateMeta(meta) {
  shape(meta, ['uid', 'gid', 'mode', 'xattrs']);
  if (![meta.uid, meta.gid, meta.mode].every(n => Number.isSafeInteger(n) && n >= 0) || meta.mode > 0o777
    || !meta.xattrs || typeof meta.xattrs !== 'object' || Array.isArray(meta.xattrs)
    || Object.entries(meta.xattrs).some(([key, value]) => !/^[a-zA-Z0-9_.-]{1,128}$/.test(key)
      || typeof value !== 'string' || !/^(?:[0-9a-f]{2})*$/.test(value))) invalid();
}
function snapshot(value) {
  if (value === null) return null;
  shape(value, ['base64', 'meta']); validateMeta(value.meta);
  if (typeof value.base64 !== 'string' || value.base64.length > LIMIT) invalid();
  const decoded = Buffer.from(value.base64, 'base64');
  if (decoded.toString('base64') !== value.base64) invalid();
  return { bytes: decoded, meta: value.meta };
}
async function loadJournal(w, file) {
  if (!file) return null;
  const value = decode(file);
  shape(value, ['kind', 'schemaVersion', 'scopeId', 'before', 'nextStateId', 'indexMeta']);
  if (value.kind !== 'unharness-appearance-pending' || value.schemaVersion !== 1 || value.scopeId !== w.scopeId || !hash(value.nextStateId)) invalid();
  const before = snapshot(value.before); validateMeta(value.indexMeta);
  const prior = await loadIndex(w, before), nextState = await loadState(w, value.nextStateId);
  if (nextState.revision !== (prior.state?.revision ?? 0) + 1) invalid();
  return { value, before, nextState, file, nextFile: { bytes: bytes(indexFor(w, value.nextStateId, nextState)), meta: value.indexMeta } };
}
async function assertMarker(w, required, create = false) {
  const file = await captureFileBytes(markerPath(w), LIMIT);
  if (file) { if (!file.bytes.equals(markerValue(w))) invalid(); }
  else if (create) await writeCompleteBytes(markerPath(w), { bytes: markerValue(w), meta: await defaultMetadata(w.workspace) });
  else if (required) invalid();
}
export async function readAppearanceStore(w) {
  w = collectionWorkspace(w);
  try {
    await canonical(w.workspace);
    const file = await captureFileBytes(indexPath(w), LIMIT);
    const journal = await loadJournal(w, await captureFileBytes(journalPath(w), LIMIT));
    const state = await loadIndex(w, file);
    const marker = await captureFileBytes(markerPath(w), LIMIT);
    if (marker && !marker.bytes.equals(markerValue(w)) || file && !marker || !file && marker && !journal) invalid();
    return { ...state, file, journal };
  } catch { invalid(); }
}
export function appearanceStoreSummary(w, value) {
  return { scopeId: w.scopeId, stateId: value.stateId, state: value.state,
    recoveryRequired: value.journal !== null, pendingStateId: value.journal?.value.nextStateId ?? null };
}
async function assertJournal(w, journal) {
  if (!isDeepStrictEqual(await captureFileBytes(journalPath(w), LIMIT), journal.file)) fail('appearance-state-conflict');
}
async function finishJournal(w, journal) {
  await canonical(w.workspace);
  await assertJournal(w, journal);
  const current = await captureFileBytes(indexPath(w), LIMIT);
  if (!isDeepStrictEqual(current, journal.before) && !isDeepStrictEqual(current, journal.nextFile)) fail('appearance-state-conflict');
  await assertMarker(w, journal.before !== null, journal.before === null);
  if (!isDeepStrictEqual(current, journal.nextFile)) {
    const stage = join(w.workspace, '.appearance-index-' + randomBytes(16).toString('hex') + '.next');
    await writeCompleteBytes(stage, journal.nextFile, LIMIT);
    await sourceTransactionHook('appearance-index-staged');
    await assertJournal(w, journal);
    if (!isDeepStrictEqual(await captureFileBytes(indexPath(w), LIMIT), current)) fail('appearance-state-conflict');
    await publish(stage, indexPath(w), current);
    if (!isDeepStrictEqual(await captureFileBytes(indexPath(w), LIMIT), journal.nextFile)) fail('appearance-state-conflict');
    await sourceTransactionHook('appearance-index-published');
  }
  await assertJournal(w, journal);
  if (!isDeepStrictEqual(await captureFileBytes(indexPath(w), LIMIT), journal.nextFile)) fail('appearance-state-conflict');
  // Only this exact journal is removed. Unknown stages or corrupt records stay
  // private; appearance recovery never touches a source recovery journal.
  await unlink(journalPath(w));
  return readAppearanceStore(w);
}
// Internal publication; the caller holds the registered source-operation lock.
export async function publishAppearanceState(w, before, value) {
  w = collectionWorkspace(w);
  const state = validateAppearanceState(value);
  if (state.scopeId !== w.scopeId || state.revision !== (before.state?.revision ?? 0) + 1) invalid();
  if (before.journal) fail('appearance-recovery-required');
  try {
    if (!isDeepStrictEqual(await captureFileBytes(indexPath(w), LIMIT), before.file)) fail('appearance-state-conflict');
    const { id: nextStateId } = await putRecord({ store: w.workspace, type: 'appearance', payload: state });
    const indexMeta = before.file?.meta ?? await defaultMetadata(w.workspace);
    const journal = { kind: 'unharness-appearance-pending', schemaVersion: 1, scopeId: w.scopeId,
      before: before.file ? { base64: before.file.bytes.toString('base64'), meta: before.file.meta } : null, nextStateId, indexMeta };
    recordId('observation', journal);
    const journalFile = { bytes: bytes(journal), meta: await defaultMetadata(w.workspace) };
    await writeCompleteBytes(journalPath(w), journalFile, LIMIT);
    if (!isDeepStrictEqual(await captureFileBytes(journalPath(w), LIMIT), journalFile)) fail('appearance-state-conflict');
    await sourceTransactionHook('appearance-journaled');
    if (!isDeepStrictEqual(await captureFileBytes(journalPath(w), LIMIT), journalFile)) fail('appearance-state-conflict');
    return await finishJournal(w, await loadJournal(w, journalFile));
  } catch { fail('appearance-publication-uncertain'); }
}
export async function recoverAppearanceStore(w) {
  w = collectionWorkspace(w);
  const journal = await loadJournal(w, await captureFileBytes(journalPath(w), LIMIT));
  if (!journal) return readAppearanceStore(w);
  try { return await finishJournal(w, journal); }
  catch (e) {
    if (['appearance-state-conflict', 'appearance-record-invalid'].includes(e.kind)) throw e;
    fail('appearance-publication-uncertain');
  }
}
