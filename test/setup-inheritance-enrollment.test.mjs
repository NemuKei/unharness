import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setupProfile, addSetupSkill } from '../test-support/setup-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadSnapshot, loadRecord, readJson, record } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { inspectEnrollment, reviewEnrollment, applyEnrollment } from '../src/setup/enrollment.mjs';
const mac = { skip: process.platform !== 'darwin' };

async function fixture(t) {
  const s = await setupProfile(t);
  t.after(() => setSourceTransactionTestHook(null));
  const inventory = (await readSetup({ workspace: s.workspace })).inventory;
  s.proposal = { ...s.proposal, schemaVersion: 2, inventoryId: inventory.inventoryId,
    unseal: { instructions: 'minimal', additionalAutomaticSkillIds: s.proposal.roles.map(r => r.sourceId) },
    trueform: { retainedOfficialPluginIds: [] } };
  s.setup = await adopt(s, s.proposal);
  return s;
}
const adopt = async (s, proposal) => applySetup({ workspace: s.workspace,
  reviewId: (await reviewSetup({ workspace: s.workspace, proposal })).reviewId });
async function switchMode(s, mode) {
  const p = await sources.planUserMode({ workspace: s.workspace, mode });
  return sources.applyUserPlan({ workspace: s.workspace, planId: p.planId });
}
async function added(s, name) {
  const n = await addSetupSkill(s, name), d = await inspectEnrollment({ workspace: s.workspace });
  const candidate = d.candidates.find(c => c.path === n.path);
  assert.ok(candidate);
  return { ...n, discoveryId: d.discoveryId, addition: {
    sourceId: candidate.id, origin: 'self', reason: 'The fixture author confirmed this optional source.' } };
}
const reviewNew = (s, n) => reviewEnrollment({ workspace: s.workspace, discoveryId: n.discoveryId, additions: [n.addition] });
async function expandedProposal(s, n, includeNew = true) {
  const setup = await readSetup({ workspace: s.workspace });
  return { ...s.proposal, scopeId: setup.scopeId, normalId: setup.normalId, inventoryId: setup.inventory.inventoryId,
    roles: [...s.proposal.roles, n.addition], unseal: { ...s.proposal.unseal,
      additionalAutomaticSkillIds: [...s.proposal.unseal.additionalAutomaticSkillIds, ...(includeNew ? [n.addition.sourceId] : [])] } };
}
async function offlineRecovery(s, ...args) {
  const out = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace, ...args]);
  return JSON.parse(out.stdout);
}

test('v2 enrollment saves only registration and Normal; old setup, preparation and history never expand implicitly', mac, async t => {
  const s = await fixture(t), prepared = await switchMode(s, 'trueform');
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Earlier TRUEFORM' });
  const before = await openWorkspace(s.workspace), oldSetup = await readSetup({ workspace: s.workspace });
  const oldFavorite = await loadRecord(s.workspace, 'favorite', favorite.favoriteId);
  const originalNormal = await loadSnapshot(s.workspace, before.reg, before.reg.normalId);
  const manifest = await readFile(join(s.workspace, 'registration.json'));
  const reservation = await readFile(join(before.owner, 'reservation.json'));
  const n = await added(s), files = await readSourceProfileFiles(s.context), reviewed = await reviewNew(s, n);
  assert.equal(reviewed.schemaVersion, 2);
  assert.equal(reviewed.setupId, null);
  assert.equal(reviewed.setupRequired, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  const applied = await applyEnrollment({ workspace: s.workspace, reviewId: reviewed.reviewId });
  const current = await openWorkspace(s.workspace);
  assert.equal(applied.sourceFilesChanged, 0);
  assert.equal(current.state.setupId, null);
  assert.equal(current.state.setupSchemaVersion, 2);
  assert.equal(current.state.scopePreparationRequired, true);
  assert.equal(current.state.preparedMode, before.state.preparedMode);
  assert.equal(current.state.preparedSetupId, before.state.preparedSetupId);
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
  assert.deepEqual(await readFile(n.path), n.bytes);
  assert.deepEqual(await readFile(join(s.workspace, 'registration.json')), manifest);
  assert.deepEqual(await readFile(join(before.owner, 'reservation.json')), reservation);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', favorite.favoriteId), oldFavorite);
  const largerNormal = await loadSnapshot(s.workspace, current.reg, current.reg.normalId);
  for (const [key, value] of Object.entries(originalNormal)) assert.deepEqual(largerNormal[key], value);
  assert.deepEqual(await readSetup({ workspace: s.workspace }).then(r => r.enrollment.roles), [...s.proposal.roles, n.addition]);
  assert.deepEqual((await loadRecord(s.workspace, 'input', oldSetup.review.reviewId)).proposal, s.proposal);
  for (const mode of ['trueform', 'unseal']) await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode }), { kind: 'setup-required' });
  await assert.rejects(sources.observeUserTask({ workspace: s.workspace, taskId: randomUUID() }), { kind: 'source-preparation-required' });
  await assert.rejects(sources.saveUserFavorite({ workspace: s.workspace, name: 'Unprepared expansion' }), { kind: 'source-preparation-required' });
  assert.equal((await applyEnrollment({ workspace: s.workspace, reviewId: reviewed.reviewId })).duplicate, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, current.state);
  assert.equal((await offlineRecovery(s, favorite.favoriteId, prepared.checkpointId)).status, 'frozen-restores-passed');
  const restored = await openWorkspace(s.workspace);
  assert.equal(restored.state.setupId, null);
  assert.equal(restored.state.scopePreparationRequired, false);
  assert.deepEqual(await readFile(n.path), n.bytes);
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'setup-required' });
});

test('v2 registration, setup approval and preparation are three distinct operations', mac, async t => {
  const s = await fixture(t), n = await added(s), reviewed = await reviewNew(s, n);
  await applyEnrollment({ workspace: s.workspace, reviewId: reviewed.reviewId });
  const before = await openWorkspace(s.workspace), files = await readSourceProfileFiles(s.context);
  const second = await added(s, 'another-example');
  await assert.rejects(reviewNew(s, second), { kind: 'setup-required' });
  await assert.rejects(reviewSetup({ workspace: s.workspace, proposal: s.proposal }), { kind: 'setup-proposal-invalid' });
  const proposal = await expandedProposal(s, n), setup = await adopt(s, proposal);
  const current = await openWorkspace(s.workspace);
  assert.equal(current.state.setupId, setup.setupId);
  assert.equal(current.state.scopePreparationRequired, true);
  assert.deepEqual(current.state.preparation, before.state.preparation);
  assert.equal(current.state.snapshotId, before.state.snapshotId);
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
  await assert.rejects(sources.saveUserFavorite({ workspace: s.workspace, name: 'Saved but unprepared' }), { kind: 'source-preparation-required' });
  const saved = await readSetup({ workspace: s.workspace });
  assert.deepEqual(saved.review.inheritance.trueformAutomaticSkillIds, []);
  assert.deepEqual(saved.review.inheritance.unsealAutomaticSkillIds, [...proposal.unseal.additionalAutomaticSkillIds].sort());
  await switchMode(s, 'trueform');
  assert.equal((await openWorkspace(s.workspace)).state.scopePreparationRequired, false);
  assert.match(await readFile(join(n.path, '..', 'agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  await switchMode(s, 'unseal');
  await assert.rejects(readFile(join(n.path, '..', 'agents/openai.yaml')), { code: 'ENOENT' });
  await switchMode(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(await readFile(n.path), n.bytes);
});

test('two successive v2 registrations retain every earlier Normal and can restore the root favorite with Node only', mac, async t => {
  const s = await fixture(t), initial = await switchMode(s, 'trueform');
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Before both expansions' });
  const root = await openWorkspace(s.workspace), rootNormal = await loadSnapshot(s.workspace, root.reg, root.reg.normalId);
  const normalIds = [root.reg.normalId], addedSkills = [];
  for (const name of ['first-addition', 'second-addition']) {
    const n = await added(s, name); addedSkills.push(n);
    await applyEnrollment({ workspace: s.workspace, reviewId: (await reviewNew(s, n)).reviewId });
    s.proposal = await expandedProposal(s, n, false);
    s.setup = await adopt(s, s.proposal);
    const current = await openWorkspace(s.workspace); normalIds.push(current.reg.normalId);
    const normal = await loadSnapshot(s.workspace, current.reg, current.reg.normalId);
    for (const [key, value] of Object.entries(rootNormal)) assert.deepEqual(normal[key], value);
    await switchMode(s, 'unseal');
  }
  const expanded = await openWorkspace(s.workspace), saved = await readSetup({ workspace: s.workspace });
  assert.equal(new Set(normalIds).size, 3);
  assert.equal(expanded.registrations.length, 3);
  assert.equal(saved.proposal.roles.length, 3);
  assert.deepEqual(saved.review.inheritance.additionalSkillIds, root.reg.skills.map(x => x.id));
  assert.equal((await offlineRecovery(s, favorite.favoriteId, initial.checkpointId)).status, 'frozen-restores-passed');
  assert.equal((await openWorkspace(s.workspace)).state.setupId, s.setup.setupId);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  for (const n of addedSkills) {
    assert.deepEqual(await readFile(n.path), n.bytes);
    await assert.rejects(readFile(join(n.path, '..', 'agents/openai.yaml')), { code: 'ENOENT' });
  }
});

for (const initialPolicy of ['automatic', 'manual']) test(`a new ${initialPolicy} Skill omitted from additional choices stays manual in both release modes`, mac, async t => {
  const s = await fixture(t), n = await added(s);
  const policyPath = join(n.path, '..', 'agents/openai.yaml');
  const originalPolicy = 'policy:\n  allow_implicit_invocation: false\n';
  if (initialPolicy === 'manual') {
    await mkdir(join(policyPath, '..'), { recursive: true });
    await writeFile(policyPath, originalPolicy);
    const discovery = await inspectEnrollment({ workspace: s.workspace });
    n.discoveryId = discovery.discoveryId;
    n.addition.sourceId = discovery.candidates.find(c => c.path === n.path).id;
  }
  await applyEnrollment({ workspace: s.workspace, reviewId: (await reviewNew(s, n)).reviewId });
  await adopt(s, await expandedProposal(s, n, false));
  const setup = await readSetup({ workspace: s.workspace });
  assert.ok(!setup.review.inheritance.unsealAutomaticSkillIds.includes(n.addition.sourceId));
  for (const mode of ['trueform', 'unseal']) {
    await switchMode(s, mode);
    assert.match(await readFile(policyPath, 'utf8'), /allow_implicit_invocation: false/);
  }
  await switchMode(s, 'normal');
  if (initialPolicy === 'manual') assert.equal(await readFile(policyPath, 'utf8'), originalPolicy);
  else await assert.rejects(readFile(policyPath), { code: 'ENOENT' });
});

test('v2 enrollment refuses independent mode choices, injected provenance and stale inventories before changing state', mac, async t => {
  const s = await fixture(t), n = await added(s), before = await openWorkspace(s.workspace);
  for (const addition of [{ ...n.addition, unseal: 'automatic', trueform: 'manual' },
    { ...n.addition, eligibility: 'official-confirmed' }, { ...n.addition, path: n.path }, { ...n.addition, origin: 'unknown' }]) {
    await assert.rejects(reviewEnrollment({ workspace: s.workspace, discoveryId: n.discoveryId, additions: [addition] }), { kind: 'enrollment-proposal-invalid' });
  }
  const review = await reviewNew(s, n);
  await switchMode(s, 'normal');
  await assert.rejects(applyEnrollment({ workspace: s.workspace, reviewId: review.reviewId }), { kind: 'stale-plan' });
  await writeFile(n.path, '# Independently edited new Skill\n');
  await assert.rejects(reviewNew(s, n), { kind: 'stale-discovery' });
  assert.equal((await openWorkspace(s.workspace)).scopeId, before.scopeId);
  assert.equal(await readFile(n.path, 'utf8'), '# Independently edited new Skill\n');
});

for (const phase of ['enrollment-journal', 'enrollment-state']) test(`v2 ${phase} cancellation restores the old scope and setup offline, preserving independent files`, mac, async t => {
  const s = await fixture(t), n = await added(s), p = await reviewNew(s, n), before = await openWorkspace(s.workspace);
  const manifest = await readFile(join(s.workspace, 'registration.json'));
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('synthetic stop'); });
  await assert.rejects(applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId })); setSourceTransactionTestHook(null);
  await writeFile(n.path, '# Independent recovery-time edit\n');
  assert.equal((await offlineRecovery(s)).status, 'enrollment-recording-cancelled');
  const current = await openWorkspace(s.workspace);
  assert.deepEqual(current.state, before.state);
  assert.equal(current.scopeId, before.scopeId);
  assert.deepEqual(await readFile(join(s.workspace, 'registration.json')), manifest);
  assert.equal(await readFile(n.path, 'utf8'), '# Independent recovery-time edit\n');
});

for (const phase of ['setup-journal', 'setup-manifest', 'setup-state']) test(`v2 ${phase} cancellation keeps the expanded scope awaiting a new setup`, mac, async t => {
  const s = await fixture(t), n = await added(s), p = await reviewNew(s, n);
  await applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
  const before = await openWorkspace(s.workspace), review = await reviewSetup({ workspace: s.workspace, proposal: await expandedProposal(s, n) });
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('synthetic stop'); });
  await assert.rejects(applySetup({ workspace: s.workspace, reviewId: review.reviewId })); setSourceTransactionTestHook(null);
  assert.equal((await offlineRecovery(s)).status, 'setup-recording-cancelled');
  const current = await openWorkspace(s.workspace);
  assert.deepEqual(current.state, before.state);
  assert.equal(current.scopeId, p.nextScopeId);
  assert.equal(current.state.setupId, null);
  assert.equal(current.state.scopePreparationRequired, true);
});

test('v2 frozen registration cannot import a setup or overwrite independently edited journal/state records', mac, async t => {
  const s = await fixture(t), n = await added(s), p = await reviewNew(s, n), before = await openWorkspace(s.workspace);
  const stored = await loadRecord(s.workspace, 'input', p.reviewId);
  const forged = await record(s.workspace, 'input', { ...stored, setupId: s.setup.setupId });
  await assert.rejects(applyEnrollment({ workspace: s.workspace, reviewId: forged }), { kind: 'enrollment-record-invalid' });
  setSourceTransactionTestHook(async at => { if (at === 'enrollment-journal') {
    const journal = await readJson(join(s.workspace, 'pending.json'));
    await writeFile(join(s.workspace, 'pending.json'), JSON.stringify({ ...journal, independent: true }));
  } });
  await assert.rejects(applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId }), { kind: 'journal-invalid' });
  setSourceTransactionTestHook(null);
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  assert.equal((await readJson(join(s.workspace, 'pending.json'))).independent, true);
});
