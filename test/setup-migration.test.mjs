import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace, readJson, loadSnapshot } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const setupService = await import('../src/setup/service.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const test = (name, fn) => nativeTest(name, { skip: process.platform !== 'darwin' }, fn);

async function fixture(t, { disabled = false } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-setup-test-')));
  t.after(async () => { setSourceTransactionTestHook(null); await rm(parent, { recursive: true, force: true }); });
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  if (disabled) {
    const path = join(owned.context.codexHome, 'config.toml');
    await writeFile(path, (await readFile(path, 'utf8')) + '\n[[skills.config]]\npath = '
      + JSON.stringify(join(owned.context.codexHome, 'skills', 'example', 'SKILL.md')) + '\nenabled = false\n');
    owned.originalFiles = await readSourceProfileFiles(owned.context);
  }
  const d = await sources.discoverUserSources(owned.context);
  const r = await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
    instructionsOptional: true, selectedSkillIds: d.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  const w = await openWorkspace(r.workspace);
  const proposal = { schemaVersion: 1, scopeId: r.scopeId, normalId: r.normalId,
    basis: { application: 'codex', modelId: 'gpt-6-astra', modelSource: 'user-specified', desktopVersion: null, runtimeVersion: '0.153.4',
      references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model', title: 'Official model guidance', checkedAt: '2026-09-09T00:00:00.000Z' }],
      rationale: 'A reviewed starting comparison condition; performance remains unknown.' },
    roles: w.reg.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Confirmed by the user for this synthetic fixture.' })),
    unseal: { instructions: 'minimal', automaticSkillIds: w.reg.skills.map(s => s.id) },
    trueform: { automaticExternalSkillIds: [] } };
  return { ...owned, ...r, proposal };
}
const switchMode = async (s, mode, rest = {}) => {
  const p = await sources.planUserMode({ workspace: s.workspace, mode, ...rest });
  await sources.applyUserPlan({ workspace: s.workspace, planId: p.planId });
  return p;
};
const adopt = async s => {
  const review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  return setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId });
};

test('setup adoption preserves Normal and current preparation; default release modes use frozen reviewed presets', async t => {
  const s = await fixture(t);
  const oldPlan = await switchMode(s, 'trueform');
  const oldFavorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Earlier disabled TRUEFORM' });
  const beforeFiles = await readSourceProfileFiles(s.context), before = await openWorkspace(s.workspace);
  const review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  assert.equal((await openWorkspace(s.workspace)).state.setupId, undefined);
  assert.deepEqual(await readSourceProfileFiles(s.context), beforeFiles);
  assert.equal(review.presets.trueform.skillStates[0].manualOnly, true);
  const applied = await setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId });
  assert.equal(applied.normalId, s.normalId);
  const after = await openWorkspace(s.workspace);
  assert.equal(after.reg.normalId, before.reg.normalId);
  assert.equal(after.state.snapshotId, before.state.snapshotId);
  assert.deepEqual(after.state.preparation, before.state.preparation);
  assert.deepEqual(await readSourceProfileFiles(s.context), beforeFiles);
  const duplicate = await setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, after.state);
  const normal = await loadSnapshot(s.workspace, after.reg, s.normalId);
  let plan = await switchMode(s, 'trueform');
  assert.equal(plan.setupId, applied.setupId);
  assert.equal(plan.skillStates[0].enabled, true);
  assert.equal(plan.skillStates[0].manualOnly, true);
  const actual = await readSourceProfileFiles(s.context);
  assert.match(actual.policy.text, /allow_implicit_invocation: false/);
  assert.equal(actual.config.text, normal.config.text);
  assert.equal(actual.override.text, '<!-- -->\n');
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Reviewed manual TRUEFORM' });
  plan = await switchMode(s, 'unseal');
  assert.equal(plan.skillStates.length, 0);
  assert.equal((await readSourceProfileFiles(s.context)).policy, null);
  await switchMode(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  plan = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: oldFavorite.favoriteId });
  assert.equal(plan.setupId, null);
  await sources.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), beforeFiles);
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).setup.preparedSetupId, null);
  assert.equal(oldPlan.setupId, null);
  plan = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  assert.equal(plan.setupId, applied.setupId);
  await sources.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), actual);
});

test('unknown roles and invented proposal targets cannot become adopted configuration', async t => {
  const s = await fixture(t), unknown = structuredClone(s.proposal);
  unknown.roles[0].origin = 'unknown';
  await assert.rejects(setupService.reviewSetup({ workspace: s.workspace, proposal: unknown }), { kind: 'setup-roles-unconfirmed' });
  await assert.rejects(setupService.applySetup({ workspace: s.workspace, proposal: s.proposal }), { kind: 'invalid-request' });
  await assert.rejects(setupService.reviewSetup({ workspace: s.workspace, proposal: { ...s.proposal, normalId: 'f'.repeat(64) } }), { kind: 'setup-proposal-invalid' });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal((await openWorkspace(s.workspace)).state.setupId, undefined);
});

test('a review refuses independent source and retained configuration edits without changing Normal', async t => {
  const s = await fixture(t), review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  const path = join(s.context.codexHome, 'config.toml'), original = await readFile(path, 'utf8');
  await writeFile(path, original + '\n[mcp_servers.new_control]\nurl = "https://example.com/mcp"\n');
  const edited = await readFile(path, 'utf8');
  await assert.rejects(setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId }), { kind: 'source-conflict' });
  assert.equal(await readFile(path, 'utf8'), edited);
  assert.equal((await openWorkspace(s.workspace)).state.setupId, undefined);
});

test('later mode preparations and later setup versions invalidate stale reviews and default mode plans', async t => {
  const s = await fixture(t), review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  await switchMode(s, 'unseal');
  await assert.rejects(setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId }), { kind: 'stale-plan' });
  const first = await adopt(s), plan = await sources.planUserMode({ workspace: s.workspace, mode: 'trueform' });
  s.proposal.unseal.instructions = 'none';
  const second = await adopt(s);
  assert.notEqual(first.setupId, second.setupId);
  await assert.rejects(sources.applyUserPlan({ workspace: s.workspace, planId: plan.planId }), { kind: 'stale-plan' });
  const p = await switchMode(s, 'unseal');
  assert.equal(p.guide, null);
  assert.equal((await readSourceProfileFiles(s.context)).override.text, '<!-- -->\n');
  const state = await setupService.readSetup({ workspace: s.workspace });
  assert.equal(state.setupId, second.setupId);
  assert.equal(state.proposal.basis.modelId, 'gpt-6-astra');
});

for (const phase of ['setup-journal', 'setup-state']) test(`interrupted ${phase} is cancelled through offline source recovery with files untouched`, async t => {
  const s = await fixture(t), before = (await openWorkspace(s.workspace)).state;
  const review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  setSourceTransactionTestHook(p => { if (p === phase) throw Error('synthetic stop'); });
  await assert.rejects(setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId }));
  setSourceTransactionTestHook(null);
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'recovery-required' });
  const recovered = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
  const result = JSON.parse(recovered.stdout);
  assert.equal(result.status, 'setup-recording-cancelled');
  assert.deepEqual((await openWorkspace(s.workspace)).state, before);
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal((await setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId })).duplicate, false);
});

test('setup recovery preserves an independent edit after an interrupted state publication', async t => {
  const s = await fixture(t), review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  setSourceTransactionTestHook(p => { if (p === 'setup-state') throw Error('synthetic stop'); });
  await assert.rejects(setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId }));
  setSourceTransactionTestHook(null);
  const path = join(s.context.codexHome, 'AGENTS.md');
  await writeFile(path, '# Independent user edit\n');
  await sources.recoverUserSources({ workspace: s.workspace });
  assert.equal(await readFile(path, 'utf8'), '# Independent user edit\n');
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).conflict.kind, 'source-conflict');
});

test('a corrupt setup journal cannot roll back a subsequent source state', async t => {
  const s = await fixture(t), review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  setSourceTransactionTestHook(p => { if (p === 'setup-state') throw Error('synthetic stop'); });
  await assert.rejects(setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId }));
  setSourceTransactionTestHook(null);
  const path = join(s.workspace, 'state.json'), changed = await readJson(path);
  changed.revision += 1;
  await writeFile(path, JSON.stringify(changed));
  await assert.rejects(sources.recoverUserSources({ workspace: s.workspace }), { kind: 'journal-invalid' });
  assert.deepEqual(await readJson(path), changed);
});

test('saved presets adapt only retained settings after a separately reviewed Normal update', async t => {
  const s = await fixture(t), adopted = await adopt(s);
  await switchMode(s, 'trueform');
  const path = join(s.context.codexHome, 'config.toml');
  await writeFile(path, (await readFile(path, 'utf8')).replace(/^model = .*$/m, 'model = "SYNTHETIC_NEXT_MODEL"'));
  const retainedPlan = await sources.planUserRetainedSettings({ workspace: s.workspace });
  await sources.acceptUserRetainedSettings({ workspace: s.workspace, planId: retainedPlan.planId });
  const p = await switchMode(s, 'unseal');
  assert.equal(p.setupId, adopted.setupId);
  assert.equal(p.adaptation.sourceType, 'setup');
  assert.match((await readSourceProfileFiles(s.context)).config.text, /SYNTHETIC_NEXT_MODEL/);
  await switchMode(s, 'normal');
  const files = await readSourceProfileFiles(s.context);
  assert.deepEqual(files.instructions, s.originalFiles.instructions);
  assert.equal(files.policy, null);
  assert.match(files.config.text, /SYNTHETIC_NEXT_MODEL/);
  assert.equal((await setupService.readSetup({ workspace: s.workspace })).proposal.basis.modelId, 'gpt-6-astra');
});

test('concurrent setup requests serialize through the source lock and duplicates cannot advance state twice', async t => {
  const s = await fixture(t), review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  const attempts = await Promise.allSettled(Array.from({ length: 2 }, () => setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId })));
  assert.ok(attempts.some(a => a.status === 'fulfilled'));
  for (const a of attempts) if (a.status === 'rejected') assert.equal(a.reason.kind, 'profile-busy');
  const state = (await openWorkspace(s.workspace)).state;
  assert.equal(state.revision, 1);
  assert.equal((await setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId })).duplicate, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, state);
});

test('reviewed automatic/manual choices never enable a Skill that was disabled in Normal', async t => {
  const s = await fixture(t, { disabled: true });
  await adopt(s);
  for (const mode of ['unseal', 'trueform', 'normal']) {
    const plan = await switchMode(s, mode);
    assert.ok(plan.skillStates.every(skill => skill.enabled === false && skill.manualOnly === false));
    const actual = await readSourceProfileFiles(s.context);
    assert.deepEqual(actual.config, s.originalFiles.config);
    assert.deepEqual(actual.policy, s.originalFiles.policy);
  }
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('changed native catalog identities and misreported runtime versions cannot be adopted', async t => {
  const s = await fixture(t), wrong = structuredClone(s.proposal);
  wrong.basis.runtimeVersion = '9.9.9';
  await assert.rejects(setupService.reviewSetup({ workspace: s.workspace, proposal: wrong }), { kind: 'stale-discovery' });
  const review = await setupService.reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  await writeFile(join(s.context.codexHome, 'catalog-override.json'), '[]');
  await assert.rejects(setupService.applySetup({ workspace: s.workspace, reviewId: review.reviewId }), { kind: 'stale-discovery' });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal((await openWorkspace(s.workspace)).state.setupId, undefined);
});
