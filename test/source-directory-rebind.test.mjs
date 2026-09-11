import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { openWorkspace, loadNormal, loadRecord, readJson, record, writeJson, scopeWorkspace } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { registerLegacySourceProfile } from '../test-support/legacy-source-registration.mjs';

const test = (name, fn) => nativeTest(name, { skip: process.platform !== 'darwin' }, fn);
const execute = promisify(execFile);
const legacyRevision = 'ba64cebbdc2a17179b13a6281668f75fb35dc668';

async function fixture(t, { unseal = true, retained = true, retainedBaseline = false } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-rebind-test-')));
  t.after(async () => { setSourceTransactionTestHook(null); await rm(parent, { recursive: true, force: true }); });
  const profile = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const registered = await registerLegacySourceProfile({ parent, context: profile.context,
    revision: legacyRevision, directoryDeviceOffset: 17 });
  const favorite = await registered.callLegacy('save', { workspace: registered.workspace, name: 'Historical Normal' });
  if (unseal) {
    const plan = await registered.callLegacy('plan', { workspace: registered.workspace, mode: 'unseal' });
    await registered.callLegacy('apply', { workspace: registered.workspace, planId: plan.planId });
  }
  const configPath = join(profile.context.codexHome, 'config.toml');
  if (retainedBaseline) {
    await writeFile(configPath, (await readFile(configPath, 'utf8')).replace(/^model = .*$/m, 'model = "PRIVATE_ALREADY_ACCEPTED"'));
    const plan = await registered.callLegacy('plan-retained', { workspace: registered.workspace });
    await registered.callLegacy('accept-retained', { workspace: registered.workspace, planId: plan.planId });
  }
  const w = await openWorkspace(registered.workspace);
  assert.ok(Object.values(w.reg.bindings).every(b => Number.isInteger(b.dev) && b.volumeUuid === undefined));
  if (retained) await writeFile(configPath, (await readFile(configPath, 'utf8')).replace(/^model = .*$/m, 'model = "PRIVATE_REBIND_RETAINED"'));
  return { ...profile, ...registered, parent, configPath, favorite, before: w, files: await captureRegistered(w.reg) };
}
const review = s => sources.reviewUserDirectoryRebind({ workspace: s.workspace });
const accept = (s, p, fields = {}) => sources.applyUserDirectoryRebind({ workspace: s.workspace,
  reviewId: p.reviewId, confirmedCurrentLocations: true, ...fields });

test('explicit rebind preserves old records and source bytes; retained adoption and Normal restore remain separate', async t => {
  const s = await fixture(t, { retainedBaseline: true });
  assert.notEqual(s.before.state.normalId, s.before.reg.normalId);
  const previousActiveNormal = await loadNormal(s.workspace, s.before.reg, s.before.state.normalId);
  const oldNormal = await loadNormal(s.workspace, s.before.reg);
  const oldFavorite = await loadRecord(s.workspace, 'favorite', s.favorite.favoriteId);
  const reservation = await readFile(join(s.before.owner, 'reservation.json'));
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).conflict.kind, 'source-redirection');
  const p = await review(s);
  assert.equal(p.sourceFilesChanged, 0);
  assert.equal(p.historicalVolumeContinuity, 'unverified');
  assert.equal(p.retainedChangePending, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, s.before.state);
  assert.deepEqual(await captureRegistered(s.before.reg), s.files);
  assert.ok(!JSON.stringify(p).includes('PRIVATE_REBIND_RETAINED'));
  await assert.rejects(accept(s, p, { confirmedCurrentLocations: false }), { kind: 'directory-rebind-confirmation-required' });
  const a = await accept(s, p);
  const w = await openWorkspace(s.workspace);
  assert.notEqual(w.scopeId, s.before.scopeId);
  assert.equal(w.rootScopeId, s.before.rootScopeId);
  assert.equal(w.reg.role, 'registration-rebind');
  assert.equal(w.reg.normalId, s.before.reg.normalId);
  assert.deepEqual(w.reg.skills, s.before.reg.skills);
  assert.equal(w.state.snapshotId, s.before.state.snapshotId);
  assert.equal(w.state.normalId, s.before.state.normalId);
  assert.equal(w.state.scopePreparationRequired, true);
  assert.ok(w.state.ownedDirs.length > 0);
  assert.ok(w.state.ownedDirs.every(d => d.identity.volumeUuid && d.identity.dev === undefined));
  assert.deepEqual(await captureRegistered(w.reg), s.files);
  assert.deepEqual(await readFile(join(s.before.owner, 'reservation.json')), reservation);
  assert.deepEqual(await loadRecord(s.workspace, 'scope', s.before.scopeId), s.before.reg);
  assert.deepEqual(await loadNormal(s.workspace, w.reg), oldNormal);
  assert.deepEqual(await loadNormal(s.workspace, w.reg, s.before.state.normalId), previousActiveNormal);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', s.favorite.favoriteId), oldFavorite);
  assert.equal(a.sourceFilesChanged, 0);
  assert.equal((await accept(s, p)).duplicate, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, w.state);
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).conflict.kind, 'source-conflict');
  const retained = await sources.planUserRetainedSettings({ workspace: s.workspace });
  await sources.acceptUserRetainedSettings({ workspace: s.workspace, planId: retained.planId });
  assert.deepEqual(await captureRegistered(w.reg), s.files);
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: s.favorite.favoriteId });
  assert.equal(restore.adaptation.kind, 'directory-rebind');
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  const restored = await sources.userSourceState({ workspace: s.workspace });
  assert.equal(restored.preparedMode, 'normal');
  assert.equal(restored.conflict, null);
  assert.equal(restored.recovery.pending, false);
  assert.equal(restored.registration.modeChangeRequired, false);
  const expected = { ...oldNormal, config: { ...s.files.config, text: oldNormal.config.text.replace(/^model = .*$/m, 'model = "PRIVATE_REBIND_RETAINED"') } };
  assert.deepEqual(await captureRegistered(w.reg), expected);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', s.favorite.favoriteId), oldFavorite);
  await assert.rejects(accept(s, p), { kind: 'stale-plan' });
});

test('review refuses managed edits and never consumes an unrecorded created directory', async t => {
  const s = await fixture(t, { unseal: false, retained: false });
  const basePath = join(s.context.codexHome, 'AGENTS.md');
  await writeFile(basePath, '# independent managed edit\n');
  await assert.rejects(review(s), { kind: 'source-conflict' });
  await writeFile(basePath, s.files.base.text);
  const missing = Object.values(s.before.reg.bindings).flatMap(b => b.missing)[0];
  assert.ok(missing);
  await mkdir(missing);
  await assert.rejects(review(s), { kind: 'source-redirection' });
  assert.deepEqual((await openWorkspace(s.workspace)).state, s.before.state);
});

test('review and adoption reject changed directories, files and state without touching sources', async t => {
  const s = await fixture(t);
  const p = await review(s);
  await writeFile(s.configPath, (await readFile(s.configPath, 'utf8')).replace('PRIVATE_REBIND_RETAINED', 'PRIVATE_AFTER_REVIEW'));
  await assert.rejects(accept(s, p), { kind: 'source-conflict' });
  await writeFile(s.configPath, s.files.config.text);
  const owned = s.before.state.ownedDirs[0];
  const kept = owned.path + '-original';
  await rename(owned.path, kept); await mkdir(owned.path);
  await assert.rejects(accept(s, p), { kind: 'source-redirection' });
  await rm(owned.path, { recursive: true }); await rename(kept, owned.path);
  const statePath = join(s.workspace, 'state.json');
  await writeFile(statePath, JSON.stringify({ ...s.before.state, revision: s.before.state.revision + 1 }));
  await assert.rejects(accept(s, p), { kind: 'stale-plan' });
  assert.deepEqual(await captureRegistered(s.before.reg), s.files);
});

for (const phase of ['directory-rebind-journal', 'directory-rebind-manifest', 'directory-rebind-state'])
test(`interruption at ${phase} cancels records offline and keeps independent edits`, async t => {
  const s = await fixture(t); const p = await review(s);
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('synthetic stop'); });
  await assert.rejects(accept(s, p));
  setSourceTransactionTestHook(null);
  await writeFile(s.configPath, '# Independent edit during recovery\n');
  const { stdout } = await execute(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
  assert.equal(JSON.parse(stdout).status, 'directory-rebind-recording-cancelled');
  const w = await openWorkspace(s.workspace);
  assert.deepEqual(w.state, s.before.state);
  assert.deepEqual(w.manifest, s.before.manifest);
  assert.equal(await readFile(s.configPath, 'utf8'), '# Independent edit during recovery\n');
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).recovery.pending, false);
});

test('foreign rebind stages remain intact and prevent partial cancellation', async t => {
  const s = await fixture(t); const p = await review(s);
  setSourceTransactionTestHook(at => { if (at === 'directory-rebind-state') throw Error('synthetic stop'); });
  await assert.rejects(accept(s, p)); setSourceTransactionTestHook(null);
  const current = await openWorkspace(s.workspace);
  const foreign = join(s.workspace, 'registration.json.next');
  await writeFile(foreign, JSON.stringify({ independent: true }));
  await assert.rejects(sources.recoverUserSources({ workspace: s.workspace }), { kind: 'foreign-stage' });
  assert.deepEqual((await openWorkspace(s.workspace)).state, current.state);
  assert.deepEqual(await readJson(foreign), { independent: true });
  assert.deepEqual(await captureRegistered(current.reg), s.files);
});

test('local CLI uses exact reviewed confirmation and old writers refuse before source writes', async t => {
  const s = await fixture(t, { retained: false });
  const cli = async (action, input) => JSON.parse((await execute(process.execPath,
    [resolve('bin/unharness.mjs'), 'sources', action, '--json', JSON.stringify(input)])).stdout);
  const p = await cli('review-rebind', { workspace: s.workspace });
  await assert.rejects(cli('apply-rebind', { workspace: s.workspace, reviewId: p.reviewId }));
  await cli('apply-rebind', { workspace: s.workspace, reviewId: p.reviewId, confirmedCurrentLocations: true });
  await assert.rejects(s.callLegacy('plan', { workspace: s.workspace, mode: 'normal' }), e =>
    e.code === 1 && JSON.parse(e.stderr).error.kind === 'workspace-invalid');
  assert.deepEqual(await captureRegistered(s.before.reg), s.files);
  // The published v2/UUID reader also predates the distinct rebind role.
  const oldRoot = join(s.parent, 'published-reader'); await mkdir(oldRoot);
  const archive = join(s.parent, 'published-reader.tar');
  await execute('git', ['archive', '--format=tar', '--output', archive, 'c81ee9cd77dec4302f4a3927e4b327a63cf520ca', 'src', 'bin', 'package.json']);
  await execute('tar', ['-xf', archive, '-C', oldRoot]);
  await assert.rejects(execute(process.execPath, [join(oldRoot, 'bin/unharness.mjs'), 'sources', 'status', '--json', JSON.stringify({ workspace: s.workspace })]), e =>
    e.code === 1 && JSON.parse(e.stderr).error.kind === 'workspace-invalid');
  assert.deepEqual(await captureRegistered(s.before.reg), s.files);
});

test('rebind lineage rejects a review that claims another registration root', async t => {
  const s = await fixture(t, { retained: false }); const p = await review(s);
  const saved = await loadRecord(s.workspace, 'input', p.reviewId);
  const wrongRoot = 'a'.repeat(64);
  const forged = { ...saved, rootScopeId: wrongRoot, beforeManifest: { schemaVersion: 2, rootScopeId: wrongRoot },
    beforeState: { ...saved.beforeState, scopeId: saved.scopeId } };
  const reviewId = await record(s.workspace, 'input', forged);
  const { reboundRegistration, reboundState } = await import('../src/sources/directory-rebind-records.mjs');
  const reg = reboundRegistration(s.before.reg, forged, reviewId);
  const scopeId = await record(s.workspace, 'scope', reg);
  await writeJson(join(s.workspace, 'registration.json'), { schemaVersion: 2, rootScopeId: s.before.rootScopeId });
  await writeJson(join(s.workspace, 'state.json'), reboundState(s.before.state, { ...forged, reviewId }, scopeId, s.before.state.preparation));
  await assert.rejects(openWorkspace(s.workspace), { kind: 'directory-rebind-record-invalid' });
  assert.deepEqual(await captureRegistered(s.before.reg), s.files);
});

test('setup history, saved starts and artwork remain readable; enrollment after rebind has its own lineage', async t => {
  const s = await fixture(t, { unseal: false, retained: false });
  const proposal = { schemaVersion: 1, scopeId: s.scopeId, normalId: s.normalId,
    basis: { application: 'codex', modelId: 'fixture-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: s.before.reg.version, references: [{ url: 'https://developers.openai.com/codex/skills',
        title: 'Synthetic fixture reference', checkedAt: '2026-09-11T00:00:00.000Z' }], rationale: 'Synthetic comparison fixture.' },
    roles: s.before.reg.skills.map(skill => ({ sourceId: skill.id, origin: 'self', reason: 'Owned synthetic Skill.' })),
    unseal: { instructions: 'minimal', automaticSkillIds: [] }, trueform: { automaticExternalSkillIds: [] } };
  const oldReview = await s.callLegacy('review-setup', { workspace: s.workspace, proposal });
  const oldSetup = await s.callLegacy('apply-setup', { workspace: s.workspace, reviewId: oldReview.reviewId });
  const declaration = { request: 'READY', requirements: [{ id: 'exact', label: 'Exactly READY', critical: true }],
    ratings: [], budget: { maxAttempts: 1, maxTurnsPerAttempt: 1, maxRecordedTokens: 100 } };
  const startReview = await s.callLegacy('review-start', { workspace: s.workspace, declaration });
  const start = await s.callLegacy('save-start', { workspace: s.workspace, reviewId: startReview.reviewId });
  const art = await s.callLegacy('discover-appearance', { workspace: s.workspace });
  const oldSetupRecord = await loadRecord(s.workspace, 'application', oldSetup.setupId);
  const p = await review(s); await accept(s, p);
  const w = await openWorkspace(s.workspace);
  assert.equal(w.state.setupId, null);
  assert.equal(w.state.setupSchemaVersion, 2);
  assert.deepEqual(await loadRecord(s.workspace, 'application', oldSetup.setupId), oldSetupRecord);
  const { loadSetup } = await import('../src/setup/records.mjs');
  assert.equal((await loadSetup(scopeWorkspace(w, s.scopeId), oldSetup.setupId)).setupId, oldSetup.setupId);
  assert.equal((await sources.readUserStart({ workspace: s.workspace, startId: start.startId })).startId, start.startId);
  assert.equal((await sources.readUserAppearance({ workspace: s.workspace })).stateId, art.stateId);
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'setup-required' });
  const normal = await sources.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await sources.applyUserPlan({ workspace: s.workspace, planId: normal.planId });
  const currentSetup = await sources.readUserSetup({ workspace: s.workspace });
  const v2 = { ...proposal, schemaVersion: 2, scopeId: w.scopeId, inventoryId: currentSetup.inventory.inventoryId,
    unseal: { instructions: 'minimal', additionalAutomaticSkillIds: [] }, trueform: { retainedOfficialPluginIds: [] } };
  const newSetup = await sources.reviewUserSetup({ workspace: s.workspace, proposal: v2 });
  await sources.applyUserSetup({ workspace: s.workspace, reviewId: newSetup.reviewId });
  const newPath = join(s.context.codexHome, 'skills/new-after-rebind/SKILL.md');
  await mkdir(join(newPath, '..'), { recursive: true });
  await writeFile(newPath, '---\nname: new-after-rebind\ndescription: Another owned synthetic source\n---\nSynthetic body.\n');
  const inventory = await sources.inspectUserEnrollment({ workspace: s.workspace });
  const candidate = inventory.candidates.find(x => x.path === newPath);
  assert.ok(candidate);
  const added = await sources.reviewUserEnrollment({ workspace: s.workspace, discoveryId: inventory.discoveryId,
    additions: [{ sourceId: candidate.id, origin: 'self', reason: 'Another owned synthetic source.' }] });
  await sources.applyUserEnrollment({ workspace: s.workspace, reviewId: added.reviewId });
  const expanded = await openWorkspace(s.workspace);
  assert.equal(expanded.reg.role, 'registration');
  assert.equal(expanded.reg.rebindReviewId, undefined);
  assert.equal(expanded.registrations[1].reg.role, 'registration-rebind');
  const restored = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: s.favorite.favoriteId });
  assert.equal(restored.adaptation.kind, 'source-enrollment');
  assert.deepEqual(restored.adaptation.addedSourceIds, [candidate.id]);
  await sources.applyUserPlan({ workspace: s.workspace, planId: restored.planId });
  assert.equal((await sources.readUserStart({ workspace: s.workspace, startId: start.startId })).startId, start.startId);
  assert.equal((await sources.readUserAppearance({ workspace: s.workspace })).stateId, art.stateId);
});
