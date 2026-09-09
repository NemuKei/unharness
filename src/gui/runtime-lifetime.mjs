// A detached packaged worker must not outlive the installed files that own it.
// This watches identities, not pids, and never signals an unrelated process.
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const identity = s => ({ dev: s.dev, ino: s.ino, size: s.size, mtimeMs: s.mtimeMs, mode: s.mode });
export async function watchableRuntime(root) {
  try { await lstat(join(root, 'distribution.json')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  const paths = ['', 'distribution.json', 'package.json', 'src/gui/launch-worker.mjs', 'runtime/bin/node'];
  const read = async () => {
    if (await realpath(root) !== root) throw Error('runtime-changed');
    return Promise.all(paths.map(async path => {
      const s = await lstat(join(root, path));
      if (s.isSymbolicLink() || (path ? !s.isFile() : !s.isDirectory())) throw Error('runtime-changed');
      // Native cache roots may gain harmless sibling metadata. Only physical
      // directory replacement matters; immutable files include size/mtime/mode.
      return path ? identity(s) : { dev: s.dev, ino: s.ino };
    }));
  };
  const original = await read();
  return async () => { try { return isDeepStrictEqual(await read(), original); } catch { return false; } };
}
