// These compatibility cases need records created by the actual old writer.
// Rewriting a modern immutable registration would test neither data format.
import { mkdir, readFile, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
export async function registerLegacySourceProfile({ parent, context, revision, skills = true }) {
  const directory = join(parent, 'legacy-writer');
  await mkdir(directory);
  const archive = join(parent, 'legacy-writer.tar');
  await execute('git', ['archive', '--format=tar', '--output', archive, revision, 'src', 'bin', 'package.json']);
  await execute('tar', ['-xf', archive, '-C', directory]);
  // Discovery must have the baseline's locked YAML parser to classify manual
  // Skill control. A dependency-free copy deliberately cannot qualify that.
  const yaml = fileURLToPath(new URL('../node_modules/yaml', import.meta.url));
  const previousPackage = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const installedYaml = JSON.parse(await readFile(join(yaml, 'package.json'), 'utf8'));
  if (previousPackage.dependencies.yaml !== installedYaml.version) throw Error('Baseline YAML version differs from installed dependency.');
  await mkdir(join(directory, 'node_modules'));
  await symlink(yaml, join(directory, 'node_modules/yaml'), 'dir');
  const cli = join(directory, 'bin/unharness.mjs');
  const call = async (action, input) => JSON.parse((await execute(process.execPath,
    [cli, 'sources', action, '--json', JSON.stringify(input)], { timeout: 30000 })).stdout);
  const discovery = await call('discover', context);
  const registered = await call('register', { context, discoveryId: discovery.discoveryId,
    instructionsOptional: true, selectedSkillIds: skills ? discovery.skills.filter(s => s.eligible).map(s => s.id) : [],
    userAddedOptional: true });
  return { ...registered, legacyCli: cli };
}
