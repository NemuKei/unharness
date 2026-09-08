import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, readFile, mkdir, appendFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as sources from '../src/sources/service.mjs';
import * as attempts from '../src/experiments/replay-service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { readStartingManifest } from '../src/experiments/records.mjs';
import { replayRecording, replayTaskId } from '../test-support/replay-recording.mjs';
const replay = await import('../src/experiments/replay-results.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const mac = { skip: process.platform !== 'darwin' };
const declaration = { request: '  READY\n', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true }],
  ratings: [{ id: 'clarity', label: 'Clarity', lowAnchor: 'Unclear', highAnchor: 'Clear' }],
  budget: { maxAttempts: 2, maxTurnsPerAttempt: 1, maxRecordedTokens: 150 } };
const assessment = { outcome: 'accepted', requirements: [{ id: 'complete', result: 'pass' }],
  ratings: [{ id: 'clarity', score: 5, reason: 'Direct answer' }], provenance: 'user' };
async function fixture(t, budget = declaration.budget) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-replay-results-')));
  t.after(() => rm(parent, { recursive: true, force: true })); t.after(() => setSourceTransactionTestHook(null));
  const f = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const d = await sources.discoverUserSources(f.context);
  const reg = await sources.registerUserSources({ context: f.context, discoveryId: d.discoveryId, instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  await writeFile(join(f.context.project, 'work.bin'), Buffer.from([0, 255, 2]));
  const startReview = await sources.reviewUserStart({ workspace: reg.workspace, declaration: { ...declaration, budget } });
  const start = await sources.saveUserStart({ workspace: reg.workspace, reviewId: startReview.reviewId });
  const r = await attempts.reviewUserReplay({ workspace: reg.workspace, startId: start.startId });
  const p = await attempts.prepareUserReplay({ workspace: reg.workspace, reviewId: r.reviewId });
  const h = await attempts.handoffUserReplay({ workspace: reg.workspace, attemptId: p.attemptId });
  return { ...f, ...reg, ...h, startId: start.startId };
}
async function recording(f, mutate = () => {}) {
  const r = replayRecording({ project: f.project, request: declaration.request,
    createdAt: new Date(Date.parse(f.readyAt) + 1).toISOString(),
    instructions: '# PRIVATE_TEST optional user guide\n\n--- project-doc ---\n\n# Required project instructions' });
  mutate(r); await mkdir(join(f.context.codexHome, 'sessions'), { recursive: true });
  await writeFile(join(f.context.codexHome, 'sessions', `rollout-${replayTaskId}.jsonl`), r.map(x => JSON.stringify(x)).join('\n') + '\n');
  await new Promise(resolve => setTimeout(resolve, 25));
}
async function observe(f, extras = {}) {
  assert.equal(typeof replay.observeUserReplay, 'function');
  return replay.observeUserReplay({ workspace: f.workspace, attemptId: f.attemptId, taskId: replayTaskId, ...extras });
}
async function save(f, review, a = assessment, extras = {}) {
  return replay.saveUserReplayResult({ workspace: f.workspace, resultReviewId: review.resultReviewId, assessment: a, ...extras });
}
test('collection freezes separate binary outcomes, recorded usage and declared assessments; original and next attempt inputs stay intact', mac, async t => {
  const f = await fixture(t); await recording(f);
  await writeFile(join(f.project, 'work.bin'), Buffer.from([0, 254, 3]));
  await writeFile(join(f.project, 'answer.txt'), 'Produced result');
  const review = await observe(f);
  assert.equal(review.qualification.status, 'matched-record'); assert.equal(review.budget.status, 'within-recorded-budget');
  assert.equal(review.measurement.usage.totals.totalTokens, 100); assert.equal(review.outputText, 'READY');
  const result = await save(f, review);
  assert.equal(result.acceptance.accepted, true); assert.equal(result.creationEligible, false);
  assert.equal(result.assessment.requirements[0].label, 'Exactly READY');
  assert.equal((await attempts.readUserReplay({ workspace: f.workspace, attemptId: f.attemptId })).phase, 'recorded');
  assert.equal((await attempts.listUserReplays({ workspace: f.workspace })).activeAttemptId, null);
  await writeFile(join(f.project, 'work.bin'), Buffer.from([0, 0]));
  const frozen = await readStartingManifest({ store: f.workspace, manifestId: result.files.manifestId, withBytes: true });
  assert.deepEqual(frozen.files.find(x => x.path === 'work.bin').bytes, Buffer.from([0, 254, 3]));
  const r = await attempts.reviewUserReplay({ workspace: f.workspace, startId: f.startId });
  const p = await attempts.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId });
  assert.deepEqual(await readFile(join(p.project, 'work.bin')), Buffer.from([0, 255, 2]));
  assert.deepEqual(await readFile(join(f.context.project, 'work.bin')), Buffer.from([0, 255, 2]));
});
test('only frozen criterion IDs can be assessed and attributed amendments retain prior assessments', mac, async t => {
  const f = await fixture(t); await recording(f); const r = await observe(f);
  for (const a of [ { ...assessment, requirements: [] }, { ...assessment, requirements: [{ id: 'new', result: 'pass' }] },
    { ...assessment, requirements: [{ id: 'complete', result: 'pass', critical: false }] }, { ...assessment, ratings: [] } ])
    await assert.rejects(save(f, r, a), { kind: 'replay-assessment-invalid' });
  const first = await save(f, r);
  assert.equal((await save(f, r)).resultId, first.resultId);
  const updated = { ...assessment, outcome: 'failed', requirements: [{ id: 'complete', result: 'fail' }], provenance: 'agent' };
  await assert.rejects(save(f, r, updated), { kind: 'replay-assessment-conflict' });
  const second = await save(f, r, updated, { previousResultId: first.resultId });
  assert.equal(second.previousResultId, first.resultId); assert.equal(second.acceptance.accepted, false);
  assert.equal((await replay.readUserReplayResult({ workspace: f.workspace, resultId: first.resultId })).assessment.provenance, 'user');
});
test('wrong requests, stale source bindings and exceeded budgets remain recorded but cannot count as accepted', mac, async t => {
  for (const condition of ['request', 'source', 'budget']) {
    const f = await fixture(t, condition === 'budget' ? { ...declaration.budget, maxRecordedTokens: 50 } : declaration.budget);
    await recording(f, r => { if (condition === 'request') { r[5].payload.content[0].text = r[6].payload.item.content[0].text = 'wrong'; } });
    if (condition === 'source') await writeFile(join(f.context.codexHome, 'AGENTS.md'), 'Independent edit');
    const r = await observe(f), saved = await save(f, r);
    assert.equal(saved.acceptance.accepted, false, condition);
    assert.ok(saved.acceptance.reasons.length, condition);
  }
});
test('unavailable task records and abandoned outcomes are retained without claiming execution or stopping', mac, async t => {
  const f = await fixture(t), r = await observe(f);
  assert.equal(r.readIssue, 'replay-task-record-unavailable'); assert.equal(r.measurement, null);
  const saved = await save(f, r, { ...assessment, outcome: 'abandoned', requirements: [{ id: 'complete', result: 'unknown' }], ratings: [{ id: 'clarity', score: null, reason: 'No result' }] });
  assert.equal(saved.assessment.outcome, 'abandoned'); assert.equal(saved.acceptance.accepted, false);
});
test('arbitrary runtime paths, timestamps, cutoffs and mode claims are refused by the shared service', mac, async t => {
  const f = await fixture(t);
  for (const extras of [{ project: f.context.project }, { observedAt: '2020-01-01T00:00:00Z' }, { throughTurnId: 'turn-1' }, { mode: 'trueform' }])
    await assert.rejects(observe(f, extras), { kind: 'invalid-request' });
});
test('lost result publication is resolved by reading the same result after restart', mac, async t => {
  const f = await fixture(t); await recording(f); const r = await observe(f);
  setSourceTransactionTestHook(phase => { if (phase === 'replay-index-published') throw Error('lost response'); });
  await assert.rejects(save(f, r), { kind: 'replay-publication-uncertain' });
  setSourceTransactionTestHook(null);
  const saved = await save(f, r); assert.equal(saved.duplicate, true);
  const state = await attempts.readUserReplay({ workspace: f.workspace, attemptId: f.attemptId });
  assert.equal(state.resultId, saved.resultId); assert.equal(state.phase, 'recorded');
  await assert.rejects(attempts.cancelUserReplay({ workspace: f.workspace, attemptId: f.attemptId }), { kind: 'replay-attempt-unavailable' });
});

test('a native recording appended while outcome files are captured cannot produce an accepted result', mac, async t => {
  const f = await fixture(t); await recording(f);
  setSourceTransactionTestHook(async phase => {
    if (phase === 'replay-outcome-captured') await appendFile(join(f.context.codexHome, 'sessions', `rollout-${replayTaskId}.jsonl`),
      JSON.stringify({ type: 'event_msg', timestamp: new Date().toISOString(), payload: { type: 'task_started', turn_id: 'turn-2' } }) + '\n');
  });
  const r = await observe(f); setSourceTransactionTestHook(null);
  assert.equal(r.readIssue, 'replay-task-record-changed');
  assert.notEqual(r.qualification.status, 'matched-record');
  assert.equal((await save(f, r)).acceptance.accepted, false);
});

test('late source changes are visible, and unsupported outcome files remain in place with an unavailable snapshot', mac, async t => {
  const f = await fixture(t); await recording(f);
  await symlink(join(f.context.project, 'work.bin'), join(f.project, 'outside-link'));
  setSourceTransactionTestHook(async phase => {
    if (phase === 'replay-result-reviewed') await writeFile(join(f.context.codexHome, 'AGENTS.md'), 'Late independent edit');
  });
  const r = await observe(f); setSourceTransactionTestHook(null);
  assert.equal(r.sourceIssue, 'source-conflict'); assert.equal(r.files.issue, 'replay-outcome-files-unavailable');
  assert.deepEqual(await readFile(join(f.project, 'outside-link')), Buffer.from([0, 255, 2]));
  assert.equal((await save(f, r)).acceptance.accepted, false);
});

test('corrupt frozen outcome bytes make the result unavailable while configuration status and recovery remain readable', mac, async t => {
  const f = await fixture(t); await recording(f);
  await writeFile(join(f.project, 'work.bin'), Buffer.from([7, 8]));
  const r = await observe(f), saved = await save(f, r);
  const manifest = await readStartingManifest({ store: f.workspace, manifestId: saved.files.manifestId });
  const chunkId = manifest.files.find(x => x.path === 'work.bin').chunks[0];
  await writeFile(join(f.workspace, 'records', 'input', chunkId + '.json'), '{corrupt');
  await assert.rejects(replay.readUserReplayResult({ workspace: f.workspace, resultId: saved.resultId }), { kind: 'replay-record-invalid' });
  assert.equal((await sources.userSourceState({ workspace: f.workspace })).preparedMode, 'normal');
  assert.equal((await sources.recoverUserSources({ workspace: f.workspace })).status, 'nothing-pending');
});
