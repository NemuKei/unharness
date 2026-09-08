import { randomBytes } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { captureFileBytes, defaultMetadata, writeCompleteBytes, publish, canonical } from '../sources/platform.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { hash } from './start-records.mjs';

const LIMIT = 1024 * 1024;
const invalid = () => fail('replay-record-invalid');
const markerPath = w => join(w.workspace, 'replay-index-initialized.json');
const markerValue = w => Buffer.from(JSON.stringify({ kind: 'unharness-replay-index-initialized', schemaVersion: 1, scopeId: w.scopeId }));
function validate(w, value) {
  exactKeys(value, ['kind', 'schemaVersion', 'scopeId', 'revision', 'series', 'attempts', 'activeAttemptId'], [], 'replay-record-invalid');
  if (value.kind !== 'unharness-replay-index' || value.schemaVersion !== 1 || value.scopeId !== w.scopeId
    || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.series) || !Array.isArray(value.attempts)
    || value.series.length > 2048 || value.attempts.length > 2048 || Buffer.byteLength(JSON.stringify(value)) > LIMIT) invalid();
  for (const [entries, key, reference] of [[value.series, 'startId', 'seriesId'], [value.attempts, 'attemptId', 'stateId']]) {
    const ids = new Set();
    for (const entry of entries) {
      exactKeys(entry, [key, reference], [], 'replay-record-invalid');
      if (!hash(entry[key]) || !hash(entry[reference]) || ids.has(entry[key])) invalid();
      ids.add(entry[key]);
    }
  }
  if (value.activeAttemptId !== null && !value.attempts.some(a => a.attemptId === value.activeAttemptId)) invalid();
  return value;
}
export async function loadReplayIndex(w) {
  try {
    const file = await captureFileBytes(join(w.workspace, 'replay-index.json'), LIMIT);
    const marker = await captureFileBytes(markerPath(w));
    if (marker && !marker.bytes.equals(markerValue(w))) invalid();
    if (!file) {
      if (marker) invalid();
      try { await lstat(join(w.workspace, 'replays')); invalid(); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    const data = file ? JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes))
      : { kind: 'unharness-replay-index', schemaVersion: 1, scopeId: w.scopeId, revision: 0, series: [], attempts: [], activeAttemptId: null };
    return { data: validate(w, data), file };
  } catch { invalid(); }
}
// All callers hold the source-operation lock. A unique staged file means a
// crashed optional update cannot block a later cancellation or source recovery.
// Uncertain stages remain private; no arbitrary leftovers are deleted.
export async function publishReplayIndex(w, before, next) {
  validate(w, next);
  if (next.revision !== before.data.revision + 1) invalid();
  const path = join(w.workspace, 'replay-index.json');
  const stage = join(w.workspace, '.replay-index-' + randomBytes(16).toString('hex') + '.next');
  const expected = { bytes: Buffer.from(JSON.stringify(next)), meta: before.file?.meta ?? await defaultMetadata(w.workspace) };
  try {
    await canonical(w.workspace);
    if (!isDeepStrictEqual(await captureFileBytes(path, LIMIT), before.file)) invalid();
    const marker = await captureFileBytes(markerPath(w));
    if (marker) { if (!marker.bytes.equals(markerValue(w))) invalid(); }
    else await writeCompleteBytes(markerPath(w), { bytes: markerValue(w), meta: await defaultMetadata(w.workspace) });
    await writeCompleteBytes(stage, expected, LIMIT);
    await sourceTransactionHook('replay-index-staged');
    await canonical(w.workspace);
    if (!isDeepStrictEqual(await captureFileBytes(path, LIMIT), before.file)) invalid();
    await publish(stage, path, before.file);
    if (!isDeepStrictEqual(await captureFileBytes(path, LIMIT), expected)) invalid();
    await sourceTransactionHook('replay-index-published');
    return { data: next, file: expected };
  } catch { fail('replay-publication-uncertain'); }
}
