// Controller-owned native qualification. All mutated paths belong to this run.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as service from '../src/sources/service.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadSnapshot, loadRecord } from '../src/sources/records.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';

const executable = process.argv[2];
if (!executable) process.exit(0); // Broad discovery is not native qualification.
const baselineCli = process.argv[3];
assert.ok(baselineCli, 'Explicit baseline CLI required for old-writer qualification');
const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-retained-native-')));
const rows = [];
try {
  for (const startingMode of ['normal', 'unseal', 'trueform']) {
    const owned = await createOwnedSourceProfile({ parent, executable });
    const d = await service.discoverUserSources(owned.context);
    const s = d.skills.find(x => x.eligible && x.label === 'example');
    assert.ok(s && ['normal', 'unseal', 'trueform'].every(mode => s.availability[mode]));
    const { workspace } = await service.registerUserSources({ context: owned.context, discoveryId: d.discoveryId, instructionsOptional: true, selectedSkillIds: [s.id], userAddedOptional: true });
    const legacyBefore = await readSourceProfileFiles(owned.context);
    const legacy = spawnSync(process.execPath, [baselineCli, 'sources', 'plan', '--json', JSON.stringify({ workspace, mode: 'normal' })], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    assert.equal(legacy.status, 0, 'Baseline CLI must successfully plan legacy Normal first');
    assert.equal(JSON.parse(legacy.stdout).preparedMode, 'normal');
    assert.deepEqual(await readSourceProfileFiles(owned.context), legacyBefore);
    const assertOldWriterFenced = async () => {
      const captured = await readSourceProfileFiles(owned.context);
      const old = spawnSync(process.execPath, [baselineCli, 'sources', 'plan', '--json', JSON.stringify({ workspace, mode: 'normal' })], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
      assert.equal(old.status, 1, 'Baseline writer must refuse a plan for the new snapshot format');
      assert.equal(JSON.parse(old.stderr).error.kind, 'record-invalid');
      assert.deepEqual(await readSourceProfileFiles(owned.context), captured);
    };
    const prepare = async mode => {
      const p = await service.planUserMode({ workspace, mode });
      const a = await service.applyUserPlan({ workspace, planId: p.planId });
      assert.equal(a.readback, 'matched');
      return a;
    };
    const favoriteIds = {};
    for (const mode of ['normal', 'unseal', 'trueform']) {
      await prepare(mode);
      favoriteIds[mode] = (await service.saveUserFavorite({ workspace, name: `Native saved ${mode}` })).favoriteId;
    }
    const starting = await prepare(startingMode);
    const original = await openWorkspace(workspace);
    const frozenFavorites = await Promise.all(Object.values(favoriteIds).map(id => loadRecord(workspace, 'favorite', id)));
    const oldNormal = await loadSnapshot(workspace, original.reg, original.reg.normalId);
    const config = join(owned.context.codexHome, 'config.toml');
    const currentText = await readFile(config, 'utf8');
    await writeFile(config, '# Independent retained setting\nservice_tier = "fast"\n' + currentText);
    const beforeAccept = await captureRegistered(original.reg);
    const ownedBeforeAccept = await readSourceProfileFiles(owned.context);
    assert.equal((await service.userSourceState({ workspace })).conflict.kind, 'source-conflict');
    const review = await service.planUserRetainedSettings({ workspace });
    assert.equal(review.managedFilesChanged, 0);
    const accepted = await service.acceptUserRetainedSettings({ workspace, planId: review.planId });
    assert.equal(accepted.recorded, true);
    assert.deepEqual(await captureRegistered(original.reg), beforeAccept);
    assert.deepEqual(await readSourceProfileFiles(owned.context), ownedBeforeAccept);
    await assertOldWriterFenced();
    assert.equal((await service.acceptUserRetainedSettings({ workspace, planId: review.planId })).duplicate, true);
    const active = await openWorkspace(workspace);
    assert.notEqual(active.state.normalId, original.reg.normalId);
    const activeNormal = await loadSnapshot(workspace, active.reg, active.state.normalId);
    assert.deepEqual(await loadSnapshot(workspace, active.reg, original.reg.normalId), oldNormal);
    for (const mode of ['normal', 'unseal', 'trueform', 'normal']) {
      await prepare(mode);
      assert.match(await readFile(config, 'utf8'), /^# Independent retained setting\nservice_tier = "fast"\n/);
      await assertOldWriterFenced();
    }
    assert.deepEqual(await captureRegistered(original.reg), activeNormal);
    for (const [mode, favoriteId] of Object.entries(favoriteIds)) {
      const p = await service.planUserFavorite({ workspace, favoriteId });
      assert.equal(p.adaptation.kind, 'retained-settings');
      assert.equal(p.adaptation.sourceId, favoriteId);
      await service.applyUserPlan({ workspace, planId: p.planId });
      assert.equal((await service.userSourceState({ workspace })).preparedMode, mode);
      assert.match(await readFile(config, 'utf8'), /service_tier = "fast"/);
      await assertOldWriterFenced();
    }
    const cp = await service.planUserCheckpoint({ workspace, checkpointId: starting.checkpointId });
    assert.equal(cp.adaptation.kind, 'retained-settings');
    await service.applyUserPlan({ workspace, planId: cp.planId });
    assert.match(await readFile(config, 'utf8'), /service_tier = "fast"/);
    await assertOldWriterFenced();
    assert.deepEqual(await Promise.all(Object.values(favoriteIds).map(id => loadRecord(workspace, 'favorite', id))), frozenFavorites);
    await prepare('normal');
    assert.deepEqual(await captureRegistered(original.reg), activeNormal);
    const final = await service.userSourceState({ workspace });
    assert.equal(final.conflict, null);
    assert.equal(final.recovery.pending, false);
    // Returning an owned retained value to its original bytes must not reopen
    // the old writer's ability to ignore future retained-setting versions.
    await writeFile(config, oldNormal.config.text);
    const back = await service.planUserRetainedSettings({ workspace });
    await service.acceptUserRetainedSettings({ workspace, planId: back.planId });
    await prepare('normal');
    await assertOldWriterFenced();
    assert.equal((await openWorkspace(workspace)).state.snapshotVersion, 2);
    assert.deepEqual(await captureRegistered(original.reg), oldNormal);
    rows.push({ startingMode, retainedEditAccepted: true, managedFilesUnchangedByAcceptance: true, allModePreparations: true, oldFavoritesPreserved: true, derivedFavoriteRestores: true, derivedCheckpointRestore: true, exactActiveNormal: true, finalConflict: false, baselineWriterFenced: true, originalByteReturnStillFenced: true });
  }
  console.log(JSON.stringify({ status: 'passed', cases: rows, ownedProfilesOnly: true, modelCalls: false, runtimeStateVerified: false, modeSwitchingVerified: false }));
} finally {
  await rm(parent, { recursive: true, force: true });
}
