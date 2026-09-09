#!/usr/bin/env node
// Maintainer-only assembly. End users receive the runtime and built interface.
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NODE_RUNTIME, distributionFile, indexDistribution } from '../src/setup/distribution.mjs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const run = (file, args, cwd = root) => promisify(execFile)(file, args, { cwd, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8' });
const usage = 'node scripts/build-plugin.mjs --output <new absolute directory> --runtime-archive <verified Node archive>\n';
async function notices(output) {
  const modules = join(output, 'node_modules'), rows = [];
  for (const entry of (await readdir(modules)).sort()) {
    if (entry.startsWith('.')) continue;
    const names = entry.startsWith('@') ? (await readdir(join(modules, entry))).map(name => entry + '/' + name) : [entry];
    for (const name of names) {
      const pkg = JSON.parse(await readFile(join(modules, name, 'package.json'), 'utf8'));
      rows.push(`| ${pkg.name} | ${pkg.version} | ${typeof pkg.license === 'string' ? pkg.license : 'See package license'} | node_modules/${name} |`);
    }
  }
  await writeFile(join(output, 'THIRD_PARTY_NOTICES.md'), '# Bundled components\n\nUnharness is MIT licensed; see LICENSE. Component licenses and notices remain in their package directories.\n\n'
    + `Node.js ${NODE_RUNTIME.version}: official ${NODE_RUNTIME.platform} archive, SHA256 ${NODE_RUNTIME.archiveSha256}. Its license and notices are in runtime/LICENSE.\n\n`
    + '| Package | Version | Declared license | Included source and notices |\n| --- | --- | --- | --- |\n' + rows.join('\n') + '\n');
}
export async function buildPlugin({ output, runtimeArchive }) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('This distribution currently qualifies macOS arm64 only.');
  if (!isAbsolute(output) || resolve(output) !== output || !isAbsolute(runtimeArchive) || resolve(runtimeArchive) !== runtimeArchive) throw Error('Use canonical absolute paths.');
  if ((await distributionFile(runtimeArchive)).sha256 !== NODE_RUNTIME.archiveSha256) throw Error('Node runtime archive checksum mismatch.');
  await realpath(dirname(output));
  // Check the source build before allocating the new output; never overlay a previous bundle.
  await run('npm', ['run', 'check']);
  await run('npm', ['run', 'build']);
  const revision = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const dirty = Boolean((await run('git', ['status', '--porcelain'])).stdout.trim());
  await mkdir(output, { mode: 0o700 });
  const staging = await realpath(await mkdtemp(join(tmpdir(), 'unharness-runtime-extract-')));
  try {
    for (const name of ['bin', 'src', 'skills', 'dist', 'docs', 'package.json', 'package-lock.json', 'README.md', 'README.ja.md', 'LICENSE'])
      await cp(join(root, name), join(output, name), { recursive: true, errorOnExist: true, force: false });
    for (const name of ['plugin.json', 'mcp.json', '.codex-plugin'])
      await cp(join(root, 'packaging', 'unharness', name), join(output, name), { recursive: true, errorOnExist: true, force: false });
    await mkdir(join(output, 'scripts')); await cp(join(root, 'scripts/unharness'), join(output, 'scripts/unharness'));
    await chmod(join(output, 'scripts/unharness'), 0o755);
    await run('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], output);
    // Runtime imports do not use package executables; omit npm's symlink launchers.
    await rm(join(output, 'node_modules', '.bin'), { recursive: true, force: true });
    const prefix = NODE_RUNTIME.archive.replace('.tar.gz', '');
    await run('/usr/bin/tar', ['-xzf', runtimeArchive, prefix + '/bin/node', prefix + '/LICENSE'], staging);
    await mkdir(join(output, 'runtime')); await mkdir(join(output, 'runtime', 'bin'));
    await cp(join(staging, prefix, 'bin/node'), join(output, 'runtime/bin/node'));
    await cp(join(staging, prefix, 'LICENSE'), join(output, 'runtime/LICENSE'));
    await chmod(join(output, 'runtime/bin/node'), 0o755);
    const actual = (await run(join(output, 'runtime/bin/node'), ['--version'], output)).stdout.trim();
    if (actual !== 'v' + NODE_RUNTIME.version) throw Error('Bundled runtime version mismatch.');
    await notices(output);
    const distribution = await indexDistribution(output, { platform: NODE_RUNTIME.platform, sourceRevision: revision, sourceDirty: dirty });
    return { output, id: distribution.id, version: distribution.manifest.version, platform: distribution.manifest.platform,
      sourceRevision: revision, sourceDirty: dirty, files: distribution.manifest.files.length };
  } finally { await rm(staging, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write(usage);
  else if (args.length !== 4 || args[0] !== '--output' || args[2] !== '--runtime-archive') { process.stderr.write(usage); process.exitCode = 2; }
  else try { process.stdout.write(JSON.stringify(await buildPlugin({ output: args[1], runtimeArchive: args[3] })) + '\n'); }
  catch (error) { process.stderr.write('Plugin assembly failed: ' + error.message + '\n'); process.exitCode = 1; }
}
