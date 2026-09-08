import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const replay = await import('../src/experiments/replay-service.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const mac = { skip: process.platform !== 'darwin' };
const declaration = { request: '  PRIVATE exact request\n\nUse frozen inputs.  ',
 requirements: [{ id: 'complete', label: 'Complete the declared task', critical: true }], ratings: [],
 budget: { maxAttempts: 2, maxTurnsPerAttempt: 3, maxRecordedTokens: 4000 } };
const git = (project, args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false', ...args], { cwd: project, stdio: 'pipe' });
async function fixture(t, { repository = false } = {}) {
 const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-replay-attempts-')));
 t.after(() => rm(parent, { recursive: true, force: true })); t.after(() => setSourceTransactionTestHook(null));
 const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
 await writeFile(join(owned.context.codexHome, 'replay-native-fixture.json'), '{}');
 const d = await sources.discoverUserSources(owned.context);
 const reg = await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId, instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
 await writeFile(join(owned.context.project, 'work.txt'), 'Frozen original\n');
 if (repository) {
  git(owned.context.project, ['init', '--template=']); git(owned.context.project, ['add', '.']);
  git(owned.context.project, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Replay input']);
 }
 const reviewed = await sources.reviewUserStart({ workspace: reg.workspace, declaration });
 const start = await sources.saveUserStart({ workspace: reg.workspace, reviewId: reviewed.reviewId });
 return { ...owned, ...reg, parent, startId: start.startId };
}
async function review(f, extra = {}) {
 assert.equal(typeof replay.reviewUserReplay, 'function');
 return replay.reviewUserReplay({ workspace: f.workspace, startId: f.startId, ...extra });
}
async function prepare(f) { const r = await review(f); return replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId }); }
const rows = f => replay.listUserReplays({ workspace: f.workspace });
test('review is private preparation only; prepare, restart and duplicate bind one owned attempt to exact frozen inputs', mac, async t => {
 const f = await fixture(t), before = await readSourceProfileFiles(f.context), r = await review(f);
 assert.equal(r.preparedMode, 'normal'); assert.equal(r.phase, 'reviewed');
 assert.equal(JSON.stringify(r).includes('PRIVATE exact'), false);
 assert.equal((await rows(f)).attempts.length, 0);
 await writeFile(join(f.context.project, 'work.txt'), 'Independent original edit\n');
 const p = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId });
 assert.equal(p.phase, 'prepared'); assert.equal(p.desktopRuntimeVerified, false); assert.equal(p.readyAt, null);
 const duplicate = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId });
 assert.equal(duplicate.attemptId, p.attemptId); assert.equal(duplicate.duplicate, true);
 const handoff = await replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
 assert.equal(handoff.request, declaration.request); assert.equal(handoff.phase, 'ready');
 assert.ok(handoff.project.startsWith(join(f.workspace, 'replays') + '/'));
 assert.equal(await readFile(join(handoff.project, 'work.txt'), 'utf8'), 'Frozen original\n');
 assert.equal(await readFile(join(f.context.project, 'work.txt'), 'utf8'), 'Independent original edit\n');
 assert.equal((await replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId })).readyAt, handoff.readyAt);
 assert.equal((await rows(f)).activeAttemptId, p.attemptId);
 assert.deepEqual(await readSourceProfileFiles(f.context), before);
});
test('a second active attempt is refused and cancellation preserves files without claiming to stop a task', mac, async t => {
 const f = await fixture(t), a = await review(f), b = await review(f);
 const p = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: a.reviewId });
 await assert.rejects(replay.prepareUserReplay({ workspace: f.workspace, reviewId: b.reviewId }), { kind: 'replay-active-attempt' });
 const h = await replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
 await writeFile(join(h.project, 'work.txt'), 'Attempt result\n');
 const c = await replay.cancelUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
 assert.equal(c.phase, 'cancelled'); assert.equal(c.desktopTaskStopped, false);
 assert.equal(await readFile(join(h.project, 'work.txt'), 'utf8'), 'Attempt result\n');
 assert.equal((await rows(f)).activeAttemptId, null);
 const next = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: b.reviewId });
 assert.notEqual(next.attemptId, p.attemptId);
 assert.equal((await rows(f)).attempts.length, 2);
});
test('callers cannot override project, scope, requested mode, timestamps or request text', mac, async t => {
 const f = await fixture(t);
 for (const extra of [{ project: f.parent }, { scopeId: 'a'.repeat(64) }, { mode: 'trueform' }, { preparedAt: '2020-01-01T00:00:00.000Z' }, { request: 'changed' }])
  await assert.rejects(review(f, extra), { kind: 'invalid-request' });
});
test('mode changes and independent registered-source edits invalidate reviewed preparation and pending handoffs', mac, async t => {
 const f = await fixture(t), r = await review(f);
 const mode = await sources.planUserMode({ workspace: f.workspace, mode: 'unseal' });
 await sources.applyUserPlan({ workspace: f.workspace, planId: mode.planId });
 await assert.rejects(replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId }), { kind: 'replay-preparation-stale' });
 const p = await prepare(f);
 await writeFile(join(f.context.codexHome, 'AGENTS.override.md'), 'Independent edit');
 await assert.rejects(replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId }), { kind: 'source-conflict' });
 assert.equal((await replay.readUserReplay({ workspace: f.workspace, attemptId: p.attemptId })).conditionIssue, 'source-conflict');
 assert.equal((await replay.cancelUserReplay({ workspace: f.workspace, attemptId: p.attemptId })).phase, 'cancelled');
});
test('changed retained guidance and native conditions after review block materialization', mac, async t => {
 const f = await fixture(t), r = await review(f);
 await writeFile(join(f.context.project, 'AGENTS.md'), 'Changed project guidance');
 await assert.rejects(replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId }), { kind: 'replay-retained-conditions-changed' });
 assert.equal((await rows(f)).attempts.length, 0);
});
test('changed or additional starting files after preparation prevent request handoff', mac, async t => {
 const f = await fixture(t), p = await prepare(f);
 const detail = await replay.readUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
 await writeFile(join(detail.project, 'new-input.txt'), 'Unexpected extra file');
 await assert.rejects(replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId }), { kind: 'replay-destination-changed' });
 assert.equal((await replay.readUserReplay({ workspace: f.workspace, attemptId: p.attemptId })).readyAt, null);
});
test('failed materialization remains distinct; its duplicate never resumes writes in a partial destination', mac, async t => {
 const f = await fixture(t), r = await review(f);
 setSourceTransactionTestHook(phase => { if (phase === 'replay-materialize-file') throw Error('synthetic interruption'); });
 await assert.rejects(replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId }), { kind: 'replay-materialization-incomplete' });
 setSourceTransactionTestHook(null);
 const duplicate = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId });
 assert.equal(duplicate.phase, 'preparation-failed'); assert.equal(duplicate.duplicate, true);
 assert.equal((await rows(f)).activeAttemptId, null);
 assert.ok((await readdir(join(f.workspace, 'replays'))).length >= 2);
});
test('lost reservation response leaves one preparing attempt that can be inspected and cancelled after restart', mac, async t => {
 const f = await fixture(t), r = await review(f);
 setSourceTransactionTestHook(phase => { if (phase === 'replay-attempt-reserved') throw Error('lost response'); });
 await assert.rejects(replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId }), { kind: 'replay-publication-uncertain' });
 setSourceTransactionTestHook(null);
 const duplicate = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId });
 assert.equal(duplicate.phase, 'preparing'); assert.equal(duplicate.duplicate, true);
 assert.equal((await rows(f)).activeAttemptId, duplicate.attemptId);
 assert.equal((await replay.cancelUserReplay({ workspace: f.workspace, attemptId: duplicate.attemptId })).phase, 'cancelled');
});
test('an uncertain readiness publication can be read back without creating a second attempt or replacing its readiness time', mac, async t => {
 const f = await fixture(t), p = await prepare(f);
 let publication = false;
 setSourceTransactionTestHook(phase => { if (phase === 'replay-index-published') { publication = true; throw Error('response lost'); } });
 await assert.rejects(replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId }), { kind: 'replay-publication-uncertain' });
 setSourceTransactionTestHook(null); assert.equal(publication, true);
 const read = await replay.readUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
 assert.equal(read.phase, 'ready'); assert.ok(read.readyAt);
 assert.equal((await replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId })).readyAt, read.readyAt);
});
test('cancelled handoffs still consume the declared attempt budget; preparatory failures do not', mac, async t => {
 const f = await fixture(t);
 for (let i = 0; i < 2; i++) {
  const p = await prepare(f); await replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
  await replay.cancelUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
 }
 const p = await prepare(f);
 await assert.rejects(replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId }), { kind: 'replay-attempt-budget-exhausted' });
});
test('optional replay index corruption never blocks independent source status or deterministic configuration recovery', mac, async t => {
 const f = await fixture(t); await prepare(f);
 await writeFile(join(f.workspace, 'replay-index.json'), '{corrupt');
 await assert.rejects(rows(f), { kind: 'replay-record-invalid' });
 const state = await sources.userSourceState({ workspace: f.workspace });
 assert.equal(state.preparedMode, 'normal');
 assert.equal((await sources.recoverUserSources({ workspace: f.workspace })).status, 'nothing-pending');
});

test('cancelling an older failed preparation preserves a newer active attempt', mac, async t => {
 const f = await fixture(t), r = await review(f);
 setSourceTransactionTestHook(phase => { if (phase === 'replay-materialize-file') throw Error('interruption'); });
 await assert.rejects(replay.prepareUserReplay({ workspace: f.workspace, reviewId: r.reviewId }));
 setSourceTransactionTestHook(null);
 const newer = await prepare(f);
 await replay.cancelUserReplay({ workspace: f.workspace, attemptId: r.reviewId });
 assert.equal((await rows(f)).activeAttemptId, newer.attemptId);
});

test('a source edit during readiness publication is detected before returning the frozen request', mac, async t => {
 const f = await fixture(t), p = await prepare(f);
 setSourceTransactionTestHook(async phase => {
  if (phase === 'replay-index-staged') await writeFile(join(f.context.codexHome, 'AGENTS.md'), 'Independent late edit');
 });
 await assert.rejects(replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId }), { kind: 'source-conflict' });
 setSourceTransactionTestHook(null);
 assert.equal((await replay.readUserReplay({ workspace: f.workspace, attemptId: p.attemptId })).conditionIssue, 'source-conflict');
});

test('changed replay Git HEAD or index flags block handoff without resetting independent edits', mac, async t => {
 for (const mutation of [['checkout', '-b', 'independent-branch'], ['update-index', '--assume-unchanged', 'work.txt']]) {
  const f = await fixture(t, { repository: true }), p = await prepare(f);
  const detail = await replay.readUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
  git(detail.project, mutation);
  await assert.rejects(replay.handoffUserReplay({ workspace: f.workspace, attemptId: p.attemptId }), { kind: 'replay-git-state-changed' });
  assert.equal(await readFile(join(detail.project, 'work.txt'), 'utf8'), 'Frozen original\n');
 }
});

test('later attempts reuse the series pinned commit after the original project advances', mac, async t => {
 const f = await fixture(t, { repository: true }), first = await review(f);
 const p = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: first.reviewId });
 await replay.cancelUserReplay({ workspace: f.workspace, attemptId: p.attemptId });
 await writeFile(join(f.context.project, 'work.txt'), 'New independent commit');
 git(f.context.project, ['add', 'work.txt']);
 git(f.context.project, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Independent advancement']);
 const next = await review(f);
 assert.equal(next.gitRevision, first.gitRevision); assert.equal(next.gitPinnedAt, first.gitPinnedAt);
 const prepared = await replay.prepareUserReplay({ workspace: f.workspace, reviewId: next.reviewId });
 const h = await replay.handoffUserReplay({ workspace: f.workspace, attemptId: prepared.attemptId });
 assert.equal(git(h.project, ['rev-parse', 'HEAD']).toString().trim(), first.gitRevision);
 assert.equal(await readFile(join(h.project, 'work.txt'), 'utf8'), 'Frozen original\n');
});

test('a missing replay index is unknown history, not an empty scope that admits a second active preparation', mac, async t => {
 const f = await fixture(t); await prepare(f);
 await rm(join(f.workspace, 'replay-index.json'));
 await assert.rejects(review(f), { kind: 'replay-record-invalid' });
 assert.equal((await sources.userSourceState({ workspace: f.workspace })).preparedMode, 'normal');
});
