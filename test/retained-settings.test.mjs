import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as service from '../src/sources/service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadSnapshot, loadRecord, readJson, writeJson, record } from '../src/sources/records.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const test = (name, fn) => nativeTest(name, { skip: process.platform !== 'darwin' }, fn);
async function setup(t, { absentConfig = false } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-retained-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const configPath = join(owned.context.codexHome, 'config.toml');
  if (absentConfig) await rm(configPath);
  const discovery = await service.discoverUserSources(owned.context);
  const registered = await service.registerUserSources({ context: owned.context, discoveryId: discovery.discoveryId, instructionsOptional: true, selectedSkillIds: discovery.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  return { ...owned, ...registered, root: parent, configPath, ...(await openWorkspace(registered.workspace)) };
}
async function prepare(s, mode) {
  const plan = await service.planUserMode({ workspace: s.workspace, mode });
  return service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
}
async function edit(s, model = 'PRIVATE_RETAINED_MODEL') {
  const text = await readFile(s.configPath, 'utf8');
  await writeFile(s.configPath, text.replace(/^model = .*$/m, `model = "${model}"`));
}
async function accept(s) {
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  return { plan: p, result: await service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId }) };
}
for (const mode of ['normal', 'unseal', 'trueform']) test(`retained acceptance in ${mode} changes no managed file and persists through every mode`, async t => {
  const s = await setup(t);
  if (mode !== 'normal') await prepare(s, mode);
  await edit(s);
  const before = await captureRegistered(s.reg);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  assert.equal(p.managedFilesChanged, 0);
  assert.equal(p.preparedMode, mode);
  assert.deepEqual(p.changedCategories, ['Codex settings']);
  assert.ok(!JSON.stringify(p).includes('PRIVATE_RETAINED_MODEL'));
  const result = await service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId });
  assert.deepEqual(await captureRegistered(s.reg), before);
  assert.equal(result.recorded, true);
  const state = await service.userSourceState({ workspace: s.workspace });
  assert.equal(state.conflict, null);
  assert.equal(state.registration.normalId, s.reg.normalId);
  assert.equal(state.registration.activeNormalId, p.normalId);
  const newNormal = await loadSnapshot(s.workspace, s.reg, p.normalId);
  for (const next of ['normal', 'unseal', 'trueform', 'normal']) {
    await prepare(s, next);
    assert.match(await readFile(s.configPath, 'utf8'), /PRIVATE_RETAINED_MODEL/);
  }
  assert.deepEqual(await captureRegistered(s.reg), newNormal);
});

test('old favorite/checkpoint contexts adapt explicitly; same-context restoration remains exact and all old records stay immutable', async t => {
  const s = await setup(t);
  await prepare(s, 'trueform');
  const f = await service.saveUserFavorite({ workspace: s.workspace, name: 'Old frozen mode' });
  const frozen = await loadRecord(s.workspace, 'favorite', f.favoriteId);
  const frozenFiles = await loadSnapshot(s.workspace, s.reg, frozen.snapshotId);
  const a = await prepare(s, 'normal');
  const cp = await loadRecord(s.workspace, 'checkpoint', a.checkpointId);
  await edit(s);
  const accepted = await accept(s);
  assert.equal((await service.listUserFavorites({ workspace: s.workspace })).favorites[0].needsAdaptation, true);
  for (const [type, id, fn] of [['favorite', f.favoriteId, service.planUserFavorite], ['checkpoint', a.checkpointId, service.planUserCheckpoint]]) {
    const p = await fn({ workspace: s.workspace, [type + 'Id']: id });
    assert.deepEqual(p.adaptation, { kind: 'retained-settings', sourceType: type, sourceId: id, previousNormalId: s.reg.normalId, normalId: accepted.plan.normalId });
    await service.applyUserPlan({ workspace: s.workspace, planId: p.planId });
    assert.match(await readFile(s.configPath, 'utf8'), /PRIVATE_RETAINED_MODEL/);
    assert.match(await readFile(s.configPath, 'utf8'), /enabled = false/);
  }
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', f.favoriteId), frozen);
  assert.deepEqual(await loadSnapshot(s.workspace, s.reg, frozen.snapshotId), frozenFiles);
  assert.deepEqual(await loadRecord(s.workspace, 'checkpoint', a.checkpointId), cp);
  assert.equal((await service.listUserFavorites({ workspace: s.workspace })).favorites.length, 1);
  const newer = await service.saveUserFavorite({ workspace: s.workspace, name: 'New frozen mode' });
  const exact = await captureRegistered(s.reg);
  await prepare(s, 'normal');
  const p = await service.planUserFavorite({ workspace: s.workspace, favoriteId: newer.favoriteId });
  assert.equal(p.adaptation, null);
  await service.applyUserPlan({ workspace: s.workspace, planId: p.planId });
  assert.deepEqual(await captureRegistered(s.reg), exact);
});

test('retained review and duplicate acceptance refuse stale, independently edited, selected and non-config changes', async t => {
  const s = await setup(t);
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'no-retained-change' });
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  await edit(s, 'SECOND_PRIVATE_MODEL');
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId }), { kind: 'source-conflict' });
  const accepted = await accept(s);
  const duplicate = await service.acceptUserRetainedSettings({ workspace: s.workspace, planId: accepted.plan.planId });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.revision, accepted.result.revision);
  await edit(s, 'THIRD_PRIVATE_MODEL');
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: accepted.plan.planId }), { kind: 'source-conflict' });
  await accept(s);
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: accepted.plan.planId }), { kind: 'stale-plan' });
  await writeFile(join(s.context.codexHome, 'AGENTS.md'), 'independent body edit');
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'source-conflict' });
});

test('review refuses changes to selected config and registered Skill policy', async t => {
  const s = await setup(t);
  await prepare(s, 'trueform');
  const current = await readFile(s.configPath, 'utf8');
  await writeFile(s.configPath, current.replace('enabled = false', 'enabled = true'));
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'config-transform-failed' });
  await writeFile(s.configPath, current);
  await prepare(s, 'unseal');
  await edit(s);
  await writeFile(join(s.context.codexHome, 'skills/example/agents/openai.yaml'), 'policy:\n  allow_implicit_invocation: true\n');
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'source-conflict' });
});

for (const phase of ['retained-journal', 'retained-state']) test(`interruption at ${phase} cancels only the private recording and invalidates observation`, async t => {
  const s = await setup(t);
  await prepare(s, 'unseal');
  await edit(s);
  const before = (await openWorkspace(s.workspace)).state;
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('interrupted'); });
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId }), { kind: 'operation-failed' });
  setSourceTransactionTestHook(null);
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'recovery-required' });
  await edit(s, 'INDEPENDENT_AFTER_INTERRUPTION');
  const captured = await captureRegistered(s.reg);
  const recovered = await service.recoverUserSources({ workspace: s.workspace });
  assert.equal(recovered.status, 'retained-recording-cancelled');
  const state = (await openWorkspace(s.workspace)).state;
  assert.equal(state.revision, before.revision);
  assert.equal(state.snapshotId, before.snapshotId);
  assert.equal(state.snapshotVersion, before.snapshotVersion);
  assert.deepEqual(state.ownedDirs, before.ownedDirs);
  assert.equal(state.lastCheckpointId, before.lastCheckpointId);
  assert.equal(state.lastObservationId, null);
  assert.notDeepEqual(state.preparation, before.preparation);
  assert.deepEqual(await captureRegistered(s.reg), captured);
  assert.equal((await service.userSourceState({ workspace: s.workspace })).conflict.kind, 'source-conflict');
});

test('snapshot fence rejects the actual baseline CLI across all restores and a return to registration bytes', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdir } = await import('node:fs/promises');
  const exec = promisify(execFile);
  const s = await setup(t);
  const baseline = join(s.root, 'baseline');
  await mkdir(baseline);
  const archive = join(s.root, 'baseline.tar');
  // Execute the immutable pre-feature writer, not a hand-written imitation.
  await exec('git', ['archive', '--format=tar', '--output', archive, '73a75fb', 'src', 'bin', 'package.json']);
  await exec('tar', ['-xf', archive, '-C', baseline]);
  const oldCli = async () => exec(process.execPath, [join(baseline, 'bin/unharness.mjs'), 'sources', 'plan', '--json', JSON.stringify({ workspace: s.workspace, mode: 'normal' })]);
  assert.equal(JSON.parse((await oldCli()).stdout).mode, 'normal');
  const f = await service.saveUserFavorite({ workspace: s.workspace, name: 'Baseline' });
  await edit(s);
  await accept(s);
  const assertFenced = async () => {
    const before = await captureRegistered(s.reg);
    await assert.rejects(oldCli(), e => e.code === 1 && JSON.parse(e.stderr).error.kind === 'record-invalid');
    assert.deepEqual(await captureRegistered(s.reg), before);
  };
  await assertFenced();
  for (const mode of ['unseal', 'trueform', 'normal']) { await prepare(s, mode); await assertFenced(); }
  const fp = await service.planUserFavorite({ workspace: s.workspace, favoriteId: f.favoriteId });
  const applied = await service.applyUserPlan({ workspace: s.workspace, planId: fp.planId });
  await assertFenced();
  const cp = await service.planUserCheckpoint({ workspace: s.workspace, checkpointId: applied.checkpointId });
  await service.applyUserPlan({ workspace: s.workspace, planId: cp.planId });
  await assertFenced();
  await edit(s, 'gpt-5');
  await accept(s);
  await prepare(s, 'normal');
  assert.deepEqual(await captureRegistered(s.reg), await loadSnapshot(s.workspace, s.reg, s.reg.normalId));
  await assertFenced();
});

test('fenced state rejects an older-format plan even with current revision and IDs', async t => {
  const s = await setup(t);
  await edit(s);
  await accept(s);
  const p = await service.planUserMode({ workspace: s.workspace, mode: 'normal' });
  const legacy = await loadRecord(s.workspace, 'application', p.planId);
  delete legacy.normalId;
  delete legacy.snapshotVersion;
  const planId = await record(s.workspace, 'application', legacy);
  const before = await captureRegistered(s.reg);
  await assert.rejects(service.applyUserPlan({ workspace: s.workspace, planId }), { kind: 'record-invalid' });
  assert.deepEqual(await captureRegistered(s.reg), before);
});

test('legacy favorites default to the registration Normal; a second accepted context keeps new favorites versioned', async t => {
  const s = await setup(t);
  const favoriteId = await record(s.workspace, 'favorite', { role: 'favorite', scopeId: s.scopeId, name: 'Legacy', snapshotId: s.reg.normalId, preparedMode: 'normal', revision: 0 });
  const p = await service.planUserFavorite({ workspace: s.workspace, favoriteId });
  assert.equal(p.adaptation, null);
  await edit(s);
  const first = await accept(s);
  const newFavorite = await service.saveUserFavorite({ workspace: s.workspace, name: 'First context' });
  await edit(s, 'SECOND_CONTEXT_MODEL');
  const second = await accept(s);
  assert.notEqual(first.plan.normalId, second.plan.normalId);
  const page = await service.listUserFavorites({ workspace: s.workspace });
  assert.ok(page.favorites.every(f => f.needsAdaptation));
  assert.equal(page.favorites.find(f => f.favoriteId === favoriteId).normalId, s.reg.normalId);
  assert.equal(page.favorites.find(f => f.favoriteId === newFavorite.favoriteId).normalId, first.plan.normalId);
  const restore = await service.planUserFavorite({ workspace: s.workspace, favoriteId: newFavorite.favoriteId });
  await service.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.match(await readFile(s.configPath, 'utf8'), /SECOND_CONTEXT_MODEL/);
});

test('acceptance preserves supported configuration metadata and absent/present transitions', async t => {
  const s = await setup(t, { absentConfig: true });
  await writeFile(s.configPath, 'model = "ADDED_PRIVATE_MODEL"\n', { mode: 0o640 });
  const first = await accept(s);
  const added = await captureRegistered(s.reg);
  assert.equal(added.config.meta.mode, 0o640);
  for (const mode of ['trueform', 'unseal', 'normal']) await prepare(s, mode);
  assert.deepEqual(await captureRegistered(s.reg), added);
  await chmod(s.configPath, 0o600);
  await accept(s);
  await prepare(s, 'trueform');
  assert.equal((await captureRegistered(s.reg)).config.meta.mode, 0o600);
  await prepare(s, 'normal');
  await rm(s.configPath);
  const absent = await captureRegistered(s.reg);
  await accept(s);
  for (const mode of ['trueform', 'normal']) await prepare(s, mode);
  assert.deepEqual(await captureRegistered(s.reg), absent);
  assert.notEqual((await openWorkspace(s.workspace)).state.normalId, first.plan.normalId);
});

test('acceptance clears observations, preserves checkpoints and owned directories, and exposes only safe CLI summaries', async t => {
  const { sourcesMain } = await import('../src/sources/cli.mjs');
  const s = await setup(t);
  await prepare(s, 'unseal');
  const prior = (await openWorkspace(s.workspace)).state;
  prior.lastObservationId = 'a'.repeat(64);
  await writeJson(join(s.workspace, 'state.json'), prior);
  await edit(s);
  const call = async (op, args) => {
    let out = '', err = '';
    const code = await sourcesMain(['sources', op, '--json', JSON.stringify(args)], { stdout: { write: v => out += v }, stderr: { write: v => err += v } });
    assert.equal(code, 0, err);
    assert.ok(!out.includes('PRIVATE_RETAINED_MODEL'));
    assert.ok(!out.includes(s.context.codexHome));
    return JSON.parse(out);
  };
  const p = await call('plan-retained', { workspace: s.workspace });
  const a = await call('accept-retained', { workspace: s.workspace, planId: p.planId });
  assert.equal(a.recorded, true);
  const state = (await openWorkspace(s.workspace)).state;
  assert.equal(state.lastObservationId, null);
  assert.equal(state.lastPlanId, null);
  assert.notDeepEqual(state.preparation, prior.preparation);
  assert.deepEqual(state.ownedDirs, prior.ownedDirs);
  assert.equal(state.lastCheckpointId, prior.lastCheckpointId);
});

test('record-only recovery preserves foreign state stages and rejects journals from a completed older operation', async t => {
  const s = await setup(t);
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  setSourceTransactionTestHook(at => { if (at === 'retained-state') throw Error('interrupted'); });
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId }));
  setSourceTransactionTestHook(null);
  const j = await readJson(join(s.workspace, 'pending.json'));
  const stage = join(s.workspace, 'state.json.next');
  await writeFile(stage, JSON.stringify({ foreign: true }));
  await assert.rejects(service.recoverUserSources({ workspace: s.workspace }), { kind: 'foreign-stage' });
  assert.deepEqual(JSON.parse(await readFile(stage, 'utf8')), { foreign: true });
  await rm(stage);
  await service.recoverUserSources({ workspace: s.workspace });
  await accept(s);
  await prepare(s, 'trueform');
  const before = await captureRegistered(s.reg);
  const state = await readJson(join(s.workspace, 'state.json'));
  await writeJson(join(s.workspace, 'pending.json'), j, true);
  await assert.rejects(service.recoverUserSources({ workspace: s.workspace }), { kind: 'journal-invalid' });
  assert.deepEqual(await readJson(join(s.workspace, 'state.json')), state);
  assert.deepEqual(await captureRegistered(s.reg), before);
});

test('frozen adapted favorite applies and recovers offline without native compiler, YAML or diff3', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const s = await setup(t);
  await prepare(s, 'trueform');
  const f = await service.saveUserFavorite({ workspace: s.workspace, name: 'Old trueform' });
  await prepare(s, 'normal');
  await edit(s);
  await accept(s);
  const p = await service.planUserFavorite({ workspace: s.workspace, favoriteId: f.favoriteId });
  const before = await captureRegistered(s.reg);
  const loader = join(s.root, 'offline-loader.mjs');
  await writeFile(loader, `export async function resolve(specifier, context, next) { if (/config-(?:editor|reconcile|native-profile)\\.mjs|catalog\\.mjs|yaml|diff3/.test(specifier)) throw Error('Offline compiler forbidden'); return next(specifier, context); }`);
  const serviceUrl = new URL('../src/sources/service.mjs', import.meta.url).href;
  const transactionUrl = new URL('../src/sources/transaction.mjs', import.meta.url).href;
  const code = `import * as service from ${JSON.stringify(serviceUrl)}; import { setSourceTransactionTestHook } from ${JSON.stringify(transactionUrl)}; setSourceTransactionTestHook(phase => { if (phase === 'state') throw Error('interrupt'); }); try { await service.applyUserPlan(${JSON.stringify({ workspace: s.workspace, planId: p.planId })}); } catch(e) { if(e.kind !== 'operation-failed') throw e; }`;
  await exec(process.execPath, ['--experimental-loader', loader, '--input-type=module', '-e', code]);
  const result = await exec(process.execPath, ['--experimental-loader', loader, resolve('bin/unharness.mjs'), 'sources', 'recover', '--json', JSON.stringify({ workspace: s.workspace })]);
  assert.equal(JSON.parse(result.stdout).status, 'restored');
  assert.deepEqual(await captureRegistered(s.reg), before);
  const state = (await openWorkspace(s.workspace)).state;
  assert.equal(state.snapshotVersion, 2);
  assert.equal(state.normalId, p.adaptation.normalId);
});

test('retained review rejects source-role changes and native version drift without publishing state', async t => {
  const s = await setup(t);
  await edit(s);
  await writeFile(join(s.context.codexHome, 'catalog-override.json'), JSON.stringify(s.reg.skills.map(skill => ({ name: skill.identity.name, path: skill.path, scope: 'system', pluginId: null, enabled: true }))));
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'stale-discovery' });
  await rm(join(s.context.codexHome, 'catalog-override.json'));
  const w = await openWorkspace(s.workspace);
  const replacement = { ...w.reg, version: '0.0.1' };
  const scopeId = await record(s.workspace, 'scope', replacement);
  await writeJson(join(s.workspace, 'registration.json'), { scopeId });
  const ownerFile = join(s.owner, 'reservation.json');
  await writeJson(ownerFile, { ...(await readJson(ownerFile)), scopeId });
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'stale-discovery' });
  assert.equal((await readJson(join(s.workspace, 'state.json'))).revision, 0);
});

test('active Normal state cannot use a legacy current snapshot to evade its fence', async t => {
  const s = await setup(t);
  await edit(s);
  await accept(s);
  const state = await readJson(join(s.workspace, 'state.json'));
  delete state.snapshotVersion;
  state.snapshotId = s.reg.normalId;
  await writeJson(join(s.workspace, 'state.json'), state);
  await assert.rejects(service.planUserMode({ workspace: s.workspace, mode: 'normal' }), { kind: 'workspace-invalid' });
});

test('retained acceptance rejects incomplete and cross-scope frozen plans before publishing private state', async t => {
  const s = await setup(t);
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  const original = await loadRecord(s.workspace, 'application', p.planId);
  for (const key of ['normalId', 'previousNormalId', 'observedId', 'beforeId']) {
    const invalid = { ...original };
    delete invalid[key];
    const planId = await record(s.workspace, 'application', invalid);
    await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId }), { kind: 'record-invalid' }, key);
    assert.equal((await readJson(join(s.workspace, 'state.json'))).revision, 0);
  }
  const planId = await record(s.workspace, 'application', { ...original, scopeId: 'b'.repeat(64) });
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId }), { kind: 'record-invalid' });
});

test('a live recording lock prevents concurrent acceptance and review; duplicate completes once', async t => {
  const s = await setup(t);
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  let reached, resume;
  const paused = new Promise(resolve => { reached = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  setSourceTransactionTestHook(async phase => { if (phase === 'retained-journal') { reached(); await gate; } });
  const first = service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId });
  await paused;
  try {
    await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId }), { kind: 'profile-busy' });
    await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'profile-busy' });
  } finally { resume(); }
  assert.equal((await first).duplicate, false);
  setSourceTransactionTestHook(null);
  const next = await service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId });
  assert.equal(next.duplicate, true);
  assert.equal(next.revision, 1);
});

test('an independent edit at the last acceptance boundary blocks publication and is left untouched by cancellation', async t => {
  const s = await setup(t);
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  setSourceTransactionTestHook(async phase => { if (phase === 'retained-journal') await edit(s, 'LATE_EXTERNAL_CHANGE'); });
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId }), { kind: 'source-conflict' });
  setSourceTransactionTestHook(null);
  assert.equal((await readJson(join(s.workspace, 'state.json'))).revision, 0);
  const before = await captureRegistered(s.reg);
  await service.recoverUserSources({ workspace: s.workspace });
  assert.deepEqual(await captureRegistered(s.reg), before);
});

test('retained review refuses unsupported metadata, final links and redirected registered parents', async t => {
  const { link, symlink, rename, mkdir } = await import('node:fs/promises');
  const s = await setup(t);
  await edit(s);
  await chmod(s.configPath, 0o4600);
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'unsupported-metadata' });
  await chmod(s.configPath, 0o600);
  const sibling = join(s.root, 'hardlink');
  await link(s.configPath, sibling);
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'unsupported-metadata' });
  await rm(sibling);
  const stored = join(s.root, 'outside-config');
  await rename(s.configPath, stored);
  await symlink(stored, s.configPath);
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'unsupported-metadata' });
  await rm(s.configPath);
  await rename(stored, s.configPath);
  await accept(s);
  await prepare(s, 'unseal');
  const parent = join(s.context.codexHome, 'skills/example/agents');
  await rename(parent, parent + '-old');
  await mkdir(parent);
  await writeFile(join(parent, 'openai.yaml'), await readFile(join(parent + '-old', 'openai.yaml')));
  await edit(s, 'NEW_MODEL');
  await assert.rejects(service.planUserRetainedSettings({ workspace: s.workspace }), { kind: 'source-redirection' });
});

test('retained acceptance and interrupted cancellation run without compiler modules and remove only a known private stage', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const s = await setup(t);
  await prepare(s, 'unseal');
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  const before = await captureRegistered(s.reg);
  const loader = join(s.root, 'retained-offline-loader.mjs');
  await writeFile(loader, `export async function resolve(specifier, context, next) { if (/config-(?:editor|reconcile|native-profile)\\.mjs|catalog\\.mjs|yaml|diff3/.test(specifier)) throw Error('Offline compiler forbidden'); return next(specifier, context); }`);
  const serviceUrl = new URL('../src/sources/service.mjs', import.meta.url).href;
  const transactionUrl = new URL('../src/sources/transaction.mjs', import.meta.url).href;
  const code = `import * as service from ${JSON.stringify(serviceUrl)}; import { setSourceTransactionTestHook } from ${JSON.stringify(transactionUrl)}; setSourceTransactionTestHook(phase => { if (phase === 'retained-state') throw Error('interrupt'); }); try { await service.acceptUserRetainedSettings(${JSON.stringify({ workspace: s.workspace, planId: p.planId })}); } catch(e) { if(e.kind !== 'operation-failed') throw e; }`;
  await exec(process.execPath, ['--experimental-loader', loader, '--input-type=module', '-e', code]);
  assert.deepEqual(await captureRegistered(s.reg), before);
  const journal = await readJson(join(s.workspace, 'pending.json'));
  await writeJson(join(s.workspace, 'state.json.next'), journal.afterState, true);
  const result = await exec(process.execPath, ['--experimental-loader', loader, resolve('bin/unharness.mjs'), 'sources', 'recover', '--json', JSON.stringify({ workspace: s.workspace })]);
  assert.equal(JSON.parse(result.stdout).status, 'retained-recording-cancelled');
  assert.deepEqual(await captureRegistered(s.reg), before);
  await assert.rejects(readFile(join(s.workspace, 'state.json.next')), { code: 'ENOENT' });
});

for (const type of ['favorite', 'checkpoint']) test(`retained edits reconcile after ${type} preparation and keep that selected source state`, async t => {
  const s = await setup(t);
  await prepare(s, 'unseal');
  const f = await service.saveUserFavorite({ workspace: s.workspace, name: 'Unseal' });
  const a = await prepare(s, 'normal');
  const p = type === 'favorite'
    ? await service.planUserFavorite({ workspace: s.workspace, favoriteId: f.favoriteId })
    : await service.planUserCheckpoint({ workspace: s.workspace, checkpointId: a.checkpointId });
  await service.applyUserPlan({ workspace: s.workspace, planId: p.planId });
  await edit(s);
  const before = await captureRegistered(s.reg);
  const accepted = await accept(s);
  assert.equal(accepted.result.preparedMode, 'unseal');
  assert.deepEqual(await captureRegistered(s.reg), before);
  await prepare(s, 'normal');
  assert.match(await readFile(s.configPath, 'utf8'), /PRIVATE_RETAINED_MODEL/);
});

test('unqualified Windows publication cannot leave an unrecoverable retained journal', async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  const s = await setup(t);
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  const url = new URL('../src/sources/service.mjs', import.meta.url).href;
  const code = `Object.defineProperty(process, 'platform', { value: 'win32' }); const service = await import(${JSON.stringify(url)}); try { await service.acceptUserRetainedSettings(${JSON.stringify({ workspace: s.workspace, planId: p.planId })}); console.log('unexpected acceptance'); } catch (e) { console.log(e.kind); }`;
  const { stdout } = await exec(process.execPath, ['--input-type=module', '-e', code]);
  assert.equal(stdout.trim(), 'unsupported-platform');
  await assert.rejects(readFile(join(s.workspace, 'pending.json')), { code: 'ENOENT' });
  assert.equal((await readJson(join(s.workspace, 'state.json'))).revision, 0);
});

test('acceptance rechecks the registered scope before committing and never replaces a different operation state', async t => {
  const s = await setup(t);
  await edit(s);
  const p = await service.planUserRetainedSettings({ workspace: s.workspace });
  const before = await readJson(join(s.workspace, 'state.json'));
  setSourceTransactionTestHook(async phase => {
    if (phase !== 'retained-journal') return;
    const scopeId = await record(s.workspace, 'scope', { ...s.reg, version: '0.0.1' });
    await writeJson(join(s.workspace, 'registration.json'), { scopeId });
    const path = join(s.owner, 'reservation.json');
    await writeJson(path, { ...(await readJson(path)), scopeId });
  });
  await assert.rejects(service.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId }), { kind: 'stale-plan' });
  setSourceTransactionTestHook(null);
  assert.deepEqual(await readJson(join(s.workspace, 'state.json')), before);
  await assert.rejects(service.recoverUserSources({ workspace: s.workspace }), { kind: 'journal-invalid' });
});
