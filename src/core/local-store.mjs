import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, link, lstat, mkdir, mkdtemp, open, opendir, readdir, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { types as utilTypes } from 'node:util';

const SCHEMA_VERSION = 1;
const STORE_KIND = 'unharness-local-store';
const STORE_PREFIX = 'unharness-loadouts-';
const MAX_NESTING = 32;
const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_METADATA_BYTES = 64 * 1024;
const MAX_RECORDS = 1000;
const RECORD_ID = /^[0-9a-f]{64}$/;
const RECORD_TYPES = new Set(['scope', 'favorite', 'checkpoint', 'application', 'observation']);

export const LOCAL_STORE_ERROR_KINDS = Object.freeze([
  'invalid-record-type',
  'invalid-record-id',
  'invalid-record-payload',
  'record-too-deep',
  'record-too-large',
  'store-init-error',
  'store-invalid',
  'store-link-or-type',
  'store-metadata-mismatch',
  'record-not-found',
  'record-corrupt',
  'record-limit-exceeded',
  'record-write-error',
  'record-read-error',
  'record-list-error',
]);

class LocalStoreError extends Error {
  constructor(kind) {
    super(kind);
    this.name = 'LocalStoreError';
    this.kind = kind;
  }
}

function fail(kind) {
  throw new LocalStoreError(kind);
}

function rethrow(error, fallback) {
  if (error instanceof LocalStoreError) throw error;
  fail(fallback);
}

function validateType(type) {
  if (!RECORD_TYPES.has(type)) fail('invalid-record-type');
}

function validateId(id) {
  if (typeof id !== 'string' || !RECORD_ID.test(id)) fail('invalid-record-id');
}

function canonicalJson(value, depth = 0, ancestors = new Set()) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid-record-payload');
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') fail('invalid-record-payload');
  if (utilTypes.isProxy(value)) fail('invalid-record-payload');
  if (depth >= MAX_NESTING) fail('record-too-deep');
  if (ancestors.has(value)) fail('invalid-record-payload');

  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    fail('invalid-record-payload');
  }

  ancestors.add(value);
  try {
    if (isArray) {
      const values = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('invalid-record-payload');
        values.push(canonicalJson(descriptor.value, depth + 1, ancestors));
      }
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.some(key => {
        if (key === 'length') return false;
        if (typeof key !== 'string') return true;
        const index = Number(key);
        return !Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key;
      })) {
        fail('invalid-record-payload');
      }
      return `[${values.join(',')}]`;
    }

    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string')) fail('invalid-record-payload');
    keys.sort();
    const members = keys.map(key => {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('invalid-record-payload');
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, depth + 1, ancestors)}`;
    });
    return `{${members.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function buildRecord(type, payload) {
  validateType(type);
  const payloadJson = canonicalJson(payload);
  const json = `{"payload":${payloadJson},"schemaVersion":${SCHEMA_VERSION},"type":${JSON.stringify(type)}}`;
  if (Buffer.byteLength(json) > MAX_RECORD_BYTES) fail('record-too-large');
  return {
    id: createHash('sha256').update(json).digest('hex'),
    json,
  };
}

export function recordId(type, payload) {
  return buildRecord(type, payload).id;
}

async function applyPrivateMode(path, mode) {
  if (process.platform !== 'win32') await chmod(path, mode);
}

async function applyPrivateHandleMode(handle, mode) {
  if (process.platform !== 'win32') await handle.chmod(mode);
}

async function assertDirectory(path, missingKind = 'store-invalid') {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') fail(missingKind);
    throw error;
  }
  if (!info.isDirectory() || info.isSymbolicLink()) fail('store-link-or-type');
  return info;
}

async function readRegularFile(path, { missingKind, corruptKind, maxBytes }) {
  let before;
  try {
    before = await lstat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') fail(missingKind);
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink()) fail('store-link-or-type');
  if (before.size > maxBytes) fail(corruptKind);

  let handle;
  try {
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    handle = await open(path, fsConstants.O_RDONLY | noFollow);
    const after = await handle.stat();
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino || after.size > maxBytes) {
      fail('store-link-or-type');
    }
    const bytes = await handle.readFile();
    if (bytes.length > maxBytes) fail(corruptKind);
    return bytes;
  } catch (error) {
    if (error instanceof LocalStoreError) throw error;
    if (error?.code === 'ELOOP') fail('store-link-or-type');
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function validateStore(store, type) {
  if (typeof store !== 'string' || !isAbsolute(store) || resolve(store) !== store) fail('store-invalid');
  try {
    await assertDirectory(store);
    if (await realpath(store) !== store) fail('store-link-or-type');

    const metadataBytes = await readRegularFile(join(store, 'store.json'), {
      missingKind: 'store-invalid',
      corruptKind: 'store-invalid',
      maxBytes: MAX_METADATA_BYTES,
    });
    let metadata;
    try {
      metadata = JSON.parse(metadataBytes.toString('utf8'));
    } catch {
      fail('store-invalid');
    }
    if (metadata?.schemaVersion !== SCHEMA_VERSION || metadata?.kind !== STORE_KIND
      || metadata?.root !== store || Reflect.ownKeys(metadata).length !== 3) {
      if (metadata?.root !== undefined && metadata.root !== store) fail('store-metadata-mismatch');
      fail('store-invalid');
    }

    const records = join(store, 'records');
    const stages = join(store, '.stages');
    const bucket = join(records, type);
    await assertDirectory(records);
    await assertDirectory(stages);
    await assertDirectory(bucket);
    return { bucket, stages };
  } catch (error) {
    rethrow(error, 'store-invalid');
  }
}

function validateStoredRecord(bytes, type, id) {
  const decoded = bytes.toString('utf8');
  let envelope;
  try {
    envelope = JSON.parse(decoded);
  } catch {
    fail('record-corrupt');
  }
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)
    || envelope.schemaVersion !== SCHEMA_VERSION || envelope.type !== type
    || !Object.hasOwn(envelope, 'payload')) {
    fail('record-corrupt');
  }

  let rebuilt;
  try {
    rebuilt = buildRecord(type, envelope.payload);
  } catch {
    fail('record-corrupt');
  }
  if (rebuilt.id !== id || !bytes.equals(Buffer.from(rebuilt.json, 'utf8'))) fail('record-corrupt');
  return envelope.payload;
}

async function readFromBucket(bucket, type, id) {
  const bytes = await readRegularFile(join(bucket, `${id}.json`), {
    missingKind: 'record-not-found',
    corruptKind: 'record-corrupt',
    maxBytes: MAX_RECORD_BYTES,
  });
  return validateStoredRecord(bytes, type, id);
}

async function writePrivateStage(stages, type, id, json) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const stage = join(stages, `${type}-${id}-${randomBytes(16).toString('hex')}.stage`);
    let handle;
    try {
      handle = await open(stage, 'wx', 0o600);
      await applyPrivateHandleMode(handle, 0o600);
      await handle.writeFile(json, 'utf8');
      await handle.sync();
      const info = await handle.stat();
      return { stage, info };
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    } finally {
      await handle?.close().catch(() => {});
    }
  }
  fail('record-write-error');
}

async function cleanupOwnStage(stage, expected, json) {
  try {
    const current = await lstat(stage);
    if (!current.isFile() || current.isSymbolicLink()
      || current.dev !== expected.dev || current.ino !== expected.ino || current.size !== expected.size) return;
    const bytes = await readRegularFile(stage, {
      missingKind: 'record-write-error',
      corruptKind: 'record-write-error',
      maxBytes: MAX_RECORD_BYTES,
    });
    if (!bytes.equals(Buffer.from(json, 'utf8'))) return;
    await unlink(stage);
  } catch {
    // Retain a missing, replaced, changed, or otherwise uncertain stage.
  }
}

export async function createStore({ parent } = {}) {
  let root;
  try {
    if (typeof parent !== 'string') fail('store-init-error');
    const resolvedParent = resolve(parent);
    await assertDirectory(resolvedParent, 'store-init-error');
    const canonicalParent = await realpath(resolvedParent);
    if (canonicalParent !== resolvedParent) fail('store-link-or-type');

    root = await mkdtemp(join(canonicalParent, STORE_PREFIX));
    root = await realpath(root);
    await applyPrivateMode(root, 0o700);

    const records = join(root, 'records');
    const stages = join(root, '.stages');
    await mkdir(records, { mode: 0o700 });
    await mkdir(stages, { mode: 0o700 });
    await applyPrivateMode(records, 0o700);
    await applyPrivateMode(stages, 0o700);
    for (const type of RECORD_TYPES) {
      const bucket = join(records, type);
      await mkdir(bucket, { mode: 0o700 });
      await applyPrivateMode(bucket, 0o700);
    }

    const metadata = canonicalJson({ kind: STORE_KIND, root, schemaVersion: SCHEMA_VERSION });
    const metadataHandle = await open(join(root, 'store.json'), 'wx', 0o600);
    try {
      await applyPrivateHandleMode(metadataHandle, 0o600);
      await metadataHandle.writeFile(metadata, 'utf8');
      await metadataHandle.sync();
    } finally {
      await metadataHandle.close();
    }
    return { store: root, schemaVersion: SCHEMA_VERSION };
  } catch (error) {
    rethrow(error, 'store-init-error');
  }
}

export async function putRecord({ store, type, payload } = {}) {
  const record = buildRecord(type, payload);
  let stage;
  try {
    const { bucket, stages } = await validateStore(store, type);
    stage = await writePrivateStage(stages, type, record.id, record.json);
    const target = join(bucket, `${record.id}.json`);
    let created = false;
    try {
      await link(stage.stage, target);
      created = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = await readRegularFile(target, {
        missingKind: 'record-write-error',
        corruptKind: 'record-corrupt',
        maxBytes: MAX_RECORD_BYTES,
      });
      validateStoredRecord(existing, type, record.id);
      if (!existing.equals(Buffer.from(record.json, 'utf8'))) fail('record-corrupt');
    }
    return { id: record.id, created };
  } catch (error) {
    rethrow(error, 'record-write-error');
  } finally {
    if (stage) await cleanupOwnStage(stage.stage, stage.info, record.json);
  }
}

export async function readRecord({ store, type, id } = {}) {
  validateType(type);
  validateId(id);
  try {
    const { bucket } = await validateStore(store, type);
    return await readFromBucket(bucket, type, id);
  } catch (error) {
    rethrow(error, 'record-read-error');
  }
}

export async function listRecords({ store, type } = {}) {
  validateType(type);
  try {
    const { bucket } = await validateStore(store, type);
    const entries = await readdir(bucket, { withFileTypes: true });
    if (entries.length > MAX_RECORDS) fail('record-limit-exceeded');

    const ids = entries.map(entry => {
      if (!entry.isFile() || entry.isSymbolicLink()) fail('store-link-or-type');
      if (!entry.name.endsWith('.json')) fail('record-corrupt');
      const id = entry.name.slice(0, -'.json'.length);
      if (!RECORD_ID.test(id)) fail('record-corrupt');
      return id;
    }).sort();

    const records = [];
    for (const id of ids) {
      records.push({ id, payload: await readFromBucket(bucket, type, id) });
    }
    return records;
  } catch (error) {
    rethrow(error, 'record-list-error');
  }
}

export async function listRecordPage({ store, type, after } = {}) {
  validateType(type);
  if (after !== undefined) validateId(after);
  try {
    const { bucket } = await validateStore(store, type);
    const ids = [];
    // Directory order is not stable. Keep only the smallest page plus one
    // lookahead ID, without materializing the bucket's filenames or payloads.
    for await (const entry of await opendir(bucket)) {
      if (!entry.isFile() || entry.isSymbolicLink()) fail('store-link-or-type');
      if (!entry.name.endsWith('.json')) fail('record-corrupt');
      const id = entry.name.slice(0, -'.json'.length);
      if (!RECORD_ID.test(id)) fail('record-corrupt');
      if (after !== undefined && id <= after) continue;
      if (ids.length === MAX_RECORDS + 1 && id >= ids.at(-1)) continue;
      let low = 0, high = ids.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (ids[middle] < id) low = middle + 1;
        else high = middle;
      }
      if (ids.length === MAX_RECORDS + 1) ids.pop();
      ids.splice(low, 0, id);
    }
    const hasMore = ids.length > MAX_RECORDS;
    if (hasMore) ids.pop();
    const records = [];
    for (const id of ids) {
      records.push({ id, payload: await readFromBucket(bucket, type, id) });
    }
    return { records, nextCursor: hasMore ? ids.at(-1) : null };
  } catch (error) {
    rethrow(error, 'record-list-error');
  }
}
