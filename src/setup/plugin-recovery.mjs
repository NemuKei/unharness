// Versioned local recovery packages never share the native plugin cache/data.
import { chmod, cp, lstat, mkdtemp, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readDistribution, distributionFile } from './distribution.mjs';
import { openPluginBinding, openSavedPluginBinding } from './plugin-binding.mjs';
import { connectionDirectory, checkDirectory, readConnectionRecord, publishConnectionRecord, bindingFail } from './connection-records.mjs';
import { acquire } from '../sources/transaction.mjs';

const HASH = /^[a-f0-9]{64}$/;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join() === keys.sort().join();
const commandName = 'Open Unharness Recovery.command';
const productRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
const bootstrapPaths = ['runtime/bin/node', 'src/setup/recovery-launch.mjs', 'src/setup/distribution.mjs', 'src/core/strict-json.mjs'];
function commandText(root, selection, manifest) {
  const checks = bootstrapPaths.map(path => {
    const file = manifest.files.find(file => file.path === path);
    if (!file) bindingFail('plugin-recovery-invalid');
    return file.sha256 + '  ' + path;
  });
  // Only trusted macOS utilities run before these four embedded hashes match.
  // The small verified bootstrap checks the entire bundle before importing CLI.
  return '#!/bin/sh\nunset NODE_OPTIONS NODE_PATH PERL5OPT PERL5LIB\ncd ' + quote(root) + ' || exit 1\n'
    + "/usr/bin/printf '%s\\n' " + checks.map(quote).join(' ') + ' | /usr/bin/shasum -a 256 -c - --status --strict || {\n'
    + "  /usr/bin/printf '%s\\n' 'Unharness: recovery files do not match. Use another saved recovery copy.' >&2\n  exit 1\n}\n"
    + 'exec ' + [join(root, 'runtime/bin/node'), join(root, 'src/setup/recovery-launch.mjs'), selection.distributionId,
      '--directory', selection.directory, '--binding-id', selection.bindingId].map(quote).join(' ') + '\n';
}
function select(selection) {
  if (!exact(selection, ['directory', 'bindingId', 'distributionId'])
    || !HASH.test(selection.bindingId) || !HASH.test(selection.distributionId)) bindingFail('plugin-recovery-invalid');
}
async function readInstallation(directory, selection) {
  await checkDirectory(directory);
  const record = await readConnectionRecord(directory, selection.distributionId + '.json');
  if (!exact(record, ['kind', 'schemaVersion', 'bindingId', 'distributionId', 'attempt', 'identity', 'command'])
    || record.kind !== 'unharness-plugin-recovery' || record.schemaVersion !== 1
    || record.bindingId !== selection.bindingId || record.distributionId !== selection.distributionId
    || typeof record.attempt !== 'string' || !/^copy-[A-Za-z0-9_-]{6,20}$/.test(record.attempt)) bindingFail('plugin-recovery-invalid');
  const attempt = await connectionDirectory(join(directory.path, record.attempt));
  if (!isDeepStrictEqual(attempt.identity, record.identity)) bindingFail('plugin-recovery-invalid');
  const root = join(attempt.path, 'package'), distribution = await readDistribution(root);
  if (distribution.id !== selection.distributionId) bindingFail('plugin-recovery-invalid');
  const commandPath = join(attempt.path, commandName);
  const command = await distributionFile(commandPath, { textLimit: 16384 });
  if (command.text !== commandText(root, selection, distribution.manifest) || command.sha256 !== record.command || !command.executable
    || (await lstat(commandPath)).mode & 0o077) bindingFail('plugin-recovery-invalid');
  return { status: 'ready', version: distribution.manifest.version, distributionId: distribution.id, root, commandPath, selection };
}

export async function preparePluginRecovery({ dataDirectory, distributionRoot }) {
  const native = await openPluginBinding({ dataDirectory }), target = await native.read();
  if (!target) bindingFail('plugin-not-configured');
  const distribution = await readDistribution(distributionRoot);
  const selection = { directory: target.directory, bindingId: target.bindingId, distributionId: distribution.id };
  const directory = await connectionDirectory(join(target.directory, 'recovery'), { create: true });
  const release = await acquire({ workspace: target.contextKey, owner: directory.path }, true);
  try {
    if (await readConnectionRecord(directory, distribution.id + '.json')) return await readInstallation(directory, selection);
    // A failed attempt stays private and non-authoritative. A retry gets a new
    // directory; it cannot overwrite an independently edited or incomplete copy.
    const attemptPath = await mkdtemp(join(directory.path, 'copy-'));
    await chmod(attemptPath, 0o700);
    const attempt = await connectionDirectory(attemptPath), root = join(attemptPath, 'package');
    await cp(distributionRoot, root, { recursive: true, errorOnExist: true, force: false, dereference: false });
    await chmod(root, 0o700);
    if ((await readDistribution(root)).id !== distribution.id || (await readDistribution(distributionRoot)).id !== distribution.id)
      bindingFail('plugin-recovery-invalid');
    const commandPath = join(attemptPath, commandName);
    await writeFile(commandPath, commandText(root, selection, distribution.manifest), { flag: 'wx', mode: 0o700 });
    const current = await native.read();
    if (current?.bindingId !== target.bindingId) bindingFail('plugin-binding-changed');
    await checkDirectory(directory); await checkDirectory(attempt);
    const record = { kind: 'unharness-plugin-recovery', schemaVersion: 1, bindingId: target.bindingId,
      distributionId: distribution.id, attempt: basename(attemptPath), identity: attempt.identity,
      command: (await distributionFile(commandPath)).sha256 };
    await publishConnectionRecord(directory, distribution.id + '.json', record);
    return await readInstallation(directory, selection);
  } finally { await release(); }
}

// Development checkouts have no portable root manifest. A packaged installation
// must verify its distribution, including the index, before enabling writes.
export async function prepareInstalledRecovery(dataDirectory) {
  try { await lstat(join(productRoot, 'plugin.json')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  return preparePluginRecovery({ dataDirectory, distributionRoot: productRoot });
}

export async function openRecoveryBinding(selection) {
  select(selection);
  const saved = await openSavedPluginBinding(selection);
  const directory = await connectionDirectory(join(selection.directory, 'recovery'));
  let pinned;
  async function read() {
    const target = await saved.read(), installation = await readInstallation(directory, selection);
    if (pinned && !isDeepStrictEqual(pinned, installation)) bindingFail('plugin-recovery-invalid');
    pinned ??= installation;
    return { ...target, recovery: installation };
  }
  await read();
  return { selection, read };
}
