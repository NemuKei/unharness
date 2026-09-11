// These compatibility cases need records created by the actual old writer.
// Rewriting a modern immutable registration would test neither data format.
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
export async function registerLegacySourceProfile({ parent, context, revision, skills = true, directoryDeviceOffset = 0 }) {
  const directory = join(parent, 'legacy-writer');
  await mkdir(directory);
  const archive = join(parent, 'legacy-writer.tar');
  await execute('git', ['archive', '--format=tar', '--output', archive, revision, 'src', 'bin', 'package.json']);
  await execute('tar', ['-xf', archive, '-C', directory]);
  // Discovery must have the baseline's locked YAML parser to classify manual
  // Skill control. A dependency-free copy deliberately cannot qualify that.
  const previousPackage = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  await mkdir(join(directory, 'node_modules'));
  // One later pre-UUID writer eagerly imported its image decoder even for
  // discovery. Supply its exact locked dependency without changing old code.
  for (const name of ['yaml', ...['pngjs', 'node-diff3'].filter(name => previousPackage.dependencies[name])]) {
    const installed = fileURLToPath(new URL('../node_modules/' + name, import.meta.url));
    const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
    if (previousPackage.dependencies[name] !== metadata.version) throw Error('Baseline dependency version differs from installed dependency.');
    await symlink(installed, join(directory, 'node_modules', name), 'dir');
  }
  const cli = join(directory, 'bin/unharness.mjs');
  const legacyNodeArgs = [];
  if (directoryDeviceOffset !== 0) {
    if (!Number.isSafeInteger(directoryDeviceOffset) || directoryDeviceOffset < 1) throw Error('Invalid synthetic device offset.');
    // Only the historical writer sees the simulated earlier boot number. The
    // immutable records are produced by that writer, never rewritten to fake
    // a legacy format. File descriptors and all source bytes stay real.
    const shim = join(parent, 'legacy-directory-device.mjs');
    await writeFile(shim, `import fs from 'node:fs';\nimport {syncBuiltinESMExports} from 'node:module';\nconst original=fs.promises.lstat;\nfs.promises.lstat=async (...args)=>{const s=await original(...args);if(s.isDirectory())s.dev+=${directoryDeviceOffset};return s;};\nsyncBuiltinESMExports();\n`);
    legacyNodeArgs.push('--import', shim);
  }
  const call = async (action, input) => JSON.parse((await execute(process.execPath,
    [...legacyNodeArgs, cli, 'sources', action, '--json', JSON.stringify(input)], { timeout: 30000 })).stdout);
  const discovery = await call('discover', context);
  const registered = await call('register', { context, discoveryId: discovery.discoveryId,
    instructionsOptional: true, selectedSkillIds: skills ? discovery.skills.filter(s => s.eligible).map(s => s.id) : [],
    userAddedOptional: true });
  return { ...registered, legacyCli: cli, legacyNodeArgs, callLegacy: call };
}
