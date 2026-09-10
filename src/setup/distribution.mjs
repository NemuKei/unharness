import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../core/strict-json.mjs';

export const NODE_RUNTIME = Object.freeze({ version: '24.20.0', platform: 'darwin-arm64',
  archive: 'node-v24.20.0-darwin-arm64.tar.gz',
  archiveSha256: '40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8',
  url: 'https://nodejs.org/dist/v24.20.0/node-v24.20.0-darwin-arm64.tar.gz' });
export const distributionFail = () => { throw Object.assign(Error('distribution-invalid'), { kind: 'distribution-invalid' }); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join() === keys.sort().join();
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const roots = new Set(['plugin.json', '.codex-plugin', 'mcp.json', 'skills', 'scripts', 'runtime', 'bin', 'src', 'dist', 'assets',
  'node_modules', 'package.json', 'package-lock.json', 'README.md', 'README.ja.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'docs']);
const required = ['plugin.json', '.codex-plugin/plugin.json', 'mcp.json', 'skills/unharness/SKILL.md', 'scripts/unharness',
  'bin/unharness.mjs', 'dist/index.html', 'runtime/bin/node', 'runtime/LICENSE', 'package.json', 'LICENSE'];
const metadataKeys = ['kind', 'schemaVersion', 'version', 'platform', 'sourceRevision', 'sourceDirty', 'runtime', 'files'];

async function rootDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path || await realpath(path) !== path) distributionFail();
  const s = await lstat(path);
  if (!s.isDirectory() || s.isSymbolicLink()) distributionFail();
  return s;
}
export async function distributionFile(path, { textLimit = 0 } = {}) {
  let handle;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 256 * 1024 * 1024
      || before.mode & 0o7000 || textLimit && before.size > textLimit) distributionFail();
    handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (!same(before, await handle.stat())) distributionFail();
    const h = createHash('sha256'), pieces = [], buffer = Buffer.alloc(Math.min(before.size + 1, 1024 * 1024));
    let total = 0;
    while (true) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, total);
      if (!bytesRead) break;
      total += bytesRead;
      if (total > before.size) distributionFail();
      h.update(buffer.subarray(0, bytesRead));
      if (textLimit) pieces.push(Buffer.from(buffer.subarray(0, bytesRead)));
    }
    const after = await handle.stat();
    if (total !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.mode !== before.mode
      || !same(before, await lstat(path))) distributionFail();
    return { bytes: total, sha256: h.digest('hex'), executable: Boolean(before.mode & 0o111),
      ...(textLimit ? { text: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(pieces)) } : {}) };
  } catch { distributionFail(); }
  finally { await handle?.close(); }
}
async function json(root, path) {
  return parseStrictJson((await distributionFile(join(root, path), { textLimit: 4 * 1024 * 1024 })).text);
}
async function filesIn(root) {
  const rootIdentity = await rootDirectory(root), files = [];
  async function visit(path, prefix) {
    const before = await lstat(path);
    if (!before.isDirectory() || before.isSymbolicLink()) distributionFail();
    for (const entry of (await readdir(path)).sort()) {
      if (!prefix && entry === 'distribution.json') continue;
      const name = prefix ? prefix + '/' + entry : entry;
      if (!prefix && !roots.has(entry) || /[\u0000-\u001f\u007f\\]/.test(name)
        || name.split('/').some(part => ['.git', '.env', '.unharness', '.unharness-user-sources', '.unharness-workbench', '.worktrees', 'local-evidence', 'auth.json'].includes(part))) distributionFail();
      const selected = join(path, entry), s = await lstat(selected);
      if (s.isSymbolicLink()) distributionFail();
      if (s.isDirectory()) await visit(selected, name);
      else {
        if (files.length >= 100000) distributionFail();
        files.push({ path: name, ...await distributionFile(selected) });
      }
    }
    if (!same(before, await lstat(path))) distributionFail();
  }
  await visit(root, '');
  if (!same(rootIdentity, await rootDirectory(root)) || required.some(path => !files.some(file => file.path === path))) distributionFail();
  if (files.some(file => file.path === 'src/appearances/stock.mjs')
    && !files.some(file => file.path === 'assets/appearance-templates/hangar-layered-v1/stock.json')) distributionFail();
  return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
async function versionOf(root) {
  const [portable, overlay, pkg] = await Promise.all(['plugin.json', '.codex-plugin/plugin.json', 'package.json'].map(path => json(root, path)));
  if (portable.$schema !== 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
    || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version)
    || [portable, overlay, pkg].some(p => p.name !== 'unharness' || p.version !== pkg.version || p.license !== 'MIT')) distributionFail();
  return pkg.version;
}
function validateMetadata(manifest) {
  if (!exact(manifest, metadataKeys) || manifest.kind !== 'unharness-distribution' || manifest.schemaVersion !== 1
    || manifest.platform !== NODE_RUNTIME.platform || !isDeepStrictEqual(manifest.runtime, NODE_RUNTIME)
    || typeof manifest.sourceDirty !== 'boolean' || manifest.sourceRevision !== null && !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(manifest.sourceRevision)
    || !Array.isArray(manifest.files) || manifest.files.length > 100000) distributionFail();
}
export async function readDistribution(root) {
  try {
    await rootDirectory(root);
    const manifest = await json(root, 'distribution.json');
    validateMetadata(manifest);
    if (manifest.version !== await versionOf(root) || !isDeepStrictEqual(manifest.files, await filesIn(root))) distributionFail();
    return { id: digest(JSON.stringify(manifest)), root, manifest };
  } catch { distributionFail(); }
}
export async function indexDistribution(root, { platform, sourceRevision, sourceDirty }) {
  try {
    const manifest = { kind: 'unharness-distribution', schemaVersion: 1, version: await versionOf(root), platform,
      sourceRevision, sourceDirty, runtime: NODE_RUNTIME, files: await filesIn(root) };
    validateMetadata(manifest);
    const handle = await open(join(root, 'distribution.json'), 'wx', 0o644);
    try { await handle.writeFile(JSON.stringify(manifest) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    return await readDistribution(root);
  } catch { distributionFail(); }
}
