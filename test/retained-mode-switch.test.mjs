import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setupProfile } from '../test-support/setup-profile.mjs';
import * as service from '../src/sources/service.mjs';
import { openWorkspace, loadSnapshot, loadRecord, saveSnapshot, record } from '../src/sources/records.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { equal } from '../src/sources/platform.mjs';
import { applicationFor } from '../src/apps/index.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';

const mac = { skip: process.platform !== 'darwin' };
async function prepare(s, mode) {
  const p = await service.planUserMode({ workspace: s.workspace, mode });
  return service.applyUserPlan({ workspace: s.workspace, planId: p.planId });
}
async function editShared(s, value = 'PRIVATE_CURRENT_SHARED') {
  const path = join(s.context.codexHome, 'config.toml');
  await writeFile(path, (await readFile(path, 'utf8')).replace(/^model = .*$/m, `model = "${value}"`));
}
async function fixture(t) {
  const s = await setupProfile(t);
  t.after(() => setSourceTransactionTestHook(null));
  await prepare(s, 'trueform');
  return s;
}

for (const mode of ['normal', 'unseal', 'trueform']) test(`mode ${mode} keeps shared edits without a separate acceptance`, mac, async t => {
  const s = await fixture(t);
  const favorite = await service.saveUserFavorite({ workspace: s.workspace, name: 'Original zero' });
  const frozenFavorite = await loadRecord(s.workspace, 'favorite', favorite.favoriteId);
  const w = await openWorkspace(s.workspace), originalNormal = await loadSnapshot(s.workspace, w.reg, w.state.normalId ?? w.reg.normalId);
  await editShared(s);
  const actual = await captureRegistered(w.reg);
  assert.equal((await service.userSourceState({ workspace: s.workspace })).modePlanningAvailable, true);
  const p = await service.planUserMode({ workspace: s.workspace, mode });
  assert.equal(p.retainedSettingsIncluded, true);
  assert.equal(p.revision, w.state.revision);
  assert.ok(!JSON.stringify(p).includes('PRIVATE_CURRENT_SHARED'));
  assert.deepEqual((await openWorkspace(s.workspace)).state, w.state, 'selection does not adopt shared settings or change mode');
  assert.deepEqual(await captureRegistered(w.reg), actual, 'planning never changes live files');
  const result = await service.applyUserPlan({ workspace: s.workspace, planId: p.planId });
  assert.equal(result.preparedMode, mode);
  assert.equal(result.revision, w.state.revision + 1, 'one completed mode operation');
  const state = await service.userSourceState({ workspace: s.workspace });
  assert.equal(state.conflict, null);
  assert.equal(state.preparedMode, mode);
  assert.notEqual(state.registration.activeNormalId, w.state.normalId ?? w.reg.normalId);
  assert.equal(state.verification.runtimeStateVerified, false);
  assert.equal(state.verification.modeSwitchingVerified, false);
  assert.deepEqual(await loadSnapshot(s.workspace, w.reg, w.state.normalId ?? w.reg.normalId), originalNormal);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', favorite.favoriteId), frozenFavorite);
  const cp = await loadRecord(s.workspace, 'checkpoint', result.checkpointId);
  assert.equal(cp.preparedMode, 'trueform');
  assert.deepEqual(await loadSnapshot(s.workspace, w.reg, cp.snapshotId), actual, 'undo keeps the actual shared settings');
  assert.equal((await service.applyUserPlan({ workspace: s.workspace, planId: p.planId })).duplicate, true);
  for (const next of ['normal', 'trueform', 'unseal']) {
    await prepare(s, next);
    assert.match(await readFile(join(s.context.codexHome, 'config.toml'), 'utf8'), /PRIVATE_CURRENT_SHARED/);
  }
});

test('a shared edit after mode review is never overwritten or silently re-reviewed', mac, async t => {
  const s = await fixture(t), w = await openWorkspace(s.workspace);
  await editShared(s);
  const p = await service.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await editShared(s, 'PRIVATE_NEWER_EDIT');
  const actual = await captureRegistered(w.reg);
  await assert.rejects(service.applyUserPlan({ workspace: s.workspace, planId: p.planId }), { kind: 'source-conflict' });
  assert.deepEqual(await captureRegistered(w.reg), actual);
  assert.deepEqual((await openWorkspace(s.workspace)).state, w.state);
  assert.equal((await service.userSourceState({ workspace: s.workspace })).recovery.pending, false);
});

test('independent instructions and selected Skill enablement still require review', mac, async t => {
  const s = await fixture(t), w = await openWorkspace(s.workspace);
  const config = join(s.context.codexHome, 'config.toml'), before = await readFile(config, 'utf8');
  await writeFile(config, before + `\n[[skills.config]]\npath = ${JSON.stringify(w.reg.skills[0].path)}\nenabled = false\n`);
  await assert.rejects(service.planUserMode({ workspace: s.workspace, mode: 'normal' }), { kind: 'config-transform-failed' });
  await writeFile(config, before);
  await editShared(s);
  await writeFile(join(s.context.codexHome, 'AGENTS.md'), 'PRIVATE independent instruction edit\n');
  const actual = await captureRegistered(w.reg);
  assert.equal((await service.userSourceState({ workspace: s.workspace })).modePlanningAvailable, false);
  await assert.rejects(service.planUserMode({ workspace: s.workspace, mode: 'normal' }), { kind: 'source-conflict' });
  assert.deepEqual(await captureRegistered(w.reg), actual);
  assert.deepEqual((await openWorkspace(s.workspace)).state, w.state);
});

test('a forged linked retained plan cannot redefine registered Skill state inside Normal', mac, async t => {
  const s = await fixture(t);
  await editShared(s);
  const reviewed = await service.planUserMode({ workspace: s.workspace, mode: 'normal' });
  const w = await openWorkspace(s.workspace), actual = await captureRegistered(w.reg);
  const original = await loadRecord(s.workspace, 'application', reviewed.planId);
  const retained = await loadRecord(s.workspace, 'application', original.retainedPlanId);
  const forged = await loadSnapshot(s.workspace, w.reg, original.normalId);
  forged.config.text += `\n[[skills.config]]\npath = ${JSON.stringify(w.reg.skills[0].path)}\nenabled = false\n`;
  const normalId = await saveSnapshot(s.workspace, w.reg, forged, 2);
  const retainedPlanId = await record(s.workspace, 'application', { ...retained, normalId });
  const before = await loadSnapshot(s.workspace, w.reg, original.beforeId);
  const planId = await record(s.workspace, 'application', {
    ...original, normalId, afterId: normalId, retainedPlanId,
    changedFiles: Object.keys(before).filter(id => !equal(before[id], forged[id]))
      .map(id => ({ id, label: applicationFor(w.reg.context).changedFileLabel(id) }))
  });
  await assert.rejects(service.applyUserPlan({ workspace: s.workspace, planId }), { kind: 'record-invalid' });
  assert.deepEqual(await captureRegistered(w.reg), actual);
  assert.deepEqual((await openWorkspace(s.workspace)).state, w.state);
});

for (const phase of ['journal', 'write-0', 'state']) test(`interrupted combined mode switch at ${phase} recovers the prior mode with current shared settings`, mac, async t => {
  const s = await fixture(t), w = await openWorkspace(s.workspace);
  await editShared(s);
  const actual = await captureRegistered(w.reg);
  const p = await service.planUserMode({ workspace: s.workspace, mode: 'normal' });
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('synthetic interruption'); });
  await assert.rejects(service.applyUserPlan({ workspace: s.workspace, planId: p.planId }), { kind: 'operation-failed' });
  setSourceTransactionTestHook(null);
  assert.equal((await service.userSourceState({ workspace: s.workspace })).recovery.pending, true);
  assert.equal((await service.recoverUserSources({ workspace: s.workspace })).status, 'restored');
  assert.deepEqual(await captureRegistered(w.reg), actual);
  const state = await service.userSourceState({ workspace: s.workspace });
  assert.equal(state.preparedMode, 'trueform');
  assert.equal(state.conflict, null);
  assert.equal(state.recovery.pending, false);
  assert.equal(state.observation, null);
  await assert.rejects(service.applyUserPlan({ workspace: s.workspace, planId: p.planId }), { kind: 'stale-plan' });
});
