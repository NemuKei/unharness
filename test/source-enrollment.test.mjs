import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace, readJson, loadSnapshot, loadRecord } from '../src/sources/records.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { reviewSetup, applySetup } from '../src/setup/service.mjs';
import { replayRecording } from '../test-support/replay-recording.mjs';
import { registerLegacySourceProfile } from '../test-support/legacy-source-registration.mjs';
const enrollment = await import('../src/setup/enrollment.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const test = (name, fn) => nativeTest(name, { skip: process.platform !== 'darwin' }, fn);

async function fixture(t, { setup = true, skills = true, legacyRevision } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-enrollment-test-')));
  t.after(async () => { setSourceTransactionTestHook(null); await rm(parent, { recursive: true, force: true }); });
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const d = await sources.discoverUserSources(owned.context);
  const r = legacyRevision ? await registerLegacySourceProfile({ parent, context: owned.context, revision: legacyRevision, skills })
    : await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
      instructionsOptional: true, selectedSkillIds: skills ? d.skills.filter(s => s.eligible).map(s => s.id) : [], userAddedOptional: true });
  const w = await openWorkspace(r.workspace);
  const proposal = { schemaVersion: 1, scopeId: r.scopeId, normalId: r.normalId,
    basis: { application: 'codex', modelId: 'gpt-6-astra', modelSource: 'user-specified', desktopVersion: null, runtimeVersion: '0.153.4',
      references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model', title: 'Official model guidance', checkedAt: '2026-09-09T00:00:00.000Z' }],
      rationale: 'A starting comparison condition, with no performance claim.' },
    roles: w.reg.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'The fixture author confirmed this source.' })),
    unseal: { instructions: 'minimal', automaticSkillIds: [] }, trueform: { automaticExternalSkillIds: [] } };
  if (setup) {
    const review = await reviewSetup({ workspace: r.workspace, proposal });
    await applySetup({ workspace: r.workspace, reviewId: review.reviewId });
  }
  return { ...owned, ...r, proposal, parent };
}
async function addSkill(s, name = 'new-example', { disabled = false } = {}) {
  const path = join(s.context.codexHome, 'skills', name, 'SKILL.md');
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  await writeFile(path, `---\nname: ${name}\ndescription: A new synthetic source\n---\n\nPRIVATE_TEST added body.\n`, { mode: 0o600 });
  if (disabled) {
    const config = join(s.context.codexHome, 'config.toml');
    await writeFile(config, (await readFile(config, 'utf8')) + '\n[[skills.config]]\npath = ' + JSON.stringify(path) + '\nenabled = false\n');
    const p = await sources.planUserRetainedSettings({ workspace: s.workspace });
    await sources.acceptUserRetainedSettings({ workspace: s.workspace, planId: p.planId });
  }
  const inventory = await enrollment.inspectEnrollment({ workspace: s.workspace });
  const candidate = inventory.candidates.find(c => c.label === name);
  assert.ok(candidate);
  return { path, inventory, addition: { sourceId: candidate.id, origin: 'self', reason: 'Confirmed self-authored fixture.',
    unseal: 'automatic', trueform: 'manual' } };
}
const reviewNew = (s, n) => enrollment.reviewEnrollment({ workspace: s.workspace, discoveryId: n.inventory.discoveryId, additions: [n.addition] });
async function switchMode(s, mode) {
  const plan = await sources.planUserMode({ workspace: s.workspace, mode });
  await sources.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  return plan;
}

test('enrollment freezes a larger scope without changing sources, original Normal, reservation or earlier favorites', async t => {
  const s = await fixture(t);
  // An actual legacy disabled TRUEFORM must stay that way after enrollment.
  const legacy = await sources.planUserMode({ workspace: s.workspace, mode: 'trueform', selectedIds: s.proposal.roles.map(r => r.sourceId) });
  await sources.applyUserPlan({ workspace: s.workspace, planId: legacy.planId });
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Legacy disabled Skill' });
  const before = await openWorkspace(s.workspace), original = await loadSnapshot(s.workspace, before.reg, s.normalId);
  const oldFavorite = await loadRecord(s.workspace, 'favorite', favorite.favoriteId);
  const reservation = await readFile(join(before.owner, 'reservation.json'));
  const manifest = await readFile(join(s.workspace, 'registration.json'));
  const n = await addSkill(s), beforeFiles = await readSourceProfileFiles(s.context), newBody = await readFile(n.path);
  assert.equal(n.inventory.registeredCount, 1);
  const p = await reviewNew(s, n);
  assert.equal(p.sourceFilesChanged, 0);
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  const result = await enrollment.applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
  const current = await openWorkspace(s.workspace);
  assert.notEqual(current.scopeId, before.scopeId);
  assert.equal(current.rootScopeId, before.scopeId);
  assert.equal(current.reg.skills.length, 2);
  assert.equal(current.state.scopePreparationRequired, true);
  const status = await sources.userSourceState({ workspace: s.workspace });
  assert.equal(status.observationIssue, 'source-preparation-required');
  assert.equal(status.observation, null);
  await assert.rejects(sources.observeUserTask({ workspace: s.workspace, taskId: randomUUID() }), { kind: 'source-preparation-required' });
  await assert.rejects(sources.saveUserFavorite({ workspace: s.workspace, name: 'Unprepared expanded condition' }), { kind: 'source-preparation-required' });
  assert.equal(result.modeChangeRequired, true);
  assert.equal(result.sourceFilesChanged, 0);
  assert.deepEqual(await readSourceProfileFiles(s.context), beforeFiles);
  assert.deepEqual(await readFile(n.path), newBody);
  assert.deepEqual(await readFile(join(before.owner, 'reservation.json')), reservation);
  assert.deepEqual(await readFile(join(s.workspace, 'registration.json')), manifest);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', favorite.favoriteId), oldFavorite);
  const normal = await loadSnapshot(s.workspace, current.reg, current.reg.normalId);
  for (const [key, file] of Object.entries(original)) assert.deepEqual(normal[key], file);
  assert.deepEqual(await captureRegistered(current.reg), await loadSnapshot(s.workspace, current.reg, current.state.snapshotId));
  const duplicate = await enrollment.applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
  assert.equal(duplicate.duplicate, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, current.state);
  const list = await sources.listUserFavorites({ workspace: s.workspace });
  assert.equal(list.favorites[0].favoriteId, favorite.favoriteId);
  assert.deepEqual(list.favorites[0].addedSourceIds, [n.addition.sourceId]);
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  assert.equal(restore.adaptation.kind, 'source-enrollment');
  assert.equal(restore.setupId, null);
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), beforeFiles);
  assert.deepEqual(await readFile(n.path), newBody);
  await switchMode(s, 'trueform');
  assert.match(await readFile(join(n.path, '..', 'agents', 'openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  assert.equal((await openWorkspace(s.workspace)).state.scopePreparationRequired, false);
  await switchMode(s, 'unseal');
  await assert.rejects(readFile(join(n.path, '..', 'agents', 'openai.yaml')), { code: 'ENOENT' });
  await switchMode(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.deepEqual(await readFile(n.path), newBody);
});

test('enrollment requires confirmed roles, an adopted setup and a current fixed-context inventory', async t => {
  const s = await fixture(t, { setup: false }), n = await addSkill(s);
  await assert.rejects(reviewNew(s, n), { kind: 'setup-required' });
  const p = await reviewSetup({ workspace: s.workspace, proposal: s.proposal });
  await applySetup({ workspace: s.workspace, reviewId: p.reviewId });
  for (const addition of [ { ...n.addition, origin: 'unknown' }, { ...n.addition, trueform: 'automatic' },
    { ...n.addition, path: '/invented/SKILL.md' }, { ...n.addition, sourceId: s.proposal.roles[0].sourceId } ]) {
    await assert.rejects(enrollment.reviewEnrollment({ workspace: s.workspace, discoveryId: n.inventory.discoveryId, additions: [addition] }));
  }
  await assert.rejects(enrollment.inspectEnrollment({ workspace: s.workspace, context: s.context }), { kind: 'invalid-request' });
  await writeFile(n.path, '# Independently edited new source\n');
  await assert.rejects(reviewNew(s, n), { kind: 'stale-discovery' });
  assert.equal((await openWorkspace(s.workspace)).reg.skills.length, 1);
});

for (const phase of ['enrollment-journal', 'enrollment-state']) test(`interrupted ${phase} recovers offline without source or history writes`, async t => {
  const s = await fixture(t), n = await addSkill(s), p = await reviewNew(s, n), before = await openWorkspace(s.workspace);
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('synthetic stop'); });
  await assert.rejects(enrollment.applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId }));
  setSourceTransactionTestHook(null);
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'normal' }), { kind: 'recovery-required' });
  await writeFile(n.path, '# Independent edit during recovery\n');
  const { stdout } = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
  assert.equal(JSON.parse(stdout).status, 'enrollment-recording-cancelled');
  const current = await openWorkspace(s.workspace);
  assert.equal(current.scopeId, before.scopeId);
  assert.deepEqual(current.state, before.state);
  assert.equal(await readFile(n.path, 'utf8'), '# Independent edit during recovery\n');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('a stale review or changed registered file cannot enroll a candidate; disabled new Skills stay disabled', async t => {
  const s = await fixture(t), n = await addSkill(s, 'disabled-example', { disabled: true });
  assert.equal(n.inventory.candidates.find(c => c.id === n.addition.sourceId).enabled, false);
  const p = await reviewNew(s, n);
  await switchMode(s, 'unseal');
  await assert.rejects(enrollment.applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId }), { kind: 'stale-plan' });
  n.inventory = await enrollment.inspectEnrollment({ workspace: s.workspace });
  const fresh = await reviewNew(s, n);
  await enrollment.applyEnrollment({ workspace: s.workspace, reviewId: fresh.reviewId });
  for (const mode of ['normal', 'unseal', 'trueform']) {
    await switchMode(s, mode);
    assert.match((await readSourceProfileFiles(s.context)).config.text, /enabled = false/);
  }
});

test('historical runs, replay results, saved requests and the appearance collection retain their original scope and remain usable', async t => {
  const s = await fixture(t, { skills: false });
  const appearance = await import('../src/appearances/service.mjs');
  const collected = await appearance.discoverUserAppearance({ workspace: s.workspace });
  const declaration = { request: 'READY', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true }], ratings: [],
    budget: { maxAttempts: 2, maxTurnsPerAttempt: 1, maxRecordedTokens: 150 } };
  const startReview = await sources.reviewUserStart({ workspace: s.workspace, declaration });
  const start = await sources.saveUserStart({ workspace: s.workspace, reviewId: startReview.reviewId });
  const r = await sources.reviewUserReplay({ workspace: s.workspace, startId: start.startId });
  const attempt = await sources.prepareUserReplay({ workspace: s.workspace, reviewId: r.reviewId });
  const handoff = await sources.handoffUserReplay({ workspace: s.workspace, attemptId: attempt.attemptId });
  const inventory = await enrollment.inspectEnrollment({ workspace: s.workspace });
  await assert.rejects(enrollment.reviewEnrollment({ workspace: s.workspace, discoveryId: inventory.discoveryId,
    additions: [{ sourceId: inventory.candidates[0].id, origin: 'self', reason: 'Confirmed fixture.', unseal: 'manual', trueform: 'manual' }] }),
  { kind: 'replay-active-attempt' });
  const taskId = randomUUID();
  const recording = replayRecording({ taskId, project: handoff.project, request: declaration.request,
    createdAt: new Date(Date.parse(handoff.readyAt) + 1).toISOString(),
    instructions: '# PRIVATE_TEST optional user guide\n\n--- project-doc ---\n\n# Required project instructions' });
  await mkdir(join(s.context.codexHome, 'sessions'), { recursive: true });
  await writeFile(join(s.context.codexHome, 'sessions', `rollout-${taskId}.jsonl`), recording.map(r => JSON.stringify(r)).join('\n') + '\n');
  const observed = await sources.observeUserReplay({ workspace: s.workspace, attemptId: attempt.attemptId, taskId });
  assert.equal(observed.qualification.status, 'matched-record');
  const result = await sources.saveUserReplayResult({ workspace: s.workspace, resultReviewId: observed.resultReviewId,
    assessment: { outcome: 'accepted', provenance: 'agent', requirements: [{ id: 'complete', result: 'pass' }], ratings: [] } });
  const ordinaryId = randomUUID(), ordinary = replayRecording({ taskId: ordinaryId, project: s.context.project,
    request: 'READY', createdAt: new Date().toISOString(),
    instructions: '# PRIVATE_TEST optional user guide\n\n--- project-doc ---\n\n# Required project instructions' });
  await writeFile(join(s.context.codexHome, 'sessions', `rollout-${ordinaryId}.jsonl`), ordinary.map(r => JSON.stringify(r)).join('\n') + '\n');
  const runReview = await sources.reviewUserRun({ workspace: s.workspace, taskId: ordinaryId });
  const run = await sources.saveUserRun({ workspace: s.workspace, reviewId: runReview.reviewId,
    assessment: { outcome: 'accepted', provenance: 'agent', requirements: [], ratings: [] } });
  assert.equal(run.source.observation.status, 'matched-record');
  const n = await addSkill(s);
  const review = await reviewNew(s, n);
  await enrollment.applyEnrollment({ workspace: s.workspace, reviewId: review.reviewId });
  assert.deepEqual(await sources.readUserRun({ workspace: s.workspace, runId: run.runId }), run);
  assert.deepEqual(await sources.readUserReplayResult({ workspace: s.workspace, resultId: result.resultId }),
    Object.fromEntries(Object.entries(result).filter(([key]) => key !== 'duplicate')));
  assert.equal((await sources.listUserStarts({ workspace: s.workspace })).starts[0].scopeId, s.scopeId);
  const history = await sources.listUserReplays({ workspace: s.workspace });
  assert.equal(history.attempts[0].scopeId, s.scopeId);
  assert.equal(history.attempts[0].phase, 'recorded');
  assert.equal(history.attempts[0].conditionIssue, 'replay-preparation-stale');
  assert.equal((await sources.listUserRuns({ workspace: s.workspace })).runs[0].scopeId, s.scopeId);
  const fromRun = await sources.saveUserRunFavorite({ workspace: s.workspace, runId: run.runId });
  const fromReplay = await sources.saveUserReplayFavorite({ workspace: s.workspace, resultId: result.resultId });
  for (const f of [fromRun, fromReplay]) {
    assert.equal((await loadRecord(s.workspace, 'favorite', f.favoriteId)).scopeId, s.scopeId);
    assert.equal((await sources.planUserFavorite({ workspace: s.workspace, favoriteId: f.favoriteId })).adaptation.kind, 'source-enrollment');
  }
  const readAppearance = await appearance.readUserAppearance({ workspace: s.workspace });
  assert.deepEqual(readAppearance.state, collected.state);
  assert.equal(readAppearance.stateId, collected.stateId);
  await assert.rejects(sources.reviewUserReplay({ workspace: s.workspace, startId: start.startId }), { kind: 'replay-preparation-stale' });
});

test('multiple enrollments preserve the ancestry and an actual previous writer refuses the expanded target set', async t => {
  const s = await fixture(t, { legacyRevision: 'e26a49f18e5acf3e918c3169d53dcd987dd58163' });
  const old = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Original favorite' });
  const exec = promisify(execFile);
  const oldCli = () => exec(process.execPath, [s.legacyCli, 'sources', 'plan', '--json',
    JSON.stringify({ workspace: s.workspace, mode: 'normal' })]);
  assert.equal(JSON.parse((await oldCli()).stdout).mode, 'normal');
  const added = [];
  for (const name of ['first-addition', 'second-addition']) {
    const n = await addSkill(s, name), p = await reviewNew(s, n);
    added.push(n.addition.sourceId);
    await enrollment.applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
    await switchMode(s, 'trueform');
  }
  const w = await openWorkspace(s.workspace);
  assert.equal(w.registrations.length, 3);
  const plan = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: old.favoriteId });
  assert.deepEqual(plan.adaptation.addedSourceIds, added);
  await sources.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  const before = await captureRegistered(w.reg), state = await readFile(join(s.workspace, 'state.json'));
  await assert.rejects(oldCli(), e => e.code === 1 && /record-invalid|workspace-invalid/.test(e.stderr));
  assert.deepEqual(await captureRegistered(w.reg), before);
  assert.deepEqual(await readFile(join(s.workspace, 'state.json')), state);
});

test('independent edits at the last enrollment boundary and foreign recovery stages are preserved', async t => {
  const s = await fixture(t), n = await addSkill(s), review = await reviewNew(s, n);
  setSourceTransactionTestHook(async phase => { if (phase === 'enrollment-journal') await writeFile(n.path, '# Independent new Skill edit\n'); });
  await assert.rejects(enrollment.applyEnrollment({ workspace: s.workspace, reviewId: review.reviewId }), { kind: 'source-conflict' });
  setSourceTransactionTestHook(null);
  const stage = join(s.workspace, 'state.json.next');
  await writeFile(stage, JSON.stringify({ unrelated: true }));
  await assert.rejects(sources.recoverUserSources({ workspace: s.workspace }), { kind: 'foreign-stage' });
  assert.deepEqual(await readJson(stage), { unrelated: true });
  assert.equal(await readFile(n.path, 'utf8'), '# Independent new Skill edit\n');
  await rm(stage);
  const before = await openWorkspace(s.workspace);
  await sources.recoverUserSources({ workspace: s.workspace });
  assert.equal((await openWorkspace(s.workspace)).scopeId, before.scopeId);
  assert.equal(await readFile(n.path, 'utf8'), '# Independent new Skill edit\n');
});
