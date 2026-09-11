import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadRecord } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { registerLegacySourceProfile } from '../test-support/legacy-source-registration.mjs';
import { reviewDirectoryRebind, applyDirectoryRebind } from '../src/sources/directory-rebind.mjs';
import { inspectEnrollment, reviewEnrollment, applyEnrollment } from '../src/setup/enrollment.mjs';
import { addSetupSkill } from '../test-support/setup-profile.mjs';
const mac = { skip: process.platform !== 'darwin' };

async function fixture(t, disabled = false, legacyRevision) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-v3-')));
  t.after(async () => { setSourceTransactionTestHook(null); await rm(parent, { recursive: true, force: true }); });
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  if (disabled) {
    const config = join(owned.context.codexHome, 'config.toml'), path = join(owned.context.codexHome, 'skills/example/SKILL.md');
    await writeFile(config, await readFile(config, 'utf8') + `\n[[skills.config]]\npath = ${JSON.stringify(path)}\nenabled = false\n`);
    owned.originalFiles = await readSourceProfileFiles(owned.context);
  }
  const d = await sources.discoverUserSources(owned.context);
  const r = legacyRevision ? await registerLegacySourceProfile({ parent, context: owned.context, revision: legacyRevision })
    : await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
      instructionsOptional: true, selectedSkillIds: d.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  const w = await openWorkspace(r.workspace), current = await readSetup({ workspace: r.workspace, schemaVersion: 3 });
  const ids = w.reg.skills.map(s => s.id);
  const proposal = { schemaVersion: 3, scopeId: r.scopeId, normalId: r.normalId, inventoryId: current.inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Official fixture reference',
        checkedAt: '2026-09-11T00:00:00Z' }], rationale: 'Explicit synthetic v3 states' },
    roles: ids.map(sourceId => ({ sourceId, origin: 'self', reason: 'Owned synthetic Skill' })),
    trueform: { skillStates: ids.map(sourceId => ({ sourceId, state: disabled ? 'manual' : 'disabled' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: 'minimal', skillElevations: ids.map(sourceId => ({ sourceId, state: 'automatic' })), additionalPluginIds: [] } };
  return { ...owned, ...r, proposal, current };
}
const adopt = async s => applySetup({ workspace: s.workspace, reviewId: (await reviewSetup({ workspace: s.workspace, proposal: s.proposal })).reviewId });
async function prepare(s, mode) {
  const p = await sources.planUserMode({ workspace: s.workspace, mode });
  await sources.applyUserPlan({ workspace: s.workspace, planId: p.planId }); return p;
}

test('v3 ordinary enrollment keeps the contract and requires explicit states for the new Skill', mac, async t => {
  const s = await fixture(t); await adopt(s); await prepare(s, 'trueform');
  const n = await addSetupSkill(s), discovery = await inspectEnrollment({ workspace: s.workspace });
  assert.equal(discovery.enrollmentSchemaVersion, 3);
  const added = { sourceId: discovery.candidates.find(c => c.path === n.path).id, origin: 'external', reason: 'Owned optional test addition.' };
  const review = await reviewEnrollment({ workspace: s.workspace, discoveryId: discovery.discoveryId, additions: [added] });
  assert.equal(review.schemaVersion, 3);
  const before = await readSourceProfileFiles(s.context);
  await applyEnrollment({ workspace: s.workspace, reviewId: review.reviewId });
  const current = await readSetup({ workspace: s.workspace, schemaVersion: 3 });
  const w = await openWorkspace(s.workspace);
  assert.equal(w.manifestVersion, 3); assert.equal(w.state.setupSchemaVersion, 3);
  assert.equal(current.setupId, null); assert.equal(w.state.scopePreparationRequired, true);
  assert.deepEqual(await readSourceProfileFiles(s.context), before);
  assert.deepEqual(current.enrollment.roles, [...s.proposal.roles, added]);
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'setup-required' });
  s.proposal = { ...s.proposal, scopeId: current.scopeId, normalId: current.normalId, inventoryId: current.inventory.inventoryId,
    roles: [...s.proposal.roles, added], trueform: { ...s.proposal.trueform,
      skillStates: [...s.proposal.trueform.skillStates, { sourceId: added.sourceId, state: 'manual' }] } };
  await adopt(s); await prepare(s, 'trueform');
  assert.match(await readFile(join(n.path, '..', 'agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  await prepare(s, 'normal');
  assert.deepEqual(await readFile(n.path), n.bytes);
});

for (const phase of ['enrollment-journal', 'enrollment-state']) test('v3 ordinary enrollment cancels at ' + phase, mac, async t => {
  const s = await fixture(t); await adopt(s);
  const n = await addSetupSkill(s), discovery = await inspectEnrollment({ workspace: s.workspace });
  const review = await reviewEnrollment({ workspace: s.workspace, discoveryId: discovery.discoveryId, additions: [{
    sourceId: discovery.candidates.find(c => c.path === n.path).id, origin: 'self', reason: 'Owned optional fixture.' }] });
  const before = await openWorkspace(s.workspace), files = await readSourceProfileFiles(s.context);
  setSourceTransactionTestHook(p => { if (p === phase) throw Error('synthetic stop'); });
  await assert.rejects(applyEnrollment({ workspace: s.workspace, reviewId: review.reviewId }));
  setSourceTransactionTestHook(null);
  const out = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
  assert.equal(JSON.parse(out.stdout).status, 'enrollment-recording-cancelled');
  const after = await openWorkspace(s.workspace);
  assert.deepEqual(after.state, before.state); assert.deepEqual(after.manifest, before.manifest);
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
});

for (const disabled of [false, true]) test(`v3 saves and prepares explicit states from ${disabled ? 'disabled' : 'automatic'} Normal`, mac, async t => {
  const s = await fixture(t, disabled), before = await openWorkspace(s.workspace);
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Old Normal' });
  const old = await loadRecord(s.workspace, 'favorite', favorite.favoriteId);
  const setup = await adopt(s), after = await openWorkspace(s.workspace);
  assert.equal(after.manifestVersion, 3); assert.equal(after.state.setupSchemaVersion, 3);
  assert.equal(after.reg.normalId, before.reg.normalId); assert.equal(after.state.snapshotId, before.state.snapshotId);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', favorite.favoriteId), old);
  assert.equal((await applySetup({ workspace: s.workspace, reviewId: setup.reviewId })).duplicate, true);
  const saved = await readSetup({ workspace: s.workspace, schemaVersion: 3 });
  assert.equal(saved.review.schemaVersion, 3); assert.equal(saved.inventory.schemaVersion, 2);
  assert.equal(saved.review.presets.trueform.skillRelease, 'per-source-v3');
  const z = await prepare(s, 'trueform');
  assert.equal(z.skillStates[0].enabled, disabled); assert.equal(z.skillStates[0].manualOnly, disabled);
  assert.deepEqual(z.pluginStates, []);
  if (disabled) assert.match((await readSourceProfileFiles(s.context)).policy.text, /allow_implicit_invocation: false/);
  else assert.deepEqual((await readSourceProfileFiles(s.context)).policy, s.originalFiles.policy);
  const u = await prepare(s, 'unseal');
  assert.equal(u.skillStates[0].enabled, true); assert.equal(u.skillStates[0].manualOnly, false);
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await prepare(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('v3 rejects old forward definitions and explicit selectors while keeping frozen restore routes', mac, async t => {
  const s = await fixture(t), v2 = { ...s.proposal, schemaVersion: 2,
    inventoryId: (await readSetup({ workspace: s.workspace })).inventory.inventoryId,
    trueform: { retainedOfficialPluginIds: [] }, unseal: { instructions: 'minimal', additionalAutomaticSkillIds: [] } };
  const oldReview = await reviewSetup({ workspace: s.workspace, proposal: v2 });
  await applySetup({ workspace: s.workspace, reviewId: oldReview.reviewId });
  await prepare(s, 'trueform');
  const files = await readSourceProfileFiles(s.context);
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'v2 manual' });
  await adopt(s); await prepare(s, 'trueform');
  await assert.rejects(reviewSetup({ workspace: s.workspace, proposal: v2 }), { kind: 'setup-upgrade-required' });
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: oldReview.reviewId }), { kind: 'setup-upgrade-required' });
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform', selectedIds: [] }), { kind: 'setup-proposal-invalid' });
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
  assert.equal((await openWorkspace(s.workspace)).manifestVersion, 3);
});

for (const phase of ['setup-journal', 'setup-manifest', 'setup-state']) test(`v3 adoption at ${phase} cancels offline without touching sources`, mac, async t => {
  const s = await fixture(t), before = await openWorkspace(s.workspace);
  const review = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  setSourceTransactionTestHook(p => { if (p === phase) throw Error('synthetic stop'); });
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: review.reviewId })); setSourceTransactionTestHook(null);
  const out = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
  assert.equal(JSON.parse(out.stdout).status, 'setup-recording-cancelled');
  const after = await openWorkspace(s.workspace);
  assert.deepEqual(after.state, before.state); assert.deepEqual(after.manifest, before.manifest);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await applySetup({ workspace: s.workspace, reviewId: review.reviewId });
});

test('v3 cannot attach a new manifest to old state without its exact pending adoption', mac, async t => {
  const s = await fixture(t), w = await openWorkspace(s.workspace);
  await writeFile(join(s.workspace, 'registration.json'), JSON.stringify({ schemaVersion: 3, rootScopeId: w.rootScopeId }));
  await assert.rejects(openWorkspace(s.workspace), { kind: 'workspace-invalid' });
});

test('the actual preceding v2 writer opens its Normal but refuses v3 before source writes', mac, async t => {
  const s = await fixture(t, false, '7589c9a');
  assert.equal((await s.callLegacy('status', { workspace: s.workspace })).preparedMode, 'normal');
  await adopt(s);
  const before = await openWorkspace(s.workspace), files = await readSourceProfileFiles(s.context);
  for (const [action, extra] of [['status', {}], ['plan', { mode: 'normal' }], ['recover', {}]])
    await assert.rejects(s.callLegacy(action, { workspace: s.workspace, ...extra }), error => {
      assert.equal(JSON.parse(error.stderr).error.kind, 'workspace-invalid'); return true;
    });
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
});

test('directory reattestation cannot downgrade a v3 setup contract to v2', mac, async t => {
  const s = await fixture(t, false, 'ba64cebbdc2a17179b13a6281668f75fb35dc668');
  await adopt(s);
  const files = await readSourceProfileFiles(s.context);
  const review = await reviewDirectoryRebind({ workspace: s.workspace });
  await applyDirectoryRebind({ workspace: s.workspace, reviewId: review.reviewId, confirmedCurrentLocations: true });
  const w = await openWorkspace(s.workspace);
  assert.equal(w.manifestVersion, 3); assert.equal(w.state.setupSchemaVersion, 3);
  assert.equal(w.state.setupId, null); assert.equal(w.state.scopePreparationRequired, true);
  const v2 = { ...s.proposal, schemaVersion: 2, scopeId: w.scopeId,
    inventoryId: (await readSetup({ workspace: s.workspace, schemaVersion: 2 })).inventory.inventoryId,
    trueform: { retainedOfficialPluginIds: [] }, unseal: { instructions: 'minimal', additionalAutomaticSkillIds: [] } };
  await assert.rejects(reviewSetup({ workspace: s.workspace, proposal: v2 }), { kind: 'setup-upgrade-required' });
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
});

for (const phase of ['directory-rebind-journal', 'directory-rebind-manifest', 'directory-rebind-state'])
  test(`v3 directory reattestation at ${phase} cancels without lowering its contract`, mac, async t => {
    const s = await fixture(t, false, 'ba64cebbdc2a17179b13a6281668f75fb35dc668'); await adopt(s);
    const before = await openWorkspace(s.workspace), files = await readSourceProfileFiles(s.context);
    const review = await reviewDirectoryRebind({ workspace: s.workspace });
    setSourceTransactionTestHook(p => { if (p === phase) throw Error('synthetic stop'); });
    await assert.rejects(applyDirectoryRebind({ workspace: s.workspace, reviewId: review.reviewId, confirmedCurrentLocations: true }));
    setSourceTransactionTestHook(null);
    const out = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
    assert.equal(JSON.parse(out.stdout).status, 'directory-rebind-recording-cancelled');
    const after = await openWorkspace(s.workspace);
    assert.deepEqual(after.state, before.state); assert.deepEqual(after.manifest, before.manifest);
    assert.deepEqual(await readSourceProfileFiles(s.context), files);
  });
