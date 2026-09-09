import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, realpath, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as sources from '../src/sources/service.mjs';
import * as replay from '../src/experiments/replay-service.mjs';
import * as results from '../src/experiments/replay-results.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { replayRecording } from '../test-support/replay-recording.mjs';
import * as appearances from '../src/appearances/service.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const evidence = await import('../src/appearances/evidence.mjs').catch(e => {
  if (e.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw e;
});
const mac = { skip: process.platform !== 'darwin' };
const requestText = 'READY';
const assessment = { outcome: 'accepted', requirements: [{ id: 'correct', result: 'pass' }], ratings: [], provenance: 'user' };

async function mode(f, selected) {
  const plan = await sources.planUserMode({ workspace: f.workspace, mode: selected });
  await sources.applyUserPlan({ workspace: f.workspace, planId: plan.planId });
  return (await openWorkspace(f.workspace)).state.snapshotId;
}
async function fixture(t, overrides = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-appearance-evidence-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const profile = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const discovered = await sources.discoverUserSources(profile.context);
  const reg = await sources.registerUserSources({ context: profile.context, discoveryId: discovered.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  const f = { ...reg, ...profile };
  const baselineSnapshotId = (await openWorkspace(f.workspace)).state.snapshotId;
  const candidateSnapshotId = await mode(f, 'trueform');
  await mode(f, 'normal');
  f.declaration = { request: requestText, requirements: [{ id: 'correct', label: 'Exact response', critical: true }], ratings: [],
    budget: { maxAttempts: 3, maxTurnsPerAttempt: 1, maxRecordedTokens: 1000 },
    comparisonRule: { schemaVersion: 1, metric: 'recorded-root-tokens-per-accepted-task', baselineSnapshotId, candidateSnapshotId,
      attemptsPerLoadout: 2, minimumAcceptedRuns: 1, minimumReductionPercent: 10, ...overrides } };
  const review = await sources.reviewUserStart({ workspace: f.workspace, declaration: f.declaration });
  f.startId = (await sources.saveUserStart({ workspace: f.workspace, reviewId: review.reviewId })).startId;
  return f;
}
async function attempt(f, selected, tokens, update = {}, mutate = () => {}, expectedStatus = 'matched-record') {
  await mode(f, selected);
  const review = await replay.reviewUserReplay({ workspace: f.workspace, startId: f.startId });
  const prepared = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: review.reviewId });
  const handoff = await replay.handoffUserReplay({ workspace: f.workspace, attemptId: prepared.attemptId });
  const taskId = randomUUID();
  const global = await readFile(join(f.context.codexHome, 'AGENTS.md'), 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
  const override = await readFile(join(f.context.codexHome, 'AGENTS.override.md'), 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
  const instructions = [(override.trim() ? override : global).trim(), '# Required project instructions'].filter(Boolean).join('\n\n--- project-doc ---\n\n');
  const rows = replayRecording({ taskId, project: handoff.project, request: requestText, instructions,
    createdAt: new Date(Date.parse(handoff.readyAt) + 1).toISOString() });
  const usage = { total_tokens: tokens, input_tokens: tokens - 10, cached_input_tokens: 0,
    cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 0 };
  Object.assign(rows.find(r => r.type === 'token_usage_record').payload, { usage, turn_token_usage: usage, thread_token_usage: usage });
  mutate(rows);
  await mkdir(join(f.context.codexHome, 'sessions'), { recursive: true });
  await writeFile(join(f.context.codexHome, 'sessions', 'rollout-' + taskId + '.jsonl'), rows.map(r => JSON.stringify(r)).join('\n') + '\n');
  await new Promise(resolve => setTimeout(resolve, 25));
  const observed = await results.observeUserReplay({ workspace: f.workspace, attemptId: prepared.attemptId, taskId });
  assert.equal(observed.qualification.status, expectedStatus, JSON.stringify(observed.qualification.reasons));
  return results.saveUserReplayResult({ workspace: f.workspace, resultReviewId: observed.resultReviewId,
    assessment: { ...assessment, ...update } });
}
async function evaluate(f, extra = {}) {
  assert.equal(typeof evidence.evaluateUserAppearance, 'function');
  return evidence.evaluateUserAppearance({ workspace: f.workspace, startId: f.startId, ...extra });
}
async function complete(f, candidateTokens = 70) {
  const saved = [];
  for (const selected of ['normal', 'normal', 'trueform', 'trueform']) saved.push(await attempt(f, selected, selected === 'normal' ? 100 : candidateTokens));
  return saved;
}

test('starting rules reject nonexistent snapshots before capturing a review', mac, async t => {
  const f = await fixture(t);
  await assert.rejects(sources.reviewUserStart({ workspace: f.workspace,
    declaration: { ...f.declaration, comparisonRule: { ...f.declaration.comparisonRule, candidateSnapshotId: 'f'.repeat(64) } } }),
  { kind: 'starting-declaration-invalid' });
});

test('canonical complete evidence qualifies exactly the declared pair without caller-selected results', mac, async t => {
  const f = await fixture(t);
  const initial = await evaluate(f);
  assert.equal(initial.eligible, false); assert.equal(initial.assessment, 'unknown');
  assert.ok(initial.reasons.includes('observation-count-not-met'));
  const saved = await complete(f);
  const value = await evaluate(f);
  assert.equal(value.eligible, true); assert.equal(value.assessment, 'favorable');
  assert.deepEqual(value.reasons, []);
  assert.equal(value.baseline.tokensPerAcceptedTask, 100);
  assert.equal(value.candidate.tokensPerAcceptedTask, 70);
  assert.equal(value.candidate.acceptedCount, 2);
  assert.deepEqual(new Set(value.resultIds), new Set(saved.map(r => r.resultId)));
  assert.match(value.achievementId, /^[a-f0-9]{64}$/);
  assert.equal(value.context.loadoutId, f.declaration.comparisonRule.candidateSnapshotId);
  assert.equal(value.completeIsolationVerified, false);
  assert.equal(JSON.stringify(value).includes('outputText'), false);
  assert.equal(JSON.stringify(value).includes(requestText), false);
  await assert.rejects(evaluate(f, { resultIds: saved.map(r => r.resultId) }), { kind: 'invalid-request' });
});

test('latest corrections include failed work and invalidate a favorable achievement without a new creative identity', mac, async t => {
  const f = await fixture(t), saved = await complete(f), before = await evaluate(f), last = saved.at(-1);
  const corrected = await results.saveUserReplayResult({ workspace: f.workspace, resultReviewId: last.resultReviewId,
    previousResultId: last.resultId, assessment: { ...assessment, outcome: 'failed', requirements: [{ id: 'correct', result: 'fail' }] } });
  const after = await evaluate(f);
  assert.equal(after.eligible, false); assert.equal(after.assessment, 'adverse');
  assert.equal(after.candidate.totalTokens, 140);
  assert.equal(after.candidate.acceptedCount, 1);
  assert.equal(after.candidate.tokensPerAcceptedTask, 140);
  assert.equal(after.achievementId, before.achievementId);
  assert.notEqual(after.context.evidenceVersion, before.context.evidenceVersion);
  assert.ok(after.resultIds.includes(corrected.resultId)); assert.ok(!after.resultIds.includes(last.resultId));
});

test('unknown grading and an overfilled observation set remain neutral instead of cherry-picking a win', mac, async t => {
  const f = await fixture(t), saved = await complete(f), last = saved.at(-1);
  await results.saveUserReplayResult({ workspace: f.workspace, resultReviewId: last.resultReviewId, previousResultId: last.resultId,
    assessment: { ...assessment, requirements: [{ id: 'correct', result: 'unknown' }] } });
  const unknown = await evaluate(f);
  assert.equal(unknown.eligible, false); assert.equal(unknown.assessment, 'unknown');
  assert.ok(unknown.reasons.includes('quality-evidence-unknown'));
  await attempt(f, 'trueform', 20);
  const extra = await evaluate(f);
  assert.equal(extra.eligible, false); assert.equal(extra.assessment, 'unknown');
  assert.equal(extra.candidate.attemptCount, 3);
  assert.ok(extra.reasons.includes('observation-count-not-met'));
});

test('a title change cannot create a new achievement identity from equivalent frozen inputs and conditions', mac, async t => {
  const f = await fixture(t); await complete(f); const first = await evaluate(f);
  const review = await sources.reviewUserStart({ workspace: f.workspace, declaration: { ...f.declaration, title: 'A new name' } });
  f.startId = (await sources.saveUserStart({ workspace: f.workspace, reviewId: review.reviewId })).startId;
  await complete(f); const renamed = await evaluate(f);
  assert.equal(renamed.eligible, true); assert.equal(renamed.achievementId, first.achievementId);
  assert.notEqual(renamed.context.evidenceVersion, first.context.evidenceVersion);
});

test('creation resolves eligibility itself, persists exactly three candidates and finalizes one collection item', mac, async t => {
  const f = await fixture(t); await complete(f);
  const decision = await evaluate(f), first = await appearances.discoverUserAppearance({ workspace: f.workspace });
  assert.equal(typeof appearances.createUserOriginalAppearance, 'function');
  const args = { workspace: f.workspace, startId: f.startId, achievementId: decision.achievementId, expectedStateId: first.stateId };
  for (const extra of [{ eligible: true }, { seed: '0'.repeat(64) }, { resultIds: decision.resultIds }])
    await assert.rejects(appearances.createUserOriginalAppearance({ ...args, ...extra }), { kind: 'invalid-request' });
  const created = await appearances.createUserOriginalAppearance(args), set = created.state.achievements[0];
  assert.equal(set.candidates.length, 3); assert.equal(created.state.selectedItemId, first.state.selectedItemId);
  assert.deepEqual(await appearances.createUserOriginalAppearance(args), created);
  const selected = set.candidates[1].id;
  assert.equal(typeof appearances.adoptUserOriginalAppearance, 'function');
  const adopted = await appearances.adoptUserOriginalAppearance({ workspace: f.workspace, achievementId: decision.achievementId,
    candidateId: selected, expectedStateId: created.stateId });
  assert.equal(adopted.state.selectedItemId, selected); assert.equal(adopted.state.items.length, 2);
  await assert.rejects(appearances.adoptUserOriginalAppearance({ workspace: f.workspace, achievementId: decision.achievementId,
    candidateId: set.candidates[0].id, expectedStateId: adopted.stateId }), { kind: 'appearance-choice-final' });
  assert.equal((await sources.userSourceState({ workspace: f.workspace })).preparedMode, 'trueform');
});

test('interrupted original publication recovers the same set and corrected evidence cannot be reused to generate again', mac, async t => {
  const f = await fixture(t), saved = await complete(f), decision = await evaluate(f);
  const first = await appearances.discoverUserAppearance({ workspace: f.workspace });
  assert.equal(typeof appearances.createUserOriginalAppearance, 'function');
  const args = { workspace: f.workspace, startId: f.startId, achievementId: decision.achievementId, expectedStateId: first.stateId };
  await mode(f, 'normal');
  await assert.rejects(appearances.createUserOriginalAppearance(args), { kind: 'appearance-ineligible' });
  await mode(f, 'trueform');
  setSourceTransactionTestHook(phase => { if (phase === 'appearance-index-staged') throw Error('owned interruption'); });
  await assert.rejects(appearances.createUserOriginalAppearance(args), { kind: 'appearance-publication-uncertain' });
  setSourceTransactionTestHook(null);
  const pending = await appearances.readUserAppearance({ workspace: f.workspace });
  const recovered = await appearances.recoverUserAppearance({ workspace: f.workspace });
  assert.equal(recovered.stateId, pending.pendingStateId);
  assert.deepEqual(await appearances.createUserOriginalAppearance(args), recovered);
  const last = saved.at(-1);
  await results.saveUserReplayResult({ workspace: f.workspace, resultReviewId: last.resultReviewId, previousResultId: last.resultId,
    assessment: { ...assessment, outcome: 'failed', requirements: [{ id: 'correct', result: 'fail' }] } });
  await assert.rejects(appearances.createUserOriginalAppearance(args), { kind: 'appearance-ineligible' });
  assert.deepEqual((await appearances.readUserAppearance({ workspace: f.workspace })).state.achievements, recovered.state.achievements);
});

test('historical declarations without a rule and unfinished attempts never qualify', mac, async t => {
  const f = await fixture(t), declaredStartId = f.startId;
  const { comparisonRule, ...historical } = f.declaration;
  const review = await sources.reviewUserStart({ workspace: f.workspace, declaration: historical });
  f.startId = (await sources.saveUserStart({ workspace: f.workspace, reviewId: review.reviewId })).startId;
  const old = await evaluate(f);
  assert.equal(old.eligible, false); assert.equal(old.assessment, 'unknown');
  assert.deepEqual(old.reasons, ['predeclared-comparison-rule-required']);
  f.startId = declaredStartId;
  const draft = await replay.reviewUserReplay({ workspace: f.workspace, startId: f.startId });
  const prepared = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: draft.reviewId });
  const incomplete = await evaluate(f);
  assert.equal(incomplete.eligible, false); assert.equal(incomplete.baseline.attemptCount, 1);
  assert.ok(incomplete.reasons.includes('incomplete-attempts'));
  await replay.cancelUserReplay({ workspace: f.workspace, attemptId: prepared.attemptId });
  assert.ok((await evaluate(f)).reasons.includes('incomplete-attempts'));
});

test('missing usage and mismatched runtime records remain neutral even with passing quality marks', mac, async t => {
  const f = await fixture(t);
  await attempt(f, 'normal', 100); await attempt(f, 'normal', 100);
  await attempt(f, 'trueform', 70, {}, rows => {
    const p = rows.find(r => r.type === 'token_usage_record').payload;
    for (const field of ['usage', 'turn_token_usage', 'thread_token_usage']) delete p[field].total_tokens;
  });
  await attempt(f, 'trueform', 70, {}, rows => {
    rows.find(r => r.type === 'turn_context').payload.model = 'different-model';
  }, 'not-matched-record');
  const value = await evaluate(f);
  assert.equal(value.eligible, false); assert.equal(value.assessment, 'unknown');
  assert.ok(value.reasons.includes('usage-unavailable-or-partial'));
  assert.ok(value.reasons.includes('runtime-conditions-differ-or-unknown'));
  assert.ok(value.reasons.includes('unqualified-or-unavailable-records'));
});

test('a late independent source edit blocks creation and keeps that edit and the previous appearance', mac, async t => {
  const f = await fixture(t); await complete(f); const decision = await evaluate(f);
  const first = await appearances.discoverUserAppearance({ workspace: f.workspace });
  const path = join(f.context.codexHome, 'AGENTS.md'), independent = 'An independently edited source';
  setSourceTransactionTestHook(async phase => { if (phase === 'appearance-evidence-checked') await writeFile(path, independent); });
  await assert.rejects(appearances.createUserOriginalAppearance({ workspace: f.workspace, startId: f.startId,
    achievementId: decision.achievementId, expectedStateId: first.stateId }), { kind: 'appearance-ineligible' });
  setSourceTransactionTestHook(null);
  assert.equal(await readFile(path, 'utf8'), independent);
  assert.deepEqual(await appearances.readUserAppearance({ workspace: f.workspace }), first);
});
