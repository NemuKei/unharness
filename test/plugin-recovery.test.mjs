import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm, rename, lstat, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { configurePlugin } from '../src/setup/plugin-binding.mjs';
import { indexDistribution } from '../src/setup/distribution.mjs';
import { planUserMode, applyUserPlan, userSourceState } from '../src/sources/service.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

async function fixture(t) {
  const p = await aiProfile(t);
  const dataDirectory = join(p.parent, 'native-data'); await mkdir(dataDirectory);
  const bound = await configurePlugin({ dataDirectory, workspace: p.workspace });
  const root = join(p.parent, 'synthetic-package'); await mkdir(root);
  for (const path of ['bin', 'runtime/bin', 'skills/unharness', '.codex-plugin', 'dist', 'scripts', 'src/setup', 'src/core'])
    await mkdir(join(root, path), { recursive: true });
  const pkg = { name: 'unharness', version: '0.0.1', license: 'MIT' };
  for (const [path, content] of Object.entries({ 'plugin.json': JSON.stringify({ ...pkg,
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' }),
    '.codex-plugin/plugin.json': JSON.stringify(pkg), 'package.json': JSON.stringify(pkg), 'mcp.json': '{}',
    'LICENSE': 'Synthetic license', 'runtime/LICENSE': 'Synthetic runtime license',
    'runtime/bin/node': 'NOT AN EXECUTABLE RUNTIME', 'bin/unharness.mjs': '// synthetic',
    'src/setup/recovery-launch.mjs': '// synthetic bootstrap', 'src/setup/distribution.mjs': '// synthetic verifier',
    'src/core/strict-json.mjs': '// synthetic parser',
    'scripts/unharness': '# synthetic', 'dist/index.html': '<!doctype html><title>Fixture</title>',
    'skills/unharness/SKILL.md': 'Synthetic manager' })) await writeFile(join(root, path), content);
  const distribution = await indexDistribution(root, { platform: 'darwin-arm64', sourceRevision: null, sourceDirty: true });
  return { ...p, dataDirectory, bound, root, distribution };
}

test('versioned recovery survives native data and package removal, and reuses an intact copy', async t => {
  const { preparePluginRecovery, openRecoveryBinding } = await import('../src/setup/plugin-recovery.mjs');
  const p = await fixture(t), before = await readFile(join(p.workspace, 'state.json'));
  const installed = await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root });
  assert.equal(installed.distributionId, p.distribution.id);
  assert.ok(installed.commandPath.startsWith(p.bound.directory + '/recovery/'));
  assert.equal((await lstat(installed.commandPath)).mode & 0o777, 0o700);
  assert.deepEqual(await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root }), installed);
  await rm(p.dataDirectory, { recursive: true }); await rm(p.root, { recursive: true });
  const recovery = await openRecoveryBinding(installed.selection);
  const target = await recovery.read();
  assert.equal(target.workspace, p.workspace);
  assert.equal(target.rootScopeId, p.scopeId);
  assert.deepEqual(await readFile(join(p.workspace, 'state.json')), before);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('edited recovery files and replaced binding directories are preserved and refused', async t => {
  const { preparePluginRecovery, openRecoveryBinding } = await import('../src/setup/plugin-recovery.mjs');
  const p = await fixture(t);
  const installed = await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root });
  const command = await readFile(installed.commandPath);
  await writeFile(installed.commandPath, '# independent edit');
  await assert.rejects(openRecoveryBinding(installed.selection));
  await assert.rejects(preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root }));
  assert.equal(await readFile(installed.commandPath, 'utf8'), '# independent edit');
  await writeFile(installed.commandPath, command);
  const binding = await openRecoveryBinding(installed.selection);
  await rename(p.context.project, p.context.project + '-kept'); await mkdir(p.context.project);
  await assert.rejects(binding.read());
});

test('recovery controller permits only its reviewed Normal plan and rejects independent edits', async t => {
  const { preparePluginRecovery, openRecoveryBinding } = await import('../src/setup/plugin-recovery.mjs');
  const { createRecoveryController } = await import('../src/gui/recovery.mjs');
  const p = await fixture(t);
  const installed = await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root });
  const trueform = await planUserMode({ workspace: p.workspace, mode: 'trueform' });
  await applyUserPlan({ workspace: p.workspace, planId: trueform.planId });
  await rm(p.dataDirectory, { recursive: true }); await rm(p.root, { recursive: true });
  const controller = await createRecoveryController(await openRecoveryBinding(installed.selection));
  const state = await controller.state();
  assert.equal(state.metadata.kind, 'recovery');
  assert.equal(state.source.preparedMode, 'trueform');
  const { launchId, contextId } = state.metadata;
  const invoke = (action, input = {}) => controller.execute(action, { launchId, contextId, ...input });
  for (const [action, input] of [['discover', {}], ['register', {}], ['save', {}], ['plan', { mode: 'trueform' }],
    ['apply', { planId: trueform.planId }], ['apply-setup', { reviewId: 'a'.repeat(64) }]])
    await assert.rejects(invoke(action, input), { kind: 'gui-recovery-operation-forbidden' });
  const plan = await invoke('plan', { mode: 'normal' });
  const override = join(p.context.codexHome, 'AGENTS.override.md'), original = await readFile(override);
  await writeFile(override, '# An independent change');
  await assert.rejects(invoke('apply', { planId: plan.planId }), { kind: 'source-conflict' });
  assert.equal(await readFile(override, 'utf8'), '# An independent change');
  await writeFile(override, original);
  await invoke('apply', { planId: plan.planId });
  assert.equal((await controller.state()).source.preparedMode, 'normal');
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('recovery keeps retained edits through Normal and can cancel an interrupted recording', async t => {
  const { preparePluginRecovery, openRecoveryBinding } = await import('../src/setup/plugin-recovery.mjs');
  const { createRecoveryController } = await import('../src/gui/recovery.mjs');
  const p = await fixture(t);
  t.after(() => setSourceTransactionTestHook(null));
  const installed = await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root });
  const release = await planUserMode({ workspace: p.workspace, mode: 'trueform' });
  await applyUserPlan({ workspace: p.workspace, planId: release.planId });
  const controller = await createRecoveryController(await openRecoveryBinding(installed.selection));
  const { launchId, contextId } = await controller.metadata();
  const invoke = (action, input = {}) => controller.execute(action, { launchId, contextId, ...input });
  const configPath = join(p.context.codexHome, 'config.toml');
  const config = (await readFile(configPath, 'utf8')).replace(/^model = .*$/m, 'model = "OWNED_RETAINED_CHANGE"');
  await writeFile(configPath, config);
  assert.equal((await controller.state()).source.conflict.kind, 'source-conflict');
  const plan = await invoke('plan-retained'); assert.equal(plan.managedFilesChanged, 0);
  setSourceTransactionTestHook(phase => { if (phase === 'retained-journal') throw Error('owned interruption'); });
  await assert.rejects(invoke('accept-retained', { planId: plan.planId }));
  setSourceTransactionTestHook(null);
  assert.equal((await controller.state()).source.recovery.pending, true);
  const recovered = await invoke('recover'); assert.equal(recovered.status, 'retained-recording-cancelled');
  assert.equal(await readFile(configPath, 'utf8'), config);
  const reviewed = await invoke('plan-retained');
  await invoke('accept-retained', { planId: reviewed.planId });
  const normal = await invoke('plan', { mode: 'normal' }); await invoke('apply', { planId: normal.planId });
  const state = await userSourceState({ workspace: p.workspace });
  assert.equal(state.preparedMode, 'normal'); assert.equal(state.conflict, null);
  assert.equal(state.registration.normalId, p.normalId);
  assert.match(await readFile(configPath, 'utf8'), /OWNED_RETAINED_CHANGE/);
});

test('new package versions coexist with old recovery copies and interrupted unreferenced attempts', async t => {
  const { preparePluginRecovery, openRecoveryBinding } = await import('../src/setup/plugin-recovery.mjs');
  const p = await fixture(t);
  const first = await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root });
  const incomplete = join(p.bound.directory, 'recovery/copy-incomplete');
  await mkdir(incomplete, { mode: 0o700 }); await writeFile(join(incomplete, 'partial'), 'owned partial copy');
  for (const name of ['plugin.json', '.codex-plugin/plugin.json', 'package.json']) {
    const value = JSON.parse(await readFile(join(p.root, name), 'utf8')); value.version = '0.0.2';
    await writeFile(join(p.root, name), JSON.stringify(value));
  }
  await rm(join(p.root, 'distribution.json'));
  await indexDistribution(p.root, { platform: 'darwin-arm64', sourceRevision: null, sourceDirty: true });
  const second = await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root });
  assert.notEqual(second.root, first.root); assert.notEqual(second.distributionId, first.distributionId);
  assert.equal((await (await openRecoveryBinding(first.selection)).read()).recovery.version, '0.0.1');
  assert.equal((await (await openRecoveryBinding(second.selection)).read()).recovery.version, '0.0.2');
  assert.equal(await readFile(join(incomplete, 'partial'), 'utf8'), 'owned partial copy');
});

test('the saved command refuses a changed runtime or verifier before executing Node', async t => {
  const { preparePluginRecovery } = await import('../src/setup/plugin-recovery.mjs');
  for (const changed of ['runtime/bin/node', 'src/setup/recovery-launch.mjs', 'src/setup/distribution.mjs', 'src/core/strict-json.mjs']) {
    const p = await fixture(t);
    const installed = await preparePluginRecovery({ dataDirectory: p.dataDirectory, distributionRoot: p.root });
    const marker = join(p.parent, 'changed-runtime-executed'), path = join(installed.root, changed);
    await writeFile(path, '#!/bin/sh\n/usr/bin/touch ' + "'" + marker.replaceAll("'", "'\\''") + "'" + '\n');
    await chmod(path, 0o700);
    await assert.rejects(promisify(execFile)('/bin/sh', [installed.commandPath], { env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' } }),
      error => error.code === 1 && error.stderr.includes('recovery files do not match'));
    await assert.rejects(lstat(marker), { code: 'ENOENT' });
  }
});
