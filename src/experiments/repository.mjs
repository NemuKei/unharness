import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { isDeepStrictEqual, promisify } from 'node:util';
import { canonical } from '../sources/platform.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';

const execute = promisify(execFile);
const unavailable = () => fail('replay-repository-unavailable');
const sha = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
export const absoluteReplayPath = path => typeof path === 'string' && path.length <= 4096
  && !/[\0\r\n]/.test(path) && isAbsolute(path) && resolve(path) === path;
export const directoryIdentity = stat => ({ dev: stat.dev, ino: stat.ino, mode: stat.mode, uid: stat.uid, gid: stat.gid });
export async function boundDirectory(path) {
  if (!absoluteReplayPath(path)) unavailable();
  await canonical(path);
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) unavailable();
  return { path, identity: directoryIdentity(stat) };
}
export function validateDirectoryBinding(binding) {
  exactKeys(binding, ['path', 'identity'], [], 'replay-repository-unavailable');
  exactKeys(binding.identity, ['dev', 'ino', 'mode', 'uid', 'gid'], [], 'replay-repository-unavailable');
  if (!absoluteReplayPath(binding.path) || !Object.values(binding.identity).every(x => Number.isSafeInteger(x) && x >= 0)
    || (binding.identity.mode & 0o170000) !== 0o040000) unavailable();
}
export async function checkDirectoryBinding(binding) {
  validateDirectoryBinding(binding);
  if (!isDeepStrictEqual(await boundDirectory(binding.path), binding)) unavailable();
}
export async function replayGit(project, args, hooksDirectory) {
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    LC_ALL: 'C', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0' };
  const options = ['--no-optional-locks', '-c', 'core.fsmonitor=false',
    ...(hooksDirectory ? ['-c', `core.hooksPath=${hooksDirectory}`] : [])];
  const { stdout } = await execute('git', [...options, ...args],
    { cwd: project, env, encoding: 'buffer', timeout: 15000, maxBuffer: 256 * 1024 });
  const text = new TextDecoder('utf-8', { fatal: true }).decode(stdout);
  return text.replace(/\r?\n$/, '');
}
async function hasGitMarker(project) {
  let path = project;
  for (let depth = 0; depth < 64; depth++) {
    try { await lstat(join(path, '.git')); return true; }
    catch (e) { if (e.code !== 'ENOENT') unavailable(); }
    const parent = dirname(path);
    if (parent === path) return false;
    path = parent;
  }
  unavailable();
}
export function validateReplayRepository(repository) {
  const git = repository?.kind === 'git';
  exactKeys(repository, git ? ['kind', 'project', 'root', 'gitDirectory', 'commonDirectory', 'head']
    : ['kind', 'project', 'root'], [], 'replay-repository-unavailable');
  if (!['git', 'directory'].includes(repository.kind) || repository.root?.path !== repository.project) unavailable();
  validateDirectoryBinding(repository.root);
  if (git) {
    validateDirectoryBinding(repository.gitDirectory); validateDirectoryBinding(repository.commonDirectory);
    if (!sha(repository.head)) unavailable();
  }
}
export async function inspectReplayRepository({ project }) {
  try {
    const root = await boundDirectory(project);
    let top;
    try { top = await replayGit(project, ['rev-parse', '--show-toplevel']); }
    catch (e) {
      if ((e.code === 'ENOENT' || e.code === 128 && e.stderr?.toString().includes('not a git repository'))
        && !await hasGitMarker(project)) return { kind: 'directory', project, root };
      unavailable();
    }
    if (top !== project) unavailable();
    const gitDirectory = await boundDirectory(await replayGit(project, ['rev-parse', '--absolute-git-dir']));
    const commonDirectory = await boundDirectory(await replayGit(project, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
    const head = await replayGit(project, ['rev-parse', '--verify', 'HEAD^{commit}']);
    const result = { kind: 'git', project, root, gitDirectory, commonDirectory, head };
    validateReplayRepository(result);
    await checkDirectoryBinding(root); await checkDirectoryBinding(gitDirectory); await checkDirectoryBinding(commonDirectory);
    return result;
  } catch { unavailable(); }
}
export async function assertReplayRepository(repository) {
  try {
    validateReplayRepository(repository);
    const current = await inspectReplayRepository({ project: repository.project });
    // The original may advance independently; every attempt still uses the
    // series' pinned commit. Its continued existence is checked without fetch.
    if (!isDeepStrictEqual({ ...current, head: null }, { ...repository, head: null })) unavailable();
    if (repository.kind === 'git') await replayGit(repository.project, ['cat-file', '-e', repository.head + '^{commit}']);
  } catch { unavailable(); }
}
