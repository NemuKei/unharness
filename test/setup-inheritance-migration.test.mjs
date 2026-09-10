import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile, mkdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace, readJson, loadRecord, record, loadSnapshot } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { reviewSetup, applySetup, readSetup } from '../src/setup/service.mjs';
import { setupInventoryId } from '../src/setup/inventory.mjs';
const mac = { skip: process.platform !== 'darwin' };

async function fixture(t, manual = false) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-inheritance-test-')));
  t.after(async () => { setSourceTransactionTestHook(null); await rm(parent, { recursive: true, force: true }); });
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  if (manual) {
    const dir = join(owned.context.codexHome, 'skills/example/agents'); await mkdir(dir);
    await writeFile(join(dir, 'openai.yaml'), '# Preserved metadata\ninterface:\n  display_name: Example\npolicy:\n  allow_implicit_invocation: false # explicit only\n');
    owned.originalFiles = await readSourceProfileFiles(owned.context);
  }
  const d = await sources.discoverUserSources(owned.context);
  const r = await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
    instructionsOptional: true, selectedSkillIds: d.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  const w = await openWorkspace(r.workspace);
  const proposal = { schemaVersion: 2, scopeId: r.scopeId, normalId: r.normalId,
    inventoryId: (await readSetup({ workspace: r.workspace })).inventory?.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Official reference',
        checkedAt: '2026-09-10T00:00:00Z' }], rationale: 'Synthetic reviewed condition' },
    roles: w.reg.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Explicitly reviewed synthetic role' })),
    unseal: { instructions: 'minimal', additionalAutomaticSkillIds: w.reg.skills.map(s => s.id) },
    trueform: { retainedOfficialPluginIds: [] } };
  return { ...owned, ...r, proposal };
}
const adopt = async s => applySetup({ workspace: s.workspace,
  reviewId: (await reviewSetup({ workspace: s.workspace, proposal: s.proposal })).reviewId });
async function switchMode(s, mode) {
  const p = await sources.planUserMode({ workspace: s.workspace, mode });
  await sources.applyUserPlan({ workspace: s.workspace, planId: p.planId }); return p;
}

test('v2 adoption freezes the inventory and inheritance without changing Normal, old favorites or current preparation', mac, async t => {
  const s = await fixture(t);
  await switchMode(s, 'trueform');
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Legacy disabled condition' });
  const favoriteRecord = await loadRecord(s.workspace, 'favorite', favorite.favoriteId);
  const before = await openWorkspace(s.workspace), files = await readSourceProfileFiles(s.context);
  const applied = await adopt(s), after = await openWorkspace(s.workspace);
  assert.equal(after.state.snapshotId, before.state.snapshotId);
  assert.equal(after.reg.normalId, before.reg.normalId);
  assert.deepEqual(after.state.preparation, before.state.preparation);
  assert.equal(after.state.preparedMode, before.state.preparedMode);
  assert.equal(after.state.preparedSetupId, before.state.preparedSetupId);
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', favorite.favoriteId), favoriteRecord);
  assert.deepEqual(await readJson(join(s.workspace, 'registration.json')), { schemaVersion: 2, rootScopeId: before.rootScopeId });
  const saved = await readSetup({ workspace: s.workspace });
  assert.equal(saved.review.schemaVersion, 2);
  assert.deepEqual(saved.review.inheritance.trueformAutomaticSkillIds, []);
  assert.deepEqual(saved.review.inheritance.unsealAutomaticSkillIds, s.proposal.unseal.additionalAutomaticSkillIds);
  assert.equal((await applySetup({ workspace: s.workspace, reviewId: applied.reviewId })).duplicate, true);
  const p = await switchMode(s, 'trueform');
  assert.equal(p.setupId, applied.setupId);
  assert.match((await readSourceProfileFiles(s.context)).policy.text, /allow_implicit_invocation: false/);
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
  assert.equal((await openWorkspace(s.workspace)).manifestVersion, 2);
  await switchMode(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('a manual Normal can explicitly become automatic in UNSEAL and restores exact Normal metadata', mac, async t => {
  const s = await fixture(t, true), saved = await readSetup({ workspace: s.workspace });
  assert.equal(saved.inventory.skills[0].normalAutomatic, false);
  await adopt(s);
  const p = await switchMode(s, 'unseal');
  assert.equal(p.skillStates[0].manualOnly, false);
  assert.match((await readSourceProfileFiles(s.context)).policy.text, /allow_implicit_invocation: true/);
  await switchMode(s, 'trueform');
  assert.deepEqual((await readSourceProfileFiles(s.context)).policy, s.originalFiles.policy);
  await switchMode(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('v2 workspaces refuse new v1 adoption and explicit selector bypass while historical restores remain usable offline', mac, async t => {
  const s = await fixture(t), p = structuredClone(s.proposal);
  p.schemaVersion = 1; delete p.inventoryId;
  p.unseal = { instructions: 'minimal', automaticSkillIds: [] }; p.trueform = { automaticExternalSkillIds: [] };
  const oldReview = await reviewSetup({ workspace: s.workspace, proposal: p });
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Original Normal' });
  const checkpoint = (await switchMode(s, 'unseal')).checkpointId;
  await adopt(s);
  await assert.rejects(reviewSetup({ workspace: s.workspace, proposal: p }), { kind: 'setup-upgrade-required' });
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: oldReview.reviewId }), { kind: 'setup-upgrade-required' });
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform', selectedIds: [] }), { kind: 'setup-proposal-invalid' });
  const state = await openWorkspace(s.workspace);
  const result = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'),
    s.workspace, favorite.favoriteId, state.state.lastCheckpointId ?? checkpoint]);
  assert.equal(JSON.parse(result.stdout).status, 'frozen-restores-passed');
});

test('v2 release defaults cannot fall back to a missing or legacy setup pointer', mac, async t => {
  const s = await fixture(t), p = structuredClone(s.proposal);
  p.schemaVersion = 1; delete p.inventoryId;
  p.unseal = { instructions: 'minimal', automaticSkillIds: [] }; p.trueform = { automaticExternalSkillIds: [] };
  const old = await applySetup({ workspace: s.workspace, reviewId: (await reviewSetup({ workspace: s.workspace, proposal: p })).reviewId });
  await adopt(s);
  const w = await openWorkspace(s.workspace), path = join(s.workspace, 'state.json');
  await writeFile(path, JSON.stringify({ ...w.state, setupId: old.setupId }));
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'setup-upgrade-required' });
  await writeFile(path, JSON.stringify({ ...w.state, setupId: null }));
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'setup-required' });
  await switchMode(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

for (const phase of ['setup-journal', 'setup-manifest', 'setup-state']) test(`v2 interruption at ${phase} restores both records without native or YAML dependencies`, mac, async t => {
  const s = await fixture(t), before = await openWorkspace(s.workspace);
  const manifest = await readJson(join(s.workspace, 'registration.json'));
  const review = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  setSourceTransactionTestHook(p => { if (p === phase) throw Error('synthetic stop'); });
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: review.reviewId })); setSourceTransactionTestHook(null);
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'normal' }), { kind: 'recovery-required' });
  const out = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
  assert.equal(JSON.parse(out.stdout).status, 'setup-recording-cancelled');
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  assert.deepEqual(await readJson(join(s.workspace, 'registration.json')), manifest);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  await assert.rejects(lstat(join(s.workspace, 'pending.json')), { code: 'ENOENT' });
  assert.equal((await applySetup({ workspace: s.workspace, reviewId: review.reviewId })).adopted, true);
});

test('v2 adoption rejects stale inventories and foreign staged records without overwriting independent data', mac, async t => {
  const s = await fixture(t);
  await assert.rejects(reviewSetup({ workspace: s.workspace, proposal: { ...s.proposal, inventoryId: 'f'.repeat(64) } }), { kind: 'stale-discovery' });
  const review = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  setSourceTransactionTestHook(p => { if (p === 'setup-journal') throw Error('synthetic stop'); });
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: review.reviewId })); setSourceTransactionTestHook(null);
  const path = join(s.workspace, 'registration.json.next'); await writeFile(path, JSON.stringify({ unrelated: 'independent' }));
  await assert.rejects(sources.recoverUserSources({ workspace: s.workspace }), { kind: 'foreign-stage' });
  assert.equal(await readFile(path, 'utf8'), JSON.stringify({ unrelated: 'independent' }));
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('independent state edits between the manifest and state publications are not overwritten', mac, async t => {
  const s = await fixture(t), review = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  const path = join(s.workspace, 'state.json');
  let edited;
  setSourceTransactionTestHook(async phase => {
    if (phase === 'setup-manifest') {
      edited = { ...await readJson(path), revision: 73 };
      await writeFile(path, JSON.stringify(edited));
    }
  });
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: review.reviewId }), { kind: 'stale-plan' });
  setSourceTransactionTestHook(null);
  assert.deepEqual(await readJson(path), edited);
  await assert.rejects(sources.recoverUserSources({ workspace: s.workspace }), { kind: 'journal-invalid' });
  assert.deepEqual(await readJson(path), edited);
});

test('rewriting a frozen inherited set under a new record ID still fails readback validation', mac, async t => {
  const s = await fixture(t), review = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  const payload = await loadRecord(s.workspace, 'input', review.reviewId);
  payload.presets.trueform.automaticSkillIds = s.proposal.unseal.additionalAutomaticSkillIds;
  const altered = await record(s.workspace, 'input', payload);
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: altered }), { kind: 'setup-record-invalid' });
  assert.equal((await openWorkspace(s.workspace)).state.setupId, undefined);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

for (const target of ['snapshotId', 'guide']) test(`a rehashed v2 review cannot misdescribe its frozen ${target}`, mac, async t => {
  const s = await fixture(t), review = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  const payload = await loadRecord(s.workspace, 'input', review.reviewId);
  payload.presets.trueform[target] = target === 'snapshotId' ? s.normalId : { id: 'invented-guide' };
  const reviewId = await record(s.workspace, 'input', payload);
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId }), { kind: 'setup-record-invalid' });
  // A locally rewritten application pointer must not turn that malformed
  // stored snapshot into a forward release plan either.
  const setupId = await record(s.workspace, 'application', { role: 'release-setup', schemaVersion: 2, scopeId: s.scopeId, reviewId });
  const state = (await openWorkspace(s.workspace)).state;
  await writeFile(join(s.workspace, 'state.json'), JSON.stringify({ ...state, setupId }));
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'setup-record-invalid' });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('forward planning rechecks frozen invocation capability facts against the registered Normal', mac, async t => {
  const s = await fixture(t, true), review = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  const payload = await loadRecord(s.workspace, 'input', review.reviewId);
  payload.inventory.skills[0].normalAutomatic = true;
  const { inventoryId: oldId, ...data } = payload.inventory;
  payload.inventory.inventoryId = setupInventoryId(data);
  payload.proposal.inventoryId = payload.inventory.inventoryId;
  const reviewId = await record(s.workspace, 'input', payload);
  const setupId = await record(s.workspace, 'application', { role: 'release-setup', schemaVersion: 2, scopeId: s.scopeId, reviewId });
  const state = (await openWorkspace(s.workspace)).state;
  await writeFile(join(s.workspace, 'state.json'), JSON.stringify({ ...state, setupId }));
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'unseal' }), { kind: 'setup-record-invalid' });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('a retained-only Normal update does not replace the earlier frozen mode inventory', mac, async t => {
  const s = await fixture(t); await adopt(s);
  const saved = await readSetup({ workspace: s.workspace });
  await switchMode(s, 'trueform');
  const path = join(s.context.codexHome, 'config.toml');
  await writeFile(path, (await readFile(path, 'utf8')).replace('model = "gpt-5"', 'model = "synthetic-next"'));
  const p = await sources.planUserRetainedSettings({ workspace: s.workspace });
  await sources.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId });
  const next = await readSetup({ workspace: s.workspace });
  assert.equal(next.review.inventoryId, saved.review.inventoryId);
  assert.notEqual(next.inventory.inventoryId, saved.inventory.inventoryId);
  await switchMode(s, 'unseal');
  assert.match((await readSourceProfileFiles(s.context)).config.text, /synthetic-next/);
  await switchMode(s, 'normal');
  assert.equal((await readSourceProfileFiles(s.context)).policy, null);
  assert.deepEqual((await readSourceProfileFiles(s.context)).skill, s.originalFiles.skill);
});
