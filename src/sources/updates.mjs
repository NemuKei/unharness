// Read-only invalidation hints and bounded history for an already accepted GUI.
// Filesystem stamps are refresh hints, never evidence of source/task loading.
import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { openWorkspace, activeNormalId } from './records.mjs';
import { pathsFor } from './capture.mjs';
import { canonical } from './platform.mjs';
import { sourceTransactionHook } from './transaction.mjs';
import * as service from './service.mjs';
import { LOCAL_STORE_ERROR_KINDS } from '../core/local-store.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const errors = new Set([...service.USER_SOURCE_ERROR_KINDS, ...LOCAL_STORE_ERROR_KINDS]);
async function stamp(path) {
  try {
    // Never follow a redirected parent to inspect an unrelated target.
    await canonical(dirname(path));
    const info = await lstat(path, { bigint: true });
    return ['present', ...['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(k => String(info[k]))];
  } catch (e) { return e.code === 'ENOENT' ? ['absent'] : ['unavailable']; }
}
export async function sourceChangeVersion(metadata, opened) {
  if (!metadata.workspace) return digest([metadata.contextId, 'source', null]);
  const w = opened ?? await openWorkspace(metadata.workspace);
  const paths = [join(w.workspace, 'state.json'), join(w.workspace, 'pending.json'), ...Object.values(pathsFor(w.reg))];
  return digest([metadata.contextId, 'source', await Promise.all(paths.map(stamp))]);
}
async function versions(metadata) {
  if (!metadata.workspace) return Object.fromEntries(['source', 'favorites', 'runs', 'starts', 'replays', 'appearance'].map(k => [k, digest([metadata.contextId, k, null])]));
  const w = await openWorkspace(metadata.workspace);
  const root = w.workspace, records = join(root, 'records');
  const groups = {
    favorites: [join(records, 'favorite')], runs: [join(records, 'observation')],
    starts: [join(records, 'experiment')], replays: [join(root, 'replay-index.json'), join(root, 'replay-index-initialized.json')],
    appearance: [join(root, 'appearance-index.json'), join(root, 'appearance-initialized.json'), join(root, 'appearance-pending.json'),
      join(records, 'appearance'), join(root, 'replay-index.json')],
  };
  const [source, entries] = await Promise.all([
    sourceChangeVersion(metadata, w),
    Promise.all(Object.entries(groups).map(async ([key, paths]) => [key, await Promise.all(paths.map(stamp))])),
  ]);
  return { source, ...Object.fromEntries(entries.map(([key, values]) => [key,
    digest([metadata.contextId, key, key === 'favorites' ? activeNormalId(w) : ['replays', 'appearance'].includes(key) ? source : null, values])])) };
}
async function history(metadata) {
  if (!metadata.workspace) return null;
  const args = { workspace: metadata.workspace };
  return Object.fromEntries(await Promise.all([
    ['favorites', () => service.listUserFavorites({ ...args, limit: 20 })],
    ['runs', () => service.listUserRuns(args)], ['starts', () => service.listUserStarts(args)], ['replays', () => service.listUserReplays(args)],
    ['appearance', () => service.readUserAppearance(args)],
  ].map(async ([key, read]) => {
    try { return [key, { data: await read(), error: null }]; }
    catch (e) { return [key, { data: null, error: { kind: errors.has(e?.kind) ? e.kind : 'history-unavailable' } }]; }
  })));
}
export async function readSourceUpdates({ metadata, readState, readMetadata, after }) {
  const before = await versions(metadata), token = digest(before);
  if (after === token) return { status: 'unchanged', metadata, token };
  const [view, rows] = await Promise.all([readState(), history(metadata)]);
  await sourceTransactionHook('source-updates-collected');
  const current = await readMetadata();
  if (!isDeepStrictEqual(current, metadata) || !isDeepStrictEqual(view.metadata, metadata))
    return { status: 'context-changed', metadata: current };
  if (!isDeepStrictEqual(before, await versions(current))) return { status: 'changing', metadata };
  return { status: 'updated', metadata, token, versions: before, view, history: rows };
}
