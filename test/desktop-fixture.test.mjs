import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, realpath, rename, rm, symlink, unlink, writeFile, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { changeDesktopFixture, cleanupDesktopFixture, createDesktopFixture, inspectDesktopFixture,
  readDesktopFixture, recoverDesktopFixture, snapshotDesktopFixture } from '../src/codex/desktop-fixture.mjs';

async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-desktop-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await mkdir(join(parent, '空 白'));
  return { parent, fixture: await createDesktopFixture({ parent: join(parent, '空 白') }) };
}
const yaml = '.agents/skills/unharness-desktop-fixture/agents/openai.yaml';

test('desktop fixture changes only owned synthetic sources, restores exact baseline and cleans up', async t => {
  const { parent, fixture } = await setup(t);
  await writeFile(join(parent, 'sentinel'), 'do not change');
  const agents = await readFile(join(fixture.project, 'AGENTS.md'));
  const initial = await inspectDesktopFixture(fixture.fixture);
  assert.equal(initial.runtimeStateVerified, false);
  assert.equal(initial.modeSwitchingVerified, false);
  assert.equal(initial.settingsPrepared, true);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  assert.match(await readFile(join(fixture.project, yaml), 'utf8'), /allow_implicit_invocation: false/);
  await changeDesktopFixture(fixture.fixture, 'fixed-only');
  const override = await readFile(join(fixture.project, 'AGENTS.override.md'), 'utf8');
  assert.match(override, /UH_FIXED_/);
  assert.doesNotMatch(override, /UH_PROCEDURE_/);
  assert.deepEqual(await readFile(join(fixture.project, 'AGENTS.md')), agents);
  const restored = await changeDesktopFixture(fixture.fixture, 'baseline');
  assert.equal(restored.revision, 3);
  await assert.rejects(readFile(join(fixture.project, yaml)), { code: 'ENOENT' });
  await assert.rejects(readFile(join(fixture.project, 'AGENTS.override.md')), { code: 'ENOENT' });
  assert.deepEqual(await readFile(join(fixture.project, 'AGENTS.md')), agents);
  assert.equal((await cleanupDesktopFixture(fixture.fixture)).cleanup, 'ok');
  assert.deepEqual(await readdir(fixture.fixture), ['fixture.json']);
  assert.equal((await cleanupDesktopFixture(fixture.fixture)).cleanup, 'ok');
  assert.equal(await readFile(join(parent, 'sentinel'), 'utf8'), 'do not change');
});

test('duplicate fixture changes preserve revision and fresh-task boundary', async t => {
  const { fixture } = await setup(t);
  const first = await changeDesktopFixture(fixture.fixture, 'manual-only');
  const next = await changeDesktopFixture(fixture.fixture, 'manual-only');
  assert.equal(next.revision, first.revision);
  assert.equal(next.preparedAt, first.preparedAt);
});

test('independent edits and added files block change, restore and cleanup without overwrites', async t => {
  const { fixture } = await setup(t);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const path = join(fixture.project, yaml);
  await writeFile(path, 'independent edit');
  for (const operation of [() => changeDesktopFixture(fixture.fixture, 'fixed-only'),
    () => changeDesktopFixture(fixture.fixture, 'baseline'), () => cleanupDesktopFixture(fixture.fixture)]) {
    await assert.rejects(operation(), { kind: 'fixture-conflict' });
    assert.equal(await readFile(path, 'utf8'), 'independent edit');
  }
  await writeFile(path, 'policy:\n  allow_implicit_invocation: false\n');
  await writeFile(join(fixture.project, 'work.txt'), 'new work');
  await assert.rejects(cleanupDesktopFixture(fixture.fixture), { kind: 'fixture-conflict' });
  assert.equal(await readFile(join(fixture.project, 'work.txt'), 'utf8'), 'new work');
  assert.ok(await readFile(join(fixture.project, 'AGENTS.md')));
});

test('rejects symlinked fixture roots, parents, source files, and hard links', async t => {
  const { parent, fixture } = await setup(t);
  const alias = join(parent, 'alias');
  try { await symlink(fixture.fixture, alias, 'junction'); } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('symlink creation unavailable'); return; }
    throw error;
  }
  await assert.rejects(changeDesktopFixture(alias, 'manual-only'), { kind: 'fixture-link-or-type' });
  const source = join(fixture.project, 'AGENTS.md');
  const external = join(parent, 'external');
  await writeFile(external, 'external content');
  await unlink(source);
  await symlink(external, source);
  await assert.rejects(cleanupDesktopFixture(fixture.fixture), { kind: 'fixture-link-or-type' });
  await unlink(source);
  await link(external, source);
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'manual-only'), { kind: 'fixture-link-or-type' });
  assert.equal(await readFile(external, 'utf8'), 'external content');
});

test('manifest cannot redirect writes to another directory', async t => {
  const { parent, fixture } = await setup(t);
  const { state } = await readDesktopFixture(fixture.fixture);
  state.root = parent;
  await writeFile(join(fixture.fixture, 'fixture.json'), JSON.stringify(state));
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'manual-only'), { kind: 'invalid-fixture' });
});

test('write-ahead journal restores interrupted changes and survives a second interrupted recovery', async t => {
  const { fixture } = await setup(t);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'fixed-only', {
    afterWrite() { throw new Error('synthetic interruption'); },
  }), /synthetic interruption/);
  const pending = await inspectDesktopFixture(fixture.fixture);
  assert.equal(pending.settingsPrepared, false);
  assert.equal(pending.pending.to, 'fixed-only');
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'manual-only'), { kind: 'fixture-recovery-required' });
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'baseline', {
    afterWrite() { throw new Error('second interruption'); },
  }), /second interruption/);
  const restored = await recoverDesktopFixture(fixture.fixture);
  assert.equal(restored.condition, 'baseline');
  assert.equal(restored.pending, null);
});

test('concurrent operations are serialized and an active owner cannot be unlocked', async t => {
  const { fixture } = await setup(t);
  let release;
  let entered;
  const inside = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const first = changeDesktopFixture(fixture.fixture, 'manual-only', {
    async afterWrite() { entered(); await held; },
  });
  await inside;
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'fixed-only'), { kind: 'fixture-locked' });
  await assert.rejects(recoverDesktopFixture(fixture.fixture), { kind: 'fixture-locked' });
  release();
  await first;
});

test('a terminated owned CLI leaves a journal and can recover without the AI', async t => {
  const { fixture } = await setup(t);
  const moduleUrl = new URL('../src/codex/desktop-fixture.mjs', import.meta.url).href;
  const script = `import { changeDesktopFixture } from ${JSON.stringify(moduleUrl)};
    await changeDesktopFixture(process.argv[1], 'fixed-only', { afterWrite() { process.exit(19); } });`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, fixture.fixture], { timeout: 5000 });
  assert.equal(child.status, 19);
  assert.equal((await inspectDesktopFixture(fixture.fixture)).pending.to, 'fixed-only');
  assert.equal((await recoverDesktopFixture(fixture.fixture)).condition, 'baseline');
  assert.equal((await cleanupDesktopFixture(fixture.fixture)).cleanup, 'ok');
});

test('interrupted cleanup has a journal, recovers, and retains an idempotent completion receipt', async t => {
  const { fixture } = await setup(t);
  const moduleUrl = new URL('../src/codex/desktop-fixture.mjs', import.meta.url).href;
  const script = `import { cleanupDesktopFixture } from ${JSON.stringify(moduleUrl)};
    await cleanupDesktopFixture(process.argv[1], { afterDelete() { process.exit(19); } });`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, fixture.fixture], { timeout: 5000 });
  assert.equal(child.status, 19);
  assert.equal((await inspectDesktopFixture(fixture.fixture)).cleanup, 'pending');
  assert.equal((await recoverDesktopFixture(fixture.fixture)).cleanup, 'ok');
  assert.equal((await inspectDesktopFixture(fixture.fixture)).settingsPrepared, false);
  assert.equal((await cleanupDesktopFixture(fixture.fixture)).cleanup, 'ok');
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'baseline'), { kind: 'fixture-cleanup-required' });
});

test('concurrent recovery callers cannot remove another recovery caller lock', async t => {
  const { fixture } = await setup(t);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const results = await Promise.allSettled([recoverDesktopFixture(fixture.fixture), recoverDesktopFixture(fixture.fixture)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.kind, 'fixture-locked');
  assert.equal((await inspectDesktopFixture(fixture.fixture)).condition, 'baseline');
});

test('a terminated fixture creation can complete initialization from its journal', async t => {
  const { parent } = await setup(t);
  const moduleUrl = new URL('../src/codex/desktop-fixture.mjs', import.meta.url).href;
  const script = `import { createDesktopFixture } from ${JSON.stringify(moduleUrl)};
    await createDesktopFixture({ parent: process.argv[1], afterManifest(root) { process.stdout.write(root); process.exit(19); } });`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, parent], { timeout: 5000, encoding: 'utf8' });
  assert.equal(child.status, 19);
  const root = child.stdout;
  assert.equal((await inspectDesktopFixture(root)).settingsPrepared, false);
  assert.equal((await recoverDesktopFixture(root)).settingsPrepared, true);
  assert.equal((await cleanupDesktopFixture(root)).cleanup, 'ok');
});

test('observation rejects a fixture changed between inventory and state association', async t => {
  const { fixture } = await setup(t);
  await assert.rejects(snapshotDesktopFixture(fixture.fixture, {
    async afterInventory() {
      await assert.rejects(changeDesktopFixture(fixture.fixture, 'fixed-only', {
        afterWrite() { throw new Error('stop'); },
      }), /stop/);
    },
  }), { kind: 'fixture-changed' });
});

test('a killed recover can itself be recovered and retains the old guard identity', async t => {
  const { fixture } = await setup(t);
  await changeDesktopFixture(fixture.fixture, 'fixed-only');
  const moduleUrl = new URL('../src/codex/desktop-fixture.mjs', import.meta.url).href;
  const script = `import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.unlink;
    fs.unlink = async function(path) { const result = await original(path);
      if (String(path).endsWith('AGENTS.override.md')) process.exit(19); return result; };
    syncBuiltinESMExports();
    const { recoverDesktopFixture } = await import(${JSON.stringify(moduleUrl)});
    await recoverDesktopFixture(process.argv[1]);`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, fixture.fixture], { timeout: 5000 });
  assert.equal(child.status, 19);
  assert.equal((await recoverDesktopFixture(fixture.fixture)).condition, 'baseline');
  const retired = (await readdir(fixture.fixture)).filter(name => name.startsWith('.recovery-retired-'));
  assert.equal(retired.length, 1);
  assert.equal((await cleanupDesktopFixture(fixture.fixture)).cleanup, 'ok');
  assert.ok((await readdir(fixture.fixture)).includes(retired[0]));
});

test('recovery preserves independently edited pending journal stages', async t => {
  const { fixture } = await setup(t);
  const moduleUrl = new URL('../src/codex/desktop-fixture.mjs', import.meta.url).href;
  const script = `import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.rename;
    fs.rename = async function(from, to) {
      if (String(from).endsWith('state.json')) process.exit(19); return original(from, to); };
    syncBuiltinESMExports();
    const { changeDesktopFixture } = await import(${JSON.stringify(moduleUrl)});
    await changeDesktopFixture(process.argv[1], 'fixed-only');`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, fixture.fixture], { timeout: 5000 });
  assert.equal(child.status, 19);
  const path = join(fixture.fixture, '.lock', 'state.json');
  const original = await readFile(path, 'utf8');
  const edited = JSON.parse(original); edited.initializing = 'INDEPENDENT-NOTE';
  await writeFile(path, `${JSON.stringify(edited)}\n`);
  await assert.rejects(recoverDesktopFixture(fixture.fixture), { kind: 'fixture-conflict' });
  assert.match(await readFile(path, 'utf8'), /INDEPENDENT-NOTE/);
  await writeFile(path, original);
  assert.equal((await recoverDesktopFixture(fixture.fixture)).condition, 'baseline');
});

test('cleanup rechecks parents before removing directories after source deletion', async t => {
  const { parent, fixture } = await setup(t);
  const external = join(parent, 'external-tree');
  await mkdir(join(external, 'skills', 'unharness-desktop-fixture', 'agents'), { recursive: true });
  await assert.rejects(cleanupDesktopFixture(fixture.fixture, {
    async afterDelete(name) {
      if (!name.endsWith('SKILL.md')) return;
      await rename(join(fixture.project, '.agents'), join(parent, 'preserved-agents'));
      await symlink(external, join(fixture.project, '.agents'), 'junction');
    },
  }), { kind: 'fixture-link-or-type' });
  assert.deepEqual(await readdir(join(external, 'skills', 'unharness-desktop-fixture')), ['agents']);
});

test('an independent manifest edit during a change is not overwritten by the final journal commit', async t => {
  const { fixture } = await setup(t);
  const path = join(fixture.fixture, 'fixture.json');
  await assert.rejects(changeDesktopFixture(fixture.fixture, 'manual-only', {
    async afterWrite() { await writeFile(path, (await readFile(path, 'utf8')) + ' '); },
  }), { kind: 'fixture-conflict' });
  assert.ok((await readFile(path, 'utf8')).endsWith('\n '));
});

test('a killed exclusive file publication recovers its owned hard-link pair', async t => {
  const { fixture } = await setup(t);
  const moduleUrl = new URL('../src/codex/desktop-fixture.mjs', import.meta.url).href;
  const script = `import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    const original = fs.link;
    fs.link = async function(from, to) { await original(from, to); process.exit(19); };
    syncBuiltinESMExports();
    const { changeDesktopFixture } = await import(${JSON.stringify(moduleUrl)});
    await changeDesktopFixture(process.argv[1], 'fixed-only');`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, fixture.fixture], { timeout: 5000 });
  assert.equal(child.status, 19);
  assert.equal((await recoverDesktopFixture(fixture.fixture)).condition, 'baseline');
  await assert.rejects(readFile(join(fixture.project, 'AGENTS.override.md')), { code: 'ENOENT' });
});
