import { constants } from 'node:fs';
import {
  open,
  lstat,
  realpath,
  chmod,
  chown,
  unlink,
  link,
  rename,
  mkdir,
  rmdir,
  mkdtemp,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
import { fail } from './errors.mjs';
const exec = promisify(execFile);
export const equal = isDeepStrictEqual;
// Capture remains ownership-neutral for retained read-only dependencies.
// Publication can reproduce only the effective user's ownership and a group
// currently available to that process. Root receives no broader implicit scope.
export function canReproduceOwnership(file) {
  if (file === null) return true;
  if (
    !file?.meta ||
    typeof process.geteuid !== 'function' ||
    typeof process.getegid !== 'function' ||
    typeof process.getgroups !== 'function'
  )
    return false;
  return (
    file.meta.uid === process.geteuid() &&
    (file.meta.gid === process.getegid() ||
      process.getgroups().includes(file.meta.gid))
  );
}
// Portable discovery/registration/plans do not qualify source writes. Only
// macOS publication is supported, so admission there includes its ownership
// check; other platforms retain preview support and independent write gates.
export function canPlanOwnership(file) {
  return process.platform !== 'darwin' || canReproduceOwnership(file);
}
export function assertPlanOwnershipChanges(before, after) {
  if (process.platform === 'darwin') assertOwnershipChanges(before, after);
}
export function assertWritableOwnership(file) {
  if (!canReproduceOwnership(file)) fail('unsupported-metadata');
}
export function assertOwnershipChanges(before, after) {
  for (const [key, file] of Object.entries(before)) {
    if (equal(file, after[key])) continue;
    // Both sides must remain reproducible, including rollback of deletion.
    assertWritableOwnership(file);
    assertWritableOwnership(after[key]);
  }
}
export async function canonical(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path)
    fail('source-redirection');
  if ((await realpath(path)) !== path) fail('source-redirection');
  return path;
}
export async function parentBinding(path) {
  let parent = dirname(path),
    missing = [];
  for (;;) {
    try {
      await canonical(parent);
      const s = await lstat(parent);
      if (!s.isDirectory()) fail('source-redirection');
      return { path: parent, dev: s.dev, ino: s.ino, missing };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      missing.unshift(parent);
      parent = dirname(parent);
    }
  }
}
export async function checkBinding(binding) {
  await canonical(binding.path);
  const s = await lstat(binding.path);
  if (s.dev !== binding.dev || s.ino !== binding.ino || !s.isDirectory())
    fail('source-redirection');
}
async function metadata(path, s) {
  const m = { uid: s.uid, gid: s.gid, mode: s.mode & 0o777, xattrs: {} };
  if (s.nlink !== 1 || !s.isFile() || s.isSymbolicLink() || s.mode & 0o7000)
    fail('unsupported-metadata');
  if (process.platform === 'darwin') {
    const { stdout } = await exec('/bin/ls', ['-ldneO', path], {
      maxBuffer: 65536
    });
    // ACL rows and nonempty file flags are deliberately unavailable.
    if (
      /^\s*\d+:/m.test(stdout) ||
      stdout.split('\n')[0].trim().split(/\s+/)[4] !== '-'
    )
      fail('unsupported-metadata');
    const names = (
      await exec('/usr/bin/xattr', [path], { maxBuffer: 65536 })
    ).stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .sort();
    for (const name of names) {
      if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(name)) fail('unsupported-metadata');
      m.xattrs[name] = (
        await exec('/usr/bin/xattr', ['-px', name, path], { maxBuffer: 65536 })
      ).stdout
        .replace(/\s/g, '')
        .toLowerCase();
    }
  }
  return m;
}
export async function captureFileBytes(path, maxBytes = 128 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 8 * 1024 * 1024)
    fail('source-too-large');
  await parentBinding(path);
  let s;
  try {
    s = await lstat(path);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  if (s.size > maxBytes) fail('source-too-large');
  const meta = await metadata(path, s);
  const h = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const hs = await h.stat();
    if (hs.ino !== s.ino || hs.dev !== s.dev) fail('source-redirection');
    const chunks = [];
    let size = 0;
    while (size <= maxBytes) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - size));
      const { bytesRead } = await h.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      size += bytesRead;
      if (size > maxBytes) fail('source-too-large');
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return { bytes: Buffer.concat(chunks, size), meta };
  } finally {
    await h.close();
  }
}
export async function captureFile(path) {
  const file = await captureFileBytes(path);
  if (file === null) return null;
  if (!file.bytes.equals(Buffer.from(file.bytes.toString('utf8'), 'utf8')))
    fail('unsupported-source');
  return { text: file.bytes.toString('utf8'), meta: file.meta };
}
export async function defaultMetadata(parent) {
  const dir = await realpath(
    await mkdtemp(join(tmpdir(), 'unharness-metadata-'))
  );
  try {
    const path = join(dir, 'sample');
    await writeFile(path, '', { mode: 0o600 });
    return (await captureFile(path)).meta;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
export async function writeCompleteBytes(path, file, maxBytes = 128 * 1024) {
  if (!Buffer.isBuffer(file?.bytes) || !Number.isSafeInteger(maxBytes)
    || maxBytes < 0 || maxBytes > 8 * 1024 * 1024 || file.bytes.length > maxBytes) fail('unsupported-source');
  assertWritableOwnership(file);
  const h = await open(path, 'wx', 0o600);
  try {
    await h.writeFile(file.bytes);
    await h.sync();
  } finally {
    await h.close();
  }
  if (process.platform !== 'win32') {
    await chown(path, file.meta.uid, file.meta.gid);
    await chmod(path, file.meta.mode);
  }
  if (process.platform === 'darwin') {
    const names = (await exec('/usr/bin/xattr', [path])).stdout
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const name of names)
      if (!Object.hasOwn(file.meta.xattrs, name))
        await exec('/usr/bin/xattr', ['-d', name, path]);
    for (const [name, value] of Object.entries(file.meta.xattrs))
      await exec('/usr/bin/xattr', ['-wx', name, value, path]);
  }
  if (!equal(await captureFileBytes(path, Math.max(1, maxBytes)), file)) fail('unsupported-metadata');
}
export async function writeComplete(path, file) {
  await writeCompleteBytes(path, { bytes: Buffer.from(file.text, 'utf8'), meta: file.meta });
}
export async function publish(stage, path, before) {
  if (before === null) {
    await link(stage, path);
    await unlink(stage);
  } else await rename(stage, path);
}
export { unlink, mkdir, rmdir };
