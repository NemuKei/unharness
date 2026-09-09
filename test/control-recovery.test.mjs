import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadSnapshot, saveSnapshot, record, writeJson } from '../src/sources/records.mjs';
import * as service from '../src/sources/service.mjs';

const test = (name, fn) => nativeTest(name, { skip: process.platform !== 'darwin' }, fn);
async function legacy(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-old-controls-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const d = await service.discoverUserSources(owned.context);
  const registered = await service.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
    instructionsOptional: true, selectedSkillIds: d.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  const w = await openWorkspace(registered.workspace), before = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
  // A valid pre-protection frozen snapshot. The current compiler never emits it.
  const after = structuredClone(before);
  after.config.text += `\n[[skills.config]]\npath = ${JSON.stringify(resolve('skills/unharness/SKILL.md'))}\nenabled = false\n`;
  const afterId = await saveSnapshot(w.workspace, w.reg, after);
  const common = { normalId: w.reg.normalId, scopeId: w.scopeId, revision: w.state.revision };
  const plan = { ...common, role: 'plan', mode: 'favorite', preparedMode: 'trueform', selectedIds: [],
    beforeId: w.state.snapshotId, afterId, changedFiles: [] };
  const planId = await record(w.workspace, 'application', plan);
  const favoriteId = await record(w.workspace, 'favorite', { ...common, role: 'favorite', name: 'Old disabled manager', snapshotId: afterId, preparedMode: 'trueform' });
  return { w, before, after, planId, favoriteId, configPath: join(owned.context.codexHome, 'config.toml'), common };
}

test('legacy favorite and stored-plan publication cannot disable unregistered management', async t => {
  const { w, before, planId, favoriteId, configPath } = await legacy(t);
  await assert.rejects(service.applyUserPlan({ workspace: w.workspace, planId }), { kind: 'setup-required-control' });
  await assert.rejects(service.planUserFavorite({ workspace: w.workspace, favoriteId }), { kind: 'setup-required-control' });
  assert.equal(await readFile(configPath, 'utf8'), before.config.text);
  await assert.rejects(readFile(join(w.workspace, 'pending.json')), { code: 'ENOENT' });
});

test('offline recovery can undo a valid pre-protection interruption that new writes reject', async t => {
  const { w, before, after, planId, configPath, common } = await legacy(t);
  const checkpointId = await record(w.workspace, 'checkpoint', { ...common, role: 'checkpoint',
    snapshotId: w.state.snapshotId, preparedMode: w.state.preparedMode });
  await writeJson(join(w.workspace, 'pending.json'), { kind: 'unharness-user-source-pending',
    scopeId: w.scopeId, planId, checkpointId, nonce: 'e'.repeat(32), keys: ['config'], dirs: [], beforeState: w.state }, true);
  await writeFile(configPath, after.config.text);
  const result = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), w.workspace]);
  assert.equal(JSON.parse(result.stdout).status, 'restored');
  assert.equal(await readFile(configPath, 'utf8'), before.config.text);
  await assert.rejects(readFile(join(w.workspace, 'pending.json')), { code: 'ENOENT' });
});

test('frozen favorites in native TOML forms restore exactly without native dependencies', async t => {
  const { w, before, configPath, common } = await legacy(t);
  const path = w.reg.skills[0].path;
  for (const text of [
    `skills.config = [{path = ${JSON.stringify(path)}, enabled = false}]\n`,
    `[skills]\nconfig = [{path = ${JSON.stringify(path)}, enabled = false}]\n`,
    `[[skills.config]]\npath = """${path}"""\nenabled = false\n`,
    `[[skills.config]]\npath = '''${path}'''\nenabled = false\n`,
  ]) {
    const files = structuredClone(before);
    files.config.text = before.config.text.replace('[memories]', text + '\n[memories]');
    // Keep root settings at the root and retain the following memory table.
    const snapshotId = await saveSnapshot(w.workspace, w.reg, files);
    const favoriteId = await record(w.workspace, 'favorite', { ...common, role: 'favorite', name: 'Frozen TOML form', snapshotId, preparedMode: 'trueform' });
    const plan = await service.planUserFavorite({ workspace: w.workspace, favoriteId });
    const applied = await service.applyUserPlan({ workspace: w.workspace, planId: plan.planId });
    assert.equal(await readFile(configPath, 'utf8'), files.config.text);
    const result = await promisify(execFile)(process.execPath,
      [resolve('test-support/user-source-node-only-recovery.mjs'), w.workspace, favoriteId, applied.checkpointId]);
    assert.equal(JSON.parse(result.stdout).status, 'frozen-restores-passed');
    assert.equal(await readFile(configPath, 'utf8'), before.config.text);
  }
});
