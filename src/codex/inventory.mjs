import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { collectProbe } from './probe.mjs';

const NAMES = ['AGENTS.override.md', 'AGENTS.md'];
const MAX_INSTRUCTION_BYTES = 1024 * 1024;
const MAX_PARENT_DIRECTORIES = 64;

function sameFile(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size
    && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}

async function candidate(path) {
  let handle;
  let found = false;
  try {
    const before = await lstat(path);
    found = true;
    if (before.isSymbolicLink()) return { state: 'link' };
    if (!before.isFile()) return { state: 'not-file' };
    if (before.size > MAX_INSTRUCTION_BYTES) return { state: 'too-large' };
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || !sameFile(before, opened)) return { state: 'changed' };
    const buffer = Buffer.alloc(MAX_INSTRUCTION_BYTES + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    if (size > MAX_INSTRUCTION_BYTES) return { state: 'too-large' };
    const after = await handle.stat();
    const located = await lstat(path);
    if (!located.isFile() || located.isSymbolicLink() || !sameFile(before, after)
      || !sameFile(after, located) || size !== after.size) return { state: 'changed' };
    const bytes = buffer.subarray(0, size);
    return {
      state: bytes.toString('utf8').trim().length ? 'present' : 'empty',
      bytes: size,
      digest: createHash('sha256').update(bytes).digest('hex'),
    };
  } catch (error) {
    return { state: error?.code === 'ENOENT' && !found ? 'absent' : 'unreadable' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function projectDirectories(cwd) {
  const visited = [];
  let directory = cwd;
  for (let depth = 0; depth < MAX_PARENT_DIRECTORIES; depth += 1) {
    visited.push(directory);
    try {
      const marker = await lstat(join(directory, '.git'));
      if (!marker.isSymbolicLink() && (marker.isFile() || marker.isDirectory())) {
        return { boundary: 'git-root', directories: visited.reverse() };
      }
      return { boundary: 'unknown', directories: [cwd] };
    } catch (error) {
      if (error?.code !== 'ENOENT') return { boundary: 'unknown', directories: [cwd] };
    }
    const parent = dirname(directory);
    if (parent === directory) return { boundary: 'cwd-only', directories: [cwd] };
    directory = parent;
  }
  return { boundary: 'depth-limit', directories: [cwd] };
}

// This is a bounded census of standard filenames, not a second Codex loader.
// Keep both override/base candidates; mixed instructions are never auto-classified.
export async function inspectInstructionCandidates({
  cwd = process.cwd(),
  codexHome = process.env.CODEX_HOME || join(homedir(), '.codex'),
} = {}) {
  const result = {
    status: 'partial', boundary: 'unknown', coverage: 'standard-candidates-only',
    loadedState: 'unknown', classification: 'not-reviewed', files: [],
  };
  let directory;
  try {
    directory = await realpath(resolve(cwd));
    if (!(await lstat(directory)).isDirectory()) return result;
  } catch { return result; }
  const discovery = await projectDirectories(directory);
  result.boundary = discovery.boundary;
  const roots = [
    { scope: 'user', depth: 0, directory: resolve(codexHome) },
    ...discovery.directories.map((path, depth) => ({ scope: 'project', depth, directory: path })),
  ];
  for (const root of roots) {
    for (const name of NAMES) {
      result.files.push({ scope: root.scope, depth: root.depth, name, ...await candidate(join(root.directory, name)) });
    }
  }
  if (['git-root', 'cwd-only'].includes(result.boundary)
    && result.files.every(file => ['present', 'empty', 'absent'].includes(file.state))) result.status = 'ok';
  return result;
}

export async function collectSourceInventory(options = {}, {
  probe = collectProbe,
  instructions = inspectInstructionCandidates,
} = {}) {
  // RPC parameters are resolved by the child too; normalize relative cwd once
  // so file discovery and the separate process refer to the same directory.
  const cwd = await realpath(resolve(options.cwd ?? process.cwd()));
  if (!(await lstat(cwd)).isDirectory()) throw new Error('source-inventory-target-invalid');
  const [report, files] = await Promise.all([
    probe({ ...options, cwd, timeoutMs: options.timeoutMs ?? 3000 }),
    instructions({ cwd }),
  ]);
  return {
    schemaVersion: 1,
    kind: 'codex-source-inventory',
    observedAt: new Date().toISOString(),
    probe: report,
    instructions: files,
    management: {
      personalSourcesRegistered: false, classification: 'not-reviewed',
      control: 'unverified', runtimeStateVerified: false, modeSwitchingVerified: false,
    },
  };
}
