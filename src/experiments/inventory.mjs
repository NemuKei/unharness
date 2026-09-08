import { execFile } from 'node:child_process';
import { lstat, opendir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { canonical } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { validateStartingPaths, inspectStartingFileIdentities, MAX_STARTING_PATHS } from './files.mjs';

const execute = promisify(execFile);
async function stat(path) {
  try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
async function gitWorkingPaths(project) {
  // Inventory must not execute a configured filesystem-monitor hook. Ignore
  // ambient Git path overrides so this one registered project owns the read.
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))), LC_ALL: 'C' };
  const run = args => execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args],
    { cwd: project, env, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024, timeout: 10000 });
  let root;
  try { root = (await run(['rev-parse', '--show-toplevel'])).stdout; }
  catch (e) {
    if ((e.code === 'ENOENT' || e.code === 128 && e.stderr?.toString().includes('not a git repository'))
      && !await stat(join(project, '.git'))) return null;
    fail('starting-inventory-unavailable');
  }
  if (resolve(root.toString().replace(/\r?\n$/, '')) !== project) fail('starting-project-root-required');
  let output;
  try { output = (await run(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])).stdout; }
  catch { fail('starting-inventory-unavailable'); }
  if (Buffer.from(output.toString()).compare(output) !== 0 || output.length && output.at(-1) !== 0) fail('starting-inventory-unavailable');
  return output.length ? output.toString().slice(0, -1).split('\0') : [];
}
export async function inventoryStartingFiles({ project, additionalPaths = [] }) {
  additionalPaths = validateStartingPaths(additionalPaths);
  await canonical(project);
  const initial = await lstat(project);
  if (!initial.isDirectory() || initial.isSymbolicLink()) fail('starting-files-unsupported');
  await inspectStartingFileIdentities({ project, paths: additionalPaths });
  const gitPaths = await gitWorkingPaths(project), paths = new Set(gitPaths ?? []);
  let visited = 0;
  async function walk(relative, depth = 0) {
    if (++visited > 16384 || depth > 32) fail('starting-files-limit');
    const path = relative ? join(project, relative) : project, s = await stat(path);
    if (!s) return;
    if (s.isSymbolicLink()) fail('starting-files-unsupported');
    if (s.isFile()) {
      paths.add(relative);
      if (paths.size > MAX_STARTING_PATHS) fail('starting-files-limit');
    } else if (s.isDirectory()) {
      for await (const entry of await opendir(path)) {
        if (entry.name.toLowerCase() === '.git') fail('starting-project-root-required');
        await walk(relative ? `${relative}/${entry.name}` : entry.name, depth + 1);
      }
    } else fail('starting-files-unsupported');
  }
  if (gitPaths === null) await walk('');
  else {
    for (const path of ['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', '.codex', '.agents']) await walk(path);
  }
  for (const path of additionalPaths) paths.add(path);
  const sorted = validateStartingPaths([...paths]);
  const guards = await inspectStartingFileIdentities({ project, paths: sorted });
  if (initial.dev !== guards.root.dev || initial.ino !== guards.root.ino) fail('starting-files-changed');
  return { paths: sorted, guards, selection: {
    kind: gitPaths === null ? 'directory-working-files' : 'git-working-files',
    gitMetadata: 'excluded', ignoredFiles: gitPaths === null ? 'not-applicable' : 'excluded',
    retainedProjectInputs: 'included', additionalPaths
  } };
}
