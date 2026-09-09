// Small immutable connection records. This storage contains no source bodies.
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../core/strict-json.mjs';

export const bindingFail = kind => { throw Object.assign(new Error(kind), { kind }); };
export const identity = stat => ({ dev: String(stat.dev), ino: String(stat.ino) });
const same = (a, b) => a && b && isDeepStrictEqual(identity(a), identity(b));
async function stat(path) {
  try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export async function connectionDirectory(path, { create = false, privateMode = true } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) bindingFail('plugin-binding-invalid');
  if (create) try { await mkdir(path, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const now = await stat(path);
  if (!now?.isDirectory() || now.isSymbolicLink() || await realpath(path) !== path
    || process.platform !== 'win32' && (now.mode & (privateMode ? 0o077 : 0o022) || now.uid !== process.geteuid())) bindingFail('plugin-binding-invalid');
  return { path, identity: identity(now) };
}
export async function checkDirectory(directory, options) {
  const now = await connectionDirectory(directory.path, options);
  if (!isDeepStrictEqual(now.identity, directory.identity)) bindingFail('plugin-binding-changed');
}
export async function readConnectionRecord(directory, name) {
  await checkDirectory(directory);
  const path = join(directory.path, name), before = await stat(path);
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 16384
    || process.platform !== 'win32' && (before.mode & 0o077 || before.uid !== process.geteuid())) bindingFail('plugin-binding-invalid');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (!same(before, await handle.stat())) bindingFail('plugin-binding-invalid');
    const bytes = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await handle.read(bytes, count, bytes.length - count, count);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    const after = await handle.stat();
    if (count !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || !same(before, await stat(path))) bindingFail('plugin-binding-invalid');
    await checkDirectory(directory);
    return parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count)));
  } catch (e) { bindingFail(e.kind === 'plugin-binding-changed' ? e.kind : 'plugin-binding-invalid'); }
  finally { await handle?.close(); }
}
export async function publishConnectionRecord(directory, name, value) {
  const previous = await readConnectionRecord(directory, name);
  if (previous !== null) {
    if (!isDeepStrictEqual(previous, value)) bindingFail('plugin-binding-changed');
    return previous;
  }
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > 16384) bindingFail('plugin-binding-invalid');
  const stage = join(directory.path, '.connection-' + randomUUID() + '.tmp');
  const handle = await open(stage, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
  try {
    await checkDirectory(directory);
    try { await link(stage, join(directory.path, name)); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
  } finally { await unlink(stage); }
  const confirmed = await readConnectionRecord(directory, name);
  if (!isDeepStrictEqual(confirmed, value)) bindingFail('plugin-binding-changed');
  return confirmed;
}
