import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, rename, symlink, lstat, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parentBinding, checkBinding } from '../src/sources/platform.mjs';

const mac = { skip: process.platform !== 'darwin' };
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-directory-id-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, '選んだ directory');
  await mkdir(directory);
  return { root, directory, binding: await parentBinding(join(directory, 'control.json')) };
}

test('a persistent source directory survives a changed stored boot-local device number', mac, async t => {
  const { directoryIdentity } = await import('../src/platform/directory-identity.mjs');
  const { binding, directory } = await fixture(t), stat = await lstat(directory);
  const previous = { ...binding, ...directoryIdentity({ ino: stat.ino, dev: stat.dev + 1 }, binding.volumeUuid) };
  await checkBinding(previous);
  assert.deepEqual(previous, binding);
});

test('a different persistent volume cannot reuse an otherwise matching source identity', mac, async t => {
  const { binding } = await fixture(t);
  const wrong = binding.volumeUuid === '12345678-1234-1234-1234-123456789abc'
    ? '23456789-1234-1234-1234-123456789abc' : '12345678-1234-1234-1234-123456789abc';
  await assert.rejects(checkBinding({ ...binding, volumeUuid: wrong }), { kind: 'source-redirection' });
});

test('persistent volume identity does not admit a replaced directory or a redirected path', mac, async t => {
  const { root, directory, binding } = await fixture(t);
  await rename(directory, join(root, 'kept'));
  await mkdir(directory);
  await assert.rejects(checkBinding(binding), { kind: 'source-redirection' });
  await rm(directory, { recursive: true });
  await symlink(join(root, 'kept'), directory);
  await assert.rejects(checkBinding(binding), { kind: 'source-redirection' });
});

test('a legacy source identity still requires its recorded device and is never upgraded by reading', mac, async t => {
  const { binding, directory } = await fixture(t), stat = await lstat(directory);
  const legacy = { path: binding.path, missing: binding.missing, dev: stat.dev, ino: stat.ino };
  const before = structuredClone(legacy);
  await checkBinding(legacy);
  await assert.rejects(checkBinding({ ...legacy, dev: legacy.dev + 1 }), { kind: 'source-redirection' });
  assert.deepEqual(legacy, before);
});

test('interrupted source recovery retains the persistent identity of a directory with independent contents', mac, async t => {
  const { aiProfile } = await import('../test-support/ai-profile.mjs');
  const { planUserMode, applyUserPlan, recoverUserSources } = await import('../src/sources/service.mjs');
  const { openWorkspace } = await import('../src/sources/records.mjs');
  const { readSourceProfileFiles } = await import('../src/sources/owned-profile.mjs');
  const { setSourceTransactionTestHook } = await import('../src/sources/transaction.mjs');
  const p = await aiProfile(t);
  t.after(() => setSourceTransactionTestHook(null));
  const plan = await planUserMode({ workspace: p.workspace, mode: 'unseal' });
  setSourceTransactionTestHook(phase => { if (phase === 'directory') throw Error('owned interruption'); });
  await assert.rejects(applyUserPlan({ workspace: p.workspace, planId: plan.planId }));
  setSourceTransactionTestHook(null);
  const journal = JSON.parse(await readFile(join(p.workspace, 'pending.json'), 'utf8'));
  const created = journal.dirs.find(dir => dir.identity?.volumeUuid);
  assert.ok(created);
  await writeFile(join(created.path, 'independent.txt'), 'Keep this independent file');
  await recoverUserSources({ workspace: p.workspace });
  const recovered = await openWorkspace(p.workspace);
  assert.deepEqual(recovered.state.ownedDirs.find(dir => dir.path === created.path)?.identity, created.identity);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  for (const mode of ['unseal', 'normal']) {
    const next = await planUserMode({ workspace: p.workspace, mode });
    await applyUserPlan({ workspace: p.workspace, planId: next.planId });
  }
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.equal(await readFile(join(created.path, 'independent.txt'), 'utf8'), 'Keep this independent file');
});

test('an OS metadata timeout after creating a policy directory leaves a usable recovery identity', mac, async () => {
  // A separate process keeps the OS-call shim out of the other real-Mac cases.
  const script = `
    import assert from 'node:assert/strict';
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { promisify } from 'node:util';
    import { readFile } from 'node:fs/promises';
    const original = childProcess.execFile, execute = promisify(original), cleanups = [];
    let armed = false, workspace, observedIdentity;
    function shim(...args) { return original(...args); }
    shim[promisify.custom] = async (file, args, options) => {
      if (armed && file === '/usr/bin/osascript' && args.at(-1).endsWith('/agents')) {
        const journal = JSON.parse(await readFile(workspace + '/pending.json', 'utf8'));
        observedIdentity = journal.dirs.find(dir => dir.path === args.at(-1))?.identity;
        throw Object.assign(Error('owned metadata timeout'), { code: 'ETIMEDOUT' });
      }
      return execute(file, args, options);
    };
    childProcess.execFile = shim; syncBuiltinESMExports();
    const { aiProfile } = await import('./test-support/ai-profile.mjs');
    const service = await import('./src/sources/service.mjs');
    const { setSourceTransactionTestHook } = await import('./src/sources/transaction.mjs');
    const { readSourceProfileFiles } = await import('./src/sources/owned-profile.mjs');
    try {
      const p = await aiProfile({ after(fn) { cleanups.push(fn); } }); workspace = p.workspace;
      const plan = await service.planUserMode({ workspace, mode: 'unseal' });
      setSourceTransactionTestHook(phase => { if (phase === 'journal') armed = true; });
      await assert.rejects(service.applyUserPlan({ workspace, planId: plan.planId }), { kind: 'unsupported-metadata' });
      armed = false; setSourceTransactionTestHook(null);
      assert.equal(typeof observedIdentity?.volumeUuid, 'string');
      await service.recoverUserSources({ workspace });
      assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
      const state = await service.userSourceState({ workspace });
      assert.equal(state.preparedMode, 'normal'); assert.equal(state.recovery.pending, false);
    } finally {
      armed = false; setSourceTransactionTestHook(null);
      childProcess.execFile = original; syncBuiltinESMExports();
      for (const cleanup of cleanups.reverse()) await cleanup();
    }
  `;
  await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { timeout: 30000 });
});
