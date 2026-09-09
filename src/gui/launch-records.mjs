// Private process receipts, separate from source transactions and saved data.
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../core/strict-json.mjs';

export const LAUNCH_PROTOCOL = 1;
export const launchFail = kind => { throw Object.assign(new Error(kind), { kind }); };
const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const sameIdentity = (a, b) => a && b && a.dev === b.dev && a.ino === b.ino;
export async function launchDirectory(target, create = false) {
  const path = target.directory;
  if (create) try { await mkdir(path, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  let stat;
  try { stat = await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path
    || process.platform !== 'win32' && (stat.mode & 0o077 || stat.uid !== process.geteuid())) launchFail('gui-launch-record-invalid');
  return { path, stat };
}
export function validateLaunchReceipt(value, w) {
  const keys = ['kind', 'schemaVersion', 'protocolVersion', 'phase', 'contextKey', 'rootScopeId', 'launchId', 'runtimeId', 'key', 'pid', 'loopbackOrigin'];
  if (!value || Object.keys(value).sort().join() !== keys.sort().join()
    || value.kind !== 'unharness-workbench-process' || value.schemaVersion !== 1 || value.protocolVersion !== LAUNCH_PROTOCOL
    || !['starting', 'running', 'stopped'].includes(value.phase) || value.contextKey !== w.contextKey
    || value.rootScopeId !== null && value.rootScopeId !== w.rootScopeId
    || !UUID.test(value.launchId) || !HASH.test(value.runtimeId) || !HASH.test(value.key)
    || !Number.isSafeInteger(value.pid) || value.pid < 1
    || (value.phase === 'starting' ? value.loopbackOrigin !== null : !validLoopback(value.loopbackOrigin))) launchFail('gui-launch-record-invalid');
  return value;
}
export function validLoopback(value) {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.origin === value && url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number(url.port) >= 1 && Number(url.port) <= 65535; }
  catch { return false; }
}
export async function readLaunchReceipt(w) {
  const directory = await launchDirectory(w);
  if (!directory) return null;
  const path = join(directory.path, 'launch.json');
  let before;
  try { before = await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 4096
    || process.platform !== 'win32' && (before.mode & 0o077 || before.uid !== process.geteuid())) launchFail('gui-launch-record-invalid');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!sameIdentity(before, await handle.stat())) launchFail('gui-launch-record-invalid');
    const bytes = Buffer.alloc(before.size + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const after = await handle.stat();
    if (bytesRead !== before.size || after.size !== before.size || before.mtimeMs !== after.mtimeMs
      || !sameIdentity(before, await lstat(path)) || !sameIdentity(directory.stat, (await launchDirectory(w))?.stat)) launchFail('gui-launch-record-invalid');
    return validateLaunchReceipt(parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytesRead))), w);
  } catch { launchFail('gui-launch-record-invalid'); }
  finally { await handle.close(); }
}
export async function publishLaunchReceipt(w, value, expected) {
  const directory = await launchDirectory(w, true);
  validateLaunchReceipt(value, w);
  if (!isDeepStrictEqual(await readLaunchReceipt(w), expected)) launchFail('gui-launch-record-changed');
  // A unique stage cannot block later startup after a power loss. Incomplete
  // stages remain private diagnostic data; they never become process authority.
  const stage = join(w.directory, '.launch-' + randomUUID() + '.tmp');
  const handle = await open(stage, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  if (!sameIdentity(directory.stat, (await launchDirectory(w))?.stat)
    || !isDeepStrictEqual(await readLaunchReceipt(w), expected)) launchFail('gui-launch-record-changed');
  await rename(stage, join(w.directory, 'launch.json'));
  return readLaunchReceipt(w);
}
export function processPresent(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; }
}
