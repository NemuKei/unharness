import assert from 'node:assert/strict';
import { link, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { createStore, listRecords, putRecord, readRecord, recordId } from '../src/core/local-store.mjs';
import * as localStore from '../src/core/local-store.mjs';

const HASH = '3b4800c34ea58c292e372116702846f39a7272cf940899fcecd247e3c219a633';

async function fixture(t, label = 'store') {
  const parent = await realpath(await mkdtemp(join(tmpdir(), `unharness-${label}-`)));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { parent, ...(await createStore({ parent })) };
}

async function corruptReplacementCharacterRecord(t, label) {
  const { store } = await fixture(t, label);
  const payload = { value: '\ufffd' };
  const { id } = await putRecord({ store, type: 'favorite', payload });
  const target = join(store, 'records', 'favorite', `${id}.json`);
  const original = await readFile(target);
  const replacement = Buffer.from('\ufffd', 'utf8');
  const offset = original.indexOf(replacement);
  assert.notEqual(offset, -1);
  const corrupt = Buffer.concat([
    original.subarray(0, offset),
    Buffer.from([0xff]),
    original.subarray(offset + replacement.length),
  ]);
  await writeFile(target, corrupt);
  return { corrupt, id, payload, store, target };
}

function rejectsKind(value, kind) {
  return assert.rejects(value, error => {
    assert.equal(error?.kind, kind);
    assert.equal(error?.message, kind);
    return true;
  });
}

function throwsKind(fn, kind) {
  return assert.throws(fn, error => {
    assert.equal(error?.kind, kind);
    assert.equal(error?.message, kind);
    return true;
  });
}

test('recordId canonicalizes plain objects while preserving array order', () => {
  assert.equal(recordId('favorite', { b: 2, a: 1 }), HASH);
  assert.equal(recordId('favorite', { a: 1, b: 2 }), HASH);
  assert.notEqual(recordId('favorite', { values: [1, 2] }), recordId('favorite', { values: [2, 1] }));
});

test('recordId rejects invalid values, excessive nesting, size, and record types', () => {
  throwsKind(() => recordId('other', {}), 'invalid-record-type');
  for (const payload of [{ value: undefined }, { value: Number.POSITIVE_INFINITY }, { value() {} }, { value: Symbol('x') }]) {
    throwsKind(() => recordId('favorite', payload), 'invalid-record-payload');
  }
  const cyclic = {};
  cyclic.self = cyclic;
  throwsKind(() => recordId('favorite', cyclic), 'invalid-record-payload');

  let getterCalled = false;
  const accessorArray = [];
  Object.defineProperty(accessorArray, '0', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalled = true;
      return 'synthetic secret';
    },
  });
  accessorArray.length = 1;
  throwsKind(() => recordId('favorite', accessorArray), 'invalid-record-payload');
  assert.equal(getterCalled, false);

  let proxyTrapCalled = false;
  const proxy = new Proxy({}, {
    getPrototypeOf() {
      proxyTrapCalled = true;
      return Object.prototype;
    },
  });
  throwsKind(() => recordId('favorite', proxy), 'invalid-record-payload');
  assert.equal(proxyTrapCalled, false);

  let deep = 'leaf';
  for (let index = 0; index < 33; index += 1) deep = { next: deep };
  throwsKind(() => recordId('favorite', deep), 'record-too-deep');
  throwsKind(() => recordId('favorite', { text: 'x'.repeat(1024 * 1024) }), 'record-too-large');
});

test('recordId rejects numeric-looking array properties that are not canonical indices', () => {
  const payload = [1];
  payload['00'] = () => 'not JSON';
  throwsKind(() => recordId('favorite', payload), 'invalid-record-payload');
});

test('recordId rejects numeric-looking array accessors without invoking them', () => {
  let getterCalled = false;
  const payload = [1];
  Object.defineProperty(payload, '00', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalled = true;
      return undefined;
    },
  });

  throwsKind(() => recordId('favorite', payload), 'invalid-record-payload');
  assert.equal(getterCalled, false);
});

test('createStore initializes only a private canonical child of an existing parent', async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-store-init-')));
  t.after(() => rm(parent, { recursive: true, force: true }));

  const result = await createStore({ parent });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.store, await realpath(result.store));
  assert.equal(basename(result.store).startsWith('unharness-loadouts-'), true);
  if (process.platform !== 'win32') {
    assert.equal((await lstat(result.store)).mode & 0o777, 0o700);
    assert.equal((await lstat(join(result.store, 'store.json'))).mode & 0o777, 0o600);
  }

  const metadata = JSON.parse(await readFile(join(result.store, 'store.json'), 'utf8'));
  assert.deepEqual(metadata, {
    kind: 'unharness-local-store',
    root: result.store,
    schemaVersion: 1,
  });
  assert.deepEqual((await readdir(parent)).sort(), [basename(result.store)]);
});

test('createStore rejects missing, non-directory, and symlink parents safely', async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-store-parent-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await rejectsKind(createStore({ parent: join(parent, 'missing') }), 'store-init-error');

  const file = join(parent, 'file');
  await writeFile(file, 'synthetic');
  await rejectsKind(createStore({ parent: file }), 'store-link-or-type');

  const linked = join(parent, 'linked');
  await symlink(parent, linked, 'dir');
  await rejectsKind(createStore({ parent: linked }), 'store-link-or-type');
});

test('simultaneous putRecord calls deduplicate without changing immutable content', async t => {
  const { store } = await fixture(t, 'deduplicate');
  const payload = { settings: { mode: 'normal' }, sources: ['fixed', 'optional'] };
  const results = await Promise.all([
    putRecord({ store, type: 'favorite', payload }),
    putRecord({ store, type: 'favorite', payload }),
  ]);

  assert.equal(results[0].id, results[1].id);
  assert.deepEqual(results.map(result => result.created).sort(), [false, true]);
  payload.settings.mode = 'mutated-after-save';
  assert.deepEqual(await readRecord({ store, type: 'favorite', id: results[0].id }), {
    settings: { mode: 'normal' },
    sources: ['fixed', 'optional'],
  });
  assert.deepEqual(await listRecords({ store, type: 'favorite' }), [{
    id: results[0].id,
    payload: { settings: { mode: 'normal' }, sources: ['fixed', 'optional'] },
  }]);
  assert.deepEqual(await readdir(join(store, '.stages')), []);
});

test('readRecord and putRecord reject corrupt existing content without replacing it', async t => {
  const { store } = await fixture(t, 'corrupt');
  const payload = { name: 'synthetic favorite' };
  const { id } = await putRecord({ store, type: 'favorite', payload });
  const target = join(store, 'records', 'favorite', `${id}.json`);
  await writeFile(target, '{}');

  await rejectsKind(readRecord({ store, type: 'favorite', id }), 'record-corrupt');
  await rejectsKind(putRecord({ store, type: 'favorite', payload }), 'record-corrupt');
  assert.equal(await readFile(target, 'utf8'), '{}');
});

test('readRecord rejects malformed UTF-8 that replacement decoding would normalize', async t => {
  const { id, store } = await corruptReplacementCharacterRecord(t, 'invalid-utf8-read');
  await rejectsKind(readRecord({ store, type: 'favorite', id }), 'record-corrupt');
});

test('putRecord rejects a malformed UTF-8 collision and preserves its raw bytes', async t => {
  const { corrupt, payload, store, target } = await corruptReplacementCharacterRecord(t, 'invalid-utf8-put');
  await rejectsKind(putRecord({ store, type: 'favorite', payload }), 'record-corrupt');
  assert.deepEqual(await readFile(target), corrupt);
});

test('record operations validate type and ID before touching a store path', async () => {
  await rejectsKind(readRecord({ store: '/PRIVATE/missing', type: 'other', id: '../secret' }), 'invalid-record-type');
  await rejectsKind(readRecord({ store: '/PRIVATE/missing', type: 'favorite', id: '../secret' }), 'invalid-record-id');
  await rejectsKind(listRecords({ store: '/PRIVATE/missing', type: 'other' }), 'invalid-record-type');
  await rejectsKind(putRecord({ store: '/PRIVATE/missing', type: 'other', payload: {} }), 'invalid-record-type');
});

test('record files and bucket ancestors may not be symlinks', async t => {
  const first = await fixture(t, 'record-link');
  const saved = await putRecord({ store: first.store, type: 'scope', payload: { fixture: true } });
  const target = join(first.store, 'records', 'scope', `${saved.id}.json`);
  const outside = join(first.parent, 'outside.json');
  await writeFile(outside, await readFile(target));
  await rm(target);
  await symlink(outside, target, 'file');
  await rejectsKind(readRecord({ store: first.store, type: 'scope', id: saved.id }), 'store-link-or-type');

  const second = await fixture(t, 'bucket-link');
  const bucket = join(second.store, 'records', 'favorite');
  const outsideBucket = join(second.parent, 'outside-bucket');
  await mkdir(outsideBucket);
  await rm(bucket, { recursive: true });
  await symlink(outsideBucket, bucket, 'dir');
  await rejectsKind(listRecords({ store: second.store, type: 'favorite' }), 'store-link-or-type');
});

test('metadata rejects a moved store instead of silently rebinding it', async t => {
  const { parent, store } = await fixture(t, 'moved');
  const { id } = await putRecord({ store, type: 'checkpoint', payload: { case: 'baseline' } });
  const moved = join(parent, 'moved-store');
  await rename(store, moved);

  await rejectsKind(readRecord({ store: moved, type: 'checkpoint', id }), 'store-metadata-mismatch');
});

test('leftover private stages are retained and ignored by listing', async t => {
  const { store } = await fixture(t, 'stage');
  const saved = await putRecord({ store, type: 'application', payload: { result: 'prepared' } });
  const target = join(store, 'records', 'application', `${saved.id}.json`);
  const interruptedStage = join(store, '.stages', 'interrupted-private-stage');
  await link(target, interruptedStage);

  assert.deepEqual(await listRecords({ store, type: 'application' }), [{
    id: saved.id,
    payload: { result: 'prepared' },
  }]);
  assert.equal((await lstat(interruptedStage)).isFile(), true);
  assert.deepEqual(await readRecord({ store, type: 'application', id: saved.id }), { result: 'prepared' });
});

test('listRecords sorts by ID and rejects more than 1000 bucket entries', async t => {
  const sortedFixture = await fixture(t, 'sorted');
  const one = await putRecord({ store: sortedFixture.store, type: 'observation', payload: { index: 1 } });
  const two = await putRecord({ store: sortedFixture.store, type: 'observation', payload: { index: 2 } });
  const listed = await listRecords({ store: sortedFixture.store, type: 'observation' });
  assert.deepEqual(listed.map(record => record.id), [one.id, two.id].sort());

  const boundedFixture = await fixture(t, 'bounded');
  const bucket = join(boundedFixture.store, 'records', 'scope');
  for (let start = 0; start < 1001; start += 100) {
    await Promise.all(Array.from({ length: Math.min(100, 1001 - start) }, (_, offset) => {
      const id = (start + offset).toString(16).padStart(64, '0');
      return writeFile(join(bucket, `${id}.json`), '{}');
    }));
  }
  await rejectsKind(listRecords({ store: boundedFixture.store, type: 'scope' }), 'record-limit-exceeded');
});

test('record creation enforces private file modes where supported', async t => {
  const { store } = await fixture(t, 'modes');
  const { id } = await putRecord({ store, type: 'scope', payload: { generated: true } });
  const record = join(store, 'records', 'scope', `${id}.json`);
  if (process.platform !== 'win32') {
    assert.equal((await lstat(record)).mode & 0o777, 0o600);
    assert.equal((await lstat(join(store, 'records'))).mode & 0o777, 0o700);
    assert.equal((await lstat(join(store, '.stages'))).mode & 0o777, 0o700);
  }
});

test('record pages expose all successful concurrent publications beyond the legacy list limit', async t => {
  const { store } = await fixture(t, 'pages');
  const saved = [];
  for (let start = 0; start < 1001; start += 40) {
    saved.push(...await Promise.all(Array.from({ length: Math.min(40, 1001 - start) }, (_, offset) =>
      putRecord({ store, type: 'checkpoint', payload: { index: start + offset } }))));
  }
  await rejectsKind(listRecords({ store, type: 'checkpoint' }), 'record-limit-exceeded');
  assert.equal(typeof localStore.listRecordPage, 'function');
  const first = await localStore.listRecordPage({ store, type: 'checkpoint' });
  assert.equal(first.records.length, 1000);
  assert.equal(first.nextCursor, first.records.at(-1).id);
  const second = await localStore.listRecordPage({ store, type: 'checkpoint', after: first.nextCursor });
  assert.equal(second.records.length, 1);
  assert.equal(second.nextCursor, null);
  const combined = [...first.records, ...second.records];
  assert.deepEqual(combined.map(record => record.id), saved.map(record => record.id).sort());
  assert.deepEqual(combined.map(record => record.payload.index).sort((a, b) => a - b),
    Array.from({ length: 1001 }, (_, index) => index));
  assert.deepEqual(await localStore.listRecordPage({ store, type: 'checkpoint', after: second.records[0].id }),
    { records: [], nextCursor: null });
});

test('record pages validate cursors and retain corruption and link boundaries', async t => {
  assert.equal(typeof localStore.listRecordPage, 'function');
  await rejectsKind(localStore.listRecordPage({ store: '/PRIVATE/missing', type: 'other', after: '../PRIVATE' }), 'invalid-record-type');
  for (const after of ['', '../PRIVATE', null, 3, 'F'.repeat(64)]) {
    await rejectsKind(localStore.listRecordPage({ store: '/PRIVATE/missing', type: 'favorite', after }), 'invalid-record-id');
  }
  const { store, parent } = await fixture(t, 'page-validation');
  assert.deepEqual(await localStore.listRecordPage({ store, type: 'favorite' }), { records: [], nextCursor: null });
  const { id } = await putRecord({ store, type: 'favorite', payload: { private: 'synthetic secret' } });
  const target = join(store, 'records', 'favorite', `${id}.json`);
  const original = await readFile(target);
  await writeFile(target, '{}');
  await rejectsKind(localStore.listRecordPage({ store, type: 'favorite' }), 'record-corrupt');
  await rm(target);
  const outside = join(parent, 'outside.json');
  await writeFile(outside, original);
  await symlink(outside, target, 'file');
  // Every filename is checked, including those before the cursor.
  await rejectsKind(localStore.listRecordPage({ store, type: 'favorite', after: 'f'.repeat(64) }), 'store-link-or-type');
  await rm(target);
  await writeFile(join(store, 'records', 'favorite', 'PRIVATE-invalid.json'), '{}');
  await rejectsKind(localStore.listRecordPage({ store, type: 'favorite', after: 'f'.repeat(64) }), 'record-corrupt');
  const utf8 = await corruptReplacementCharacterRecord(t, 'page-utf8');
  await rejectsKind(localStore.listRecordPage({ store: utf8.store, type: 'favorite' }), 'record-corrupt');
  const bucket = join(store, 'records', 'favorite');
  await rm(bucket, { recursive: true });
  await symlink(parent, bucket, 'dir');
  await rejectsKind(localStore.listRecordPage({ store, type: 'favorite' }), 'store-link-or-type');
});

test('small background pages retain every record through bounded cursors', async t => {
  const { store } = await fixture(t, 'small-pages'), saved = [];
  for (let index = 0; index < 5; index++) saved.push(await putRecord({ store, type: 'favorite', payload: { index } }));
  let after, collected = [];
  do {
    const page = await localStore.listRecordPage({ store, type: 'favorite', limit: 2, ...(after ? { after } : {}) });
    assert.ok(page.records.length <= 2);
    collected.push(...page.records.map(r => r.id));
    after = page.nextCursor;
  } while (after);
  assert.deepEqual(collected, saved.map(r => r.id).sort());
  for (const limit of [0, 1001, -1, 2.5, '2', null])
    await rejectsKind(localStore.listRecordPage({ store, type: 'favorite', limit }), 'invalid-page-limit');
});
