import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as service from '../src/sources/service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadRecord, record } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';

const assessment = { outcome: 'accepted', provenance: 'user', requirements: [{ id: 'works', label: 'Works', critical: true, result: 'pass' }], ratings: [{ id: 'clarity', label: 'Clarity', score: 4, lowAnchor: 'Unclear', highAnchor: 'Clear', reason: 'Readable result' }] };
async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-comparison-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const d = await service.discoverUserSources(owned.context);
  const registered = await service.registerUserSources({ context: owned.context, discoveryId: d.discoveryId, instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  return { ...owned, ...registered };
}
async function recording(s, mutate = () => {}) {
  const taskId = randomUUID(), timestamp = new Date().toISOString();
  const usage = { total_tokens: 100, input_tokens: 80, cached_input_tokens: 20, cache_write_input_tokens: 0, output_tokens: 20, reasoning_output_tokens: 5 };
  const records = [
    { type: 'session_meta', payload: { id: taskId, timestamp, cwd: s.context.project, originator: 'Codex Desktop', thread_source: 'user', cli_version: '0.153.4' } },
    { type: 'event_msg', timestamp, payload: { type: 'task_started', turn_id: 'first' } },
    { type: 'turn_context', timestamp, payload: { cwd: s.context.project, turn_id: 'first', model: 'synthetic-model', effort: 'high' } },
    { type: 'world_state', payload: { full: true, state: { agents_md: { directory: s.context.project, text: s.originalFiles.instructions.text.trim() }, host_skills: { includeInstructions: true, body: '### Available skills\n' } } } },
    { type: 'token_usage_record', timestamp, payload: { thread_id: taskId, turn_id: 'first', session_id: taskId, root_turn_id: 'first', response_id: 'one', usage, turn_token_usage: usage, thread_token_usage: usage } },
    { type: 'event_msg', timestamp, payload: { type: 'task_complete', turn_id: 'first', duration_ms: 1000, time_to_first_token_ms: 100, last_agent_message: 'PRIVATE SYNTHETIC ANSWER' } },
  ];
  mutate(records);
  const directory = join(s.context.codexHome, 'sessions');
  await mkdir(directory, { recursive: true });
  const path = join(directory, `rollout-${taskId}.jsonl`);
  await writeFile(path, records.map(r => JSON.stringify(r)).join('\n') + '\n');
  return { taskId, records, path };
}
const mac = { skip: process.platform !== 'darwin' };
test('private run saves are stable and source state remains byte-identical; answer requires explicit output read', mac, async t => {
  const s = await setup(t), { workspace } = s;
  const w = await openWorkspace(workspace), beforeFiles = await captureRegistered(w.reg);
  const beforeState = await readFile(join(workspace, 'state.json'), 'utf8');
  const { taskId } = await recording(s);
  assert.equal(typeof service.reviewUserRun, 'function');
  const review = await service.reviewUserRun({ workspace, taskId });
  const saved = await service.saveUserRun({ workspace, reviewId: review.reviewId, assessment });
  assert.equal((await service.saveUserRun({ workspace, reviewId: review.reviewId, assessment })).runId, saved.runId);
  assert.deepEqual(await captureRegistered(w.reg), beforeFiles);
  assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), beforeState);
  assert.equal(JSON.stringify(review).includes('PRIVATE SYNTHETIC ANSWER'), false);
  assert.equal(JSON.stringify(saved).includes('PRIVATE SYNTHETIC ANSWER'), false);
  assert.equal(review.source.association.coverage, 'initial-turn-only');
  assert.equal(review.source.observation.status, 'matched-record');
  assert.equal(review.measurement.usage.totals.totalTokens, 100);
  assert.equal(saved.acceptance.accepted, true);
  assert.equal((await service.readUserRunOutput({ workspace, runId: saved.runId })).text, 'PRIVATE SYNTHETIC ANSWER');
});

async function save(s, mutate, assessmentValue = assessment) {
  const { taskId } = await recording(s, mutate);
  const review = await service.reviewUserRun({ workspace: s.workspace, taskId });
  return service.saveUserRun({ workspace: s.workspace, reviewId: review.reviewId, assessment: assessmentValue });
}
async function prepare(s, mode) {
  const plan = await service.planUserMode({ workspace: s.workspace, mode });
  return service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
}
test('assessment corrections remain attributed and overlapping versions never become independent samples', mac, async t => {
  const s = await setup(t), { workspace } = s, first = await save(s);
  const correctedAssessment = { ...assessment, provenance: 'agent', requirements: [{ ...assessment.requirements[0], result: 'unknown' }], note: 'Retrospective\ncorrection' };
  const corrected = await service.saveUserRun({ workspace, reviewId: first.reviewId, previousRunId: first.runId, assessment: correctedAssessment });
  assert.notEqual(corrected.runId, first.runId);
  assert.equal(corrected.assessment.outcome, 'accepted');
  assert.deepEqual(corrected.acceptance, { accepted: false, basis: 'not-accepted', fulfilledRequirements: 0, totalRequirements: 1, criticalFailed: 0, criticalUnknown: 1 });
  assert.equal((await service.readUserRun({ workspace, runId: first.runId })).acceptance.accepted, true);
  const compared = await service.compareUserRuns({ workspace, runIds: [corrected.runId, first.runId] });
  assert.equal(compared.assessment, 'neutral');
  assert.equal(compared.creationEligible, false);
  assert.equal(compared.aggregate.totalTokens, null);
  assert.equal(compared.aggregate.tokensPerAcceptedRun, null);
  assert.equal(compared.aggregate.distinctTaskCount, 1);
  assert.equal(compared.aggregate.acceptedCount, 1);
  assert.ok(compared.aggregate.reasons.includes('overlapping-task-records'));
  const list = await service.listUserRuns({ workspace });
  assert.equal(list.runs.length, 2);
  assert.equal(list.nextCursor, null);
});
test('aggregate counts failed spending, zero acceptance and partial coverage without inferred rankings', mac, async t => {
  const s = await setup(t), { workspace } = s;
  const accepted = await save(s, undefined, { ...assessment, requirements: [] });
  const failed = await save(s, undefined, { ...assessment, outcome: 'failed' });
  const abandoned = await save(s, undefined, { ...assessment, outcome: 'abandoned' });
  assert.equal(accepted.acceptance.basis, 'reported-only');
  const a = (await service.compareUserRuns({ workspace, runIds: [failed.runId, accepted.runId, abandoned.runId] })).aggregate;
  assert.equal(a.totalTokens, 300);
  assert.equal(a.tokensPerAcceptedRun, 300);
  assert.deepEqual(a.outcomeCounts, { accepted: 1, failed: 1, abandoned: 1, unknown: 0 });
  const b = (await service.compareUserRuns({ workspace, runIds: [failed.runId] })).aggregate;
  assert.equal(b.totalTokens, 100);
  assert.equal(b.tokensPerAcceptedRun, null);
  assert.ok(b.reasons.includes('no-accepted-runs'));
  const partial = await save(s, r => { delete r[4].payload.usage.input_tokens; });
  const c = (await service.compareUserRuns({ workspace, runIds: [partial.runId, accepted.runId] })).aggregate;
  assert.equal(c.totalTokens, null);
  assert.ok(c.reasons.includes('usage-unavailable-or-partial'));
});
test('historical UNSEAL favorite freezes its old snapshot and survives retained-setting adaptation', mac, async t => {
  const s = await setup(t), { workspace } = s;
  const { loadRecord, loadSnapshot } = await import('../src/sources/records.mjs');
  const { getMinimalGuide } = await import('../src/sources/guide.mjs');
  await prepare(s, 'unseal');
  const run = await save(s, r => { r[3].payload.state.agents_md.text = getMinimalGuide().text; });
  const historical = structuredClone(run.source);
  await prepare(s, 'normal');
  const before = await readFile(join(workspace, 'state.json'), 'utf8');
  const f = await service.saveUserRunFavorite({ workspace, runId: run.runId });
  assert.equal(f.comparisonRunId, run.runId);
  assert.equal(f.preparedMode, 'unseal');
  assert.equal((await service.saveUserRunFavorite({ workspace, runId: run.runId })).favoriteId, f.favoriteId);
  assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), before);
  const frozen = await loadRecord(workspace, 'favorite', f.favoriteId);
  assert.equal(frozen.snapshotId, historical.association.snapshotId);
  const exact = await loadSnapshot(workspace, (await openWorkspace(workspace)).reg, frozen.snapshotId);
  let p = await service.planUserFavorite({ workspace, favoriteId: f.favoriteId });
  assert.equal(p.adaptation, null);
  await service.applyUserPlan({ workspace, planId: p.planId });
  assert.deepEqual(await captureRegistered((await openWorkspace(workspace)).reg), exact);
  await prepare(s, 'normal');
  const configPath = join(s.context.codexHome, 'config.toml');
  await writeFile(configPath, (await readFile(configPath, 'utf8')).replace(/^model = .*$/m, 'model = "synthetic-new-model"'));
  const retained = await service.planUserRetainedSettings({ workspace });
  await service.acceptUserRetainedSettings({ workspace, planId: retained.planId });
  const listed = (await service.listUserFavorites({ workspace })).favorites[0];
  assert.equal(listed.comparisonRunId, run.runId);
  assert.equal(listed.needsAdaptation, true);
  p = await service.planUserFavorite({ workspace, favoriteId: f.favoriteId });
  assert.equal(p.adaptation.kind, 'retained-settings');
  await service.applyUserPlan({ workspace, planId: p.planId });
  assert.match(await readFile(configPath, 'utf8'), /synthetic-new-model/);
  assert.deepEqual((await service.readUserRun({ workspace, runId: run.runId })).source, historical);
  assert.deepEqual(await loadRecord(workspace, 'favorite', f.favoriteId), frozen);
});

test('CLI exposes the seven strict comparison operations and rejects duplicate JSON fields', mac, async t => {
  const { sourcesMain } = await import('../src/sources/cli.mjs');
  const s = await setup(t), { workspace } = s, { taskId } = await recording(s);
  async function cli(action, value, raw = false) {
    let out = '', err = '';
    const code = await sourcesMain(['sources', action, '--json', raw ? value : JSON.stringify(value)], { stdout: { write: x => { out += x; } }, stderr: { write: x => { err += x; } } });
    return { code, out: out ? JSON.parse(out) : null, err: err ? JSON.parse(err) : null };
  }
  const review = await cli('review-run', { workspace, taskId });
  assert.equal(review.code, 0);
  const saved = await cli('save-run', { workspace, reviewId: review.out.reviewId, assessment });
  assert.equal(saved.code, 0);
  const runId = saved.out.runId;
  for (const [action, args] of [['runs', { workspace }], ['run', { workspace, runId }], ['run-output', { workspace, runId }], ['compare-runs', { workspace, runIds: [runId] }], ['run-favorite', { workspace, runId }]]) {
    assert.equal((await cli(action, args)).code, 0, action);
    assert.deepEqual((await cli(action, { ...args, raw: 'PRIVATE' })).err, { error: { kind: 'invalid-request' } });
  }
  const duplicated = JSON.stringify({ workspace, reviewId: review.out.reviewId, assessment }).replace('"outcome":"accepted"', '"outcome":"failed","outcome":"accepted"');
  assert.deepEqual((await cli('save-run', duplicated, true)).err, { error: { kind: 'invalid-request' } });
});
test('assessment rejects malformed or duplicate criteria and foreign correction references with fixed errors', mac, async t => {
  const s = await setup(t), { workspace } = s, first = await save(s), other = await save(s);
  const before = await readFile(join(workspace, 'state.json'), 'utf8');
  for (const mutate of [
    a => { a.raw = 'PRIVATE'; }, a => { a.requirements.push(a.requirements[0]); },
    a => { a.ratings.push(a.ratings[0]); }, a => { a.ratings[0].id = a.requirements[0].id; },
    a => { a.requirements[0].critical = 'true'; }, a => { a.requirements[0].result = 'PRIVATE'; },
    a => { a.requirements[0].text = 'PRIVATE'; }, a => { a.ratings[0].score = 0; }, a => { a.ratings[0].score = 6; },
    a => { a.ratings[0].score = 2.5; }, a => { a.ratings[0].reason = 'x'.repeat(501); },
    a => { a.ratings[0].lowAnchor = ''; }, a => { a.ratings[0].highAnchor = 'x'.repeat(161); },
    a => { a.ratings[0].lowAnchor = 'bad\nanchor'; }, a => { a.note = 'x'.repeat(2001); },
    a => { a.note = '\u001bPRIVATE'; }, a => { a.provenance = 'grader'; },
    a => { a.requirements = Array.from({ length: 25 }, (_, i) => ({ ...a.requirements[0], id: `r${i}` })); },
    a => { a.ratings = Array.from({ length: 9 }, (_, i) => ({ ...a.ratings[0], id: `r${i}` })); },
  ]) {
    const a = structuredClone(assessment); mutate(a);
    await assert.rejects(service.saveUserRun({ workspace, reviewId: first.reviewId, assessment: a }), { kind: 'comparison-assessment-invalid' });
  }
  for (const previousRunId of [other.runId, 'f'.repeat(64), null]) await assert.rejects(service.saveUserRun({ workspace, reviewId: first.reviewId, previousRunId, assessment }), { kind: 'comparison-record-invalid' });
  for (const title of ['x'.repeat(121), 'bad\nname', null]) await assert.rejects(service.saveUserRun({ workspace, reviewId: first.reviewId, title, assessment }), { kind: 'invalid-request' });
  assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), before);
});

test('old, unknown and mismatched tasks retain only their safely projected source evidence', mac, async t => {
  const s = await setup(t), { workspace } = s;
  for (const [status, mutate] of [
    ['unqualified-record', r => { r[0].payload.timestamp = '2000-01-01T00:00:00Z'; }],
    ['unknown-record', r => { r.splice(3, 1); }],
    ['not-matched-record', r => { r[3].payload.state.agents_md.text = 'PRIVATE unrelated instructions'; }],
    ['unknown-record', r => { r[0].payload.cli_version = '0.999.0'; }],
  ]) {
    const run = await save(s, mutate);
    assert.equal(run.source.association, null);
    assert.equal(run.source.observation.status, status);
    assert.equal(run.source.issue, null);
    assert.ok(!JSON.stringify(run).includes('PRIVATE'));
    await assert.rejects(service.saveUserRunFavorite({ workspace, runId: run.runId }), { kind: 'comparison-source-unavailable' });
  }
});
test('real nullable preparation is frozen without a fabricated timestamp and remains readable after preparation', mac, async t => {
  for (const preparation of [undefined, null, { id: 'PRIVATE', preparedAt: 'PRIVATE' }]) await t.test(String(preparation), async t => {
    const s = await setup(t), { workspace } = s, path = join(workspace, 'state.json');
    const state = JSON.parse(await readFile(path, 'utf8'));
    if (preparation === undefined) delete state.preparation; else state.preparation = preparation;
    await writeFile(path, JSON.stringify(state));
    const run = await save(s);
    assert.equal(run.source.association, null);
    const privateReview = await loadRecord(workspace, 'application', run.reviewId);
    assert.equal(privateReview.sourceContext.preparation, null);
    if (preparation === undefined) {
      assert.equal(run.source.observation.status, 'unknown-record');
      assert.ok(run.source.observation.reasons.includes('preparation-boundary-unavailable'));
    } else assert.equal(run.source.issue, 'preparation-metadata-invalid');
    await prepare(s, 'unseal');
    assert.deepEqual(await service.readUserRun({ workspace, runId: run.runId }), run);
  });
});
test('source conflict and pending recovery preserve usable measurements without a new association', mac, async t => {
  for (const issue of ['source-conflict', 'recovery-required']) await t.test(issue, async t => {
    const s = await setup(t), { workspace } = s, original = await save(s);
    if (issue === 'source-conflict') await writeFile(join(s.context.codexHome, 'AGENTS.md'), 'PRIVATE independent edit');
    else await writeFile(join(workspace, 'pending.json'), '{}');
    const before = await readFile(join(workspace, 'state.json'), 'utf8');
    const run = await save(s);
    assert.equal(run.measurement.usage.totals.totalTokens, 100);
    assert.deepEqual(run.source, { association: null, observation: null, issue });
    assert.equal((await service.readUserRun({ workspace, runId: original.runId })).source.observation.status, 'matched-record');
    assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), before);
  });
});
test('changes after the selected read and observation publication suppress association without overwriting edits', mac, async t => {
  for (const phase of ['comparison-read', 'comparison-observation']) for (const change of ['source', 'preparation', 'pending']) await t.test(`${phase} ${change}`, async t => {
    const s = await setup(t), { workspace } = s;
    const statePath = join(workspace, 'state.json'), originalState = await readFile(statePath, 'utf8');
    const path = change === 'source' ? join(s.context.codexHome, 'AGENTS.md') : change === 'preparation' ? statePath : join(workspace, 'pending.json');
    const changedState = JSON.parse(originalState);
    changedState.preparation.id = 'f'.repeat(32);
    const text = change === 'source' ? 'PRIVATE independent edit during collection' : change === 'pending' ? '{}' : JSON.stringify(changedState);
    let called = false;
    setSourceTransactionTestHook(async point => { if (point === phase) { called = true; await writeFile(path, text); } });
    const run = await save(s);
    assert.equal(called, true);
    assert.equal(run.measurement.usage.totals.totalTokens, 100);
    assert.equal(run.source.association, null);
    assert.equal(run.source.issue, change === 'pending' ? 'recovery-required' : 'source-conflict');
    assert.equal(await readFile(path, 'utf8'), text);
    assert.equal(await readFile(statePath, 'utf8'), change === 'preparation' ? text : originalState);
  });
});
test('frozen review answers omit later appends and output bounds are enforced', mac, async t => {
  const s = await setup(t), { workspace } = s;
  const { taskId, path, records } = await recording(s);
  const first = await service.reviewUserRun({ workspace, taskId });
  const later = records.slice(1).filter(r => r.type !== 'world_state').map(r => structuredClone(r));
  for (const r of later) { if (r.payload.turn_id) r.payload.turn_id = 'second'; if (r.payload.root_turn_id) r.payload.root_turn_id = 'second'; if (r.payload.response_id) { r.payload.response_id = 'two'; r.payload.thread_token_usage = Object.fromEntries(Object.entries(r.payload.usage).map(([k, v]) => [k, v * 2])); } if (r.payload.type === 'task_complete') r.payload.last_agent_message = 'SECOND PRIVATE ANSWER'; }
  await writeFile(path, [...records, ...later].map(r => JSON.stringify(r)).join('\n') + '\n');
  const firstRun = await service.saveUserRun({ workspace, reviewId: first.reviewId, assessment });
  assert.equal(firstRun.measurement.availableTurns.length, 1);
  assert.equal((await service.readUserRunOutput({ workspace, runId: firstRun.runId })).text, 'PRIVATE SYNTHETIC ANSWER');
  const secondReview = await service.reviewUserRun({ workspace, taskId, throughTurnId: 'second' });
  const secondRun = await service.saveUserRun({ workspace, reviewId: secondReview.reviewId, assessment });
  assert.deepEqual(secondRun.measurement.selectedTurnIds, ['first', 'second']);
  assert.equal(secondRun.source.association.coverage, 'initial-turn-only');
  assert.equal((await service.readUserRunOutput({ workspace, runId: secondRun.runId })).text, 'SECOND PRIVATE ANSWER');
  assert.equal((await service.compareUserRuns({ workspace, runIds: [firstRun.runId, secondRun.runId] })).aggregate.totalTokens, null);
  for (const [expectedReason, mutate] of [
    ['output-missing', r => { delete r[5].payload.last_agent_message; }],
    ['output-too-large', r => { r[5].payload.last_agent_message = 'あ'.repeat(21846); }],
    ['output-turn-incomplete', r => { r.pop(); }],
  ]) {
    const run = await save(s, mutate);
    assert.deepEqual(await service.readUserRunOutput({ workspace, runId: run.runId }), { runId: run.runId, available: false, text: null, reason: expectedReason });
  }
});
test('persisted review validation rejects source-context drift, arbitrary payload and output injection', mac, async t => {
  const s = await setup(t), { workspace } = s, original = await save(s);
  const p = await loadRecord(workspace, 'application', original.reviewId);
  const before = await readFile(join(workspace, 'state.json'), 'utf8');
  for (const mutate of [
    r => { r.raw = 'PRIVATE'; }, r => { r.outputText = 'different'; }, r => { r.measurement.raw = 'PRIVATE'; },
    r => { r.sourceContext.preparation.preparedAt = 'PRIVATE'; }, r => { r.sourceContext.preparation.id = 'f'.repeat(32); },
    r => { r.sourceContext.snapshotId = 'f'.repeat(64); }, r => { r.sourceContext.normalId = 'f'.repeat(64); },
    r => { r.source.association.coverage = 'all-turns'; }, r => { r.source.association.normalId = 'f'.repeat(64); },
    r => { r.source.association = null; }, r => { r.scopeId = 'f'.repeat(64); }, r => { r.source.observationId = 'f'.repeat(64); },
    r => { r.collectedOn.secret = 'PRIVATE'; }, r => { r.sourceContext.preparation = null; },
  ]) {
    const bad = structuredClone(p); mutate(bad);
    const reviewId = await record(workspace, 'application', bad);
    await assert.rejects(service.saveUserRun({ workspace, reviewId, assessment }), { kind: 'comparison-record-invalid' });
  }
  const other = await setup(t);
  await assert.rejects(service.saveUserRun({ workspace: other.workspace, reviewId: original.reviewId, assessment }), { kind: 'comparison-record-invalid' });
  assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), before);
});

test('role-filtered pagination advances through full pages of non-run observations and caps run summaries', mac, async t => {
  const s = await setup(t), { workspace } = s, original = await save(s);
  const { recordId } = await import('../src/core/local-store.mjs');
  const p = await loadRecord(workspace, 'observation', original.runId);
  let title = 0, late;
  do { late = { ...p, title: `Late ${title++}` }; } while (!recordId('observation', late).startsWith('ff') || recordId('observation', late) <= original.runId);
  const lateId = await record(workspace, 'observation', late);
  for (let i = 0, count = 0; count < 1001; i++) {
    const payload = { kind: 'unharness-user-source', role: 'synthetic-other-role', n: i };
    const id = recordId('observation', payload);
    if (id > original.runId && id < lateId) { await record(workspace, 'observation', payload); count++; }
  }
  const page = await service.listUserRuns({ workspace, after: original.runId });
  assert.deepEqual(page.runs.map(r => r.runId), [lateId]);
  assert.equal(page.nextCursor, null);
  for (let i = 0; i < 21; i++) await service.saveUserRun({ workspace, reviewId: original.reviewId, assessment, title: `Version ${i}` });
  const seen = [], cursors = new Set();
  let after;
  do {
    const p = await service.listUserRuns({ workspace, ...(after === undefined ? {} : { after }) });
    assert.ok(p.runs.length <= 20);
    seen.push(...p.runs.map(r => r.runId));
    after = p.nextCursor;
    if (after !== null) { assert.equal(cursors.has(after), false); cursors.add(after); }
  } while (after !== null);
  assert.equal(new Set(seen).size, 23);
  assert.equal(seen.length, 23);
});
test('corrupt optional comparisons do not disable status, preparation or offline recovery', mac, async t => {
  const s = await setup(t), { workspace } = s, run = await save(s);
  await writeFile(join(workspace, 'records', 'application', `${run.reviewId}.json`), 'PRIVATE corrupt comparison');
  await assert.rejects(service.readUserRun({ workspace, runId: run.runId }), { kind: 'comparison-record-invalid' });
  assert.equal((await service.userSourceState({ workspace })).conflict, null);
  await prepare(s, 'trueform');
  const recovered = await service.recoverUserSources({ workspace });
  assert.equal(recovered.status, 'nothing-pending');
  await prepare(s, 'normal');
  assert.equal((await service.userSourceState({ workspace })).preparedMode, 'normal');
});
test('selected task, project, cutoff and run references reject safely before exposing content', mac, async t => {
  const s = await setup(t), { workspace } = s;
  const one = await recording(s, r => { r[0].payload.cwd = '/PRIVATE-OTHER-PROJECT'; });
  await assert.rejects(service.reviewUserRun({ workspace, taskId: one.taskId }), { kind: 'comparison-run-project-mismatch' });
  const two = await recording(s, r => { r[0].payload.id = randomUUID(); });
  await assert.rejects(service.reviewUserRun({ workspace, taskId: two.taskId }), { kind: 'comparison-run-task-mismatch' });
  const three = await recording(s);
  await assert.rejects(service.reviewUserRun({ workspace, taskId: three.taskId, throughTurnId: 'missing' }), { kind: 'comparison-run-cutoff-invalid' });
  await assert.rejects(service.reviewUserRun({ workspace, taskId: randomUUID() }), { kind: 'comparison-task-record-unavailable' });
  for (const runIds of [[], ['a'], Array(4).fill('f'.repeat(64)), ['f'.repeat(64), 'f'.repeat(64)]]) await assert.rejects(service.compareUserRuns({ workspace, runIds }), { kind: 'invalid-request' });
  await assert.rejects(service.readUserRun({ workspace, runId: 'f'.repeat(64) }), { kind: 'comparison-record-invalid' });
  await assert.rejects(service.listUserRuns({ workspace, after: '../PRIVATE' }), { kind: 'invalid-request' });
});
test('critical failures block accepted counting; valid zero totals stay zero and overflow stays unknown', mac, async t => {
  const s = await setup(t), { workspace } = s;
  const failed = await save(s, undefined, { ...assessment, requirements: [{ ...assessment.requirements[0], result: 'fail' }] });
  assert.equal(failed.acceptance.criticalFailed, 1);
  assert.equal(failed.acceptance.accepted, false);
  const zero = await save(s, r => { for (const key of ['usage', 'turn_token_usage', 'thread_token_usage']) r[4].payload[key] = Object.fromEntries(Object.keys(r[4].payload[key]).map(k => [k, 0])); });
  const a = (await service.compareUserRuns({ workspace, runIds: [zero.runId] })).aggregate;
  assert.equal(a.totalTokens, 0);
  assert.equal(a.tokensPerAcceptedRun, 0);
  const max = r => { for (const key of ['usage', 'turn_token_usage', 'thread_token_usage']) r[4].payload[key].total_tokens = Number.MAX_SAFE_INTEGER; };
  const one = await save(s, max), two = await save(s, max);
  const b = (await service.compareUserRuns({ workspace, runIds: [one.runId, two.runId] })).aggregate;
  assert.equal(b.totalTokens, null);
  assert.ok(b.reasons.includes('usage-total-overflow'));
});

test('malformed metadata remains a safely unavailable measurement for the explicitly selected UUID', mac, async t => {
  const s = await setup(t), { workspace } = s;
  for (const mutate of [r => { r.shift(); }, r => { delete r[0].payload.id; }, r => { r.push(structuredClone(r[0])); }]) {
    const { taskId } = await recording(s, mutate);
    const review = await service.reviewUserRun({ workspace, taskId });
    assert.equal(review.measurement.taskId, taskId);
    assert.equal(review.measurement.usage.availability, 'unavailable');
    assert.equal(review.source.association, null);
    assert.equal(review.source.observation.taskId, taskId);
  }
});
test('frozen preparation timestamp cannot contradict a matched task and correction ancestors are validated', mac, async t => {
  const s = await setup(t), { workspace } = s, first = await save(s), other = await save(s);
  const review = await loadRecord(workspace, 'application', first.reviewId);
  review.sourceContext.preparation.preparedAt = '2999-01-01T00:00:00Z';
  const reviewId = await record(workspace, 'application', review);
  await assert.rejects(service.saveUserRun({ workspace, reviewId, assessment }), { kind: 'comparison-record-invalid' });
  const p = await loadRecord(workspace, 'observation', first.runId);
  const invalidParent = await record(workspace, 'observation', { ...p, previousRunId: other.runId });
  const runId = await record(workspace, 'observation', { ...p, previousRunId: invalidParent });
  await assert.rejects(service.readUserRun({ workspace, runId }), { kind: 'comparison-record-invalid' });
});
