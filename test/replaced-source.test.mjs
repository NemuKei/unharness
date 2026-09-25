import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rename, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { openWorkspace, record, loadNormal, loadSnapshot } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startGuiServer } from '../src/gui/server.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { reviewedEnrollmentTransition } from '../web/src/source-operations.ts';

const mac = { skip: process.platform !== 'darwin' };
async function fixture(t) {
  const p = await aiProfile(t);
  t.after(() => setSourceTransactionTestHook(null));
  const setup = await readSetup({ workspace: p.workspace, schemaVersion: 3 });
  const ids = setup.inventory.skills.map(s => s.id);
  const proposal = { schemaVersion: 3, scopeId: p.scopeId, normalId: p.normalId, inventoryId: setup.inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Synthetic reference', checkedAt: '2026-09-25T00:00:00Z' }],
      rationale: 'Synthetic TRUEFORM preparation' },
    roles: ids.map(sourceId => ({ sourceId, origin: 'self', reason: 'Owned synthetic Skill' })),
    trueform: { skillStates: ids.map(sourceId => ({ sourceId, state: 'manual' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: 'minimal', skillElevations: ids.map(sourceId => ({ sourceId, state: 'automatic' })), additionalPluginIds: [] } };
  const reviewed = await reviewSetup({ workspace: p.workspace, proposal });
  await applySetup({ workspace: p.workspace, reviewId: reviewed.reviewId });
  const plan = await sources.planUserMode({ workspace: p.workspace, mode: 'trueform' });
  await sources.applyUserPlan({ workspace: p.workspace, planId: plan.planId });
  const old = await openWorkspace(p.workspace);
  const skill = old.reg.skills[0], directory = join(skill.path, '..');
  const body = await readFile(skill.path);
  const favorite = await sources.saveUserFavorite({ workspace: p.workspace, name: 'Earlier TRUEFORM' });
  const evidenceId = await record(p.workspace, 'observation', { role: 'synthetic-evidence', schemaVersion: 1, scopeId: old.scopeId, value: 'frozen' });
  const paths = [join(p.workspace, 'records', 'scope', `${old.scopeId}.json`),
    join(p.workspace, 'records', 'observation', `${old.reg.normalId}.json`),
    join(p.workspace, 'records', 'observation', `${old.state.snapshotId}.json`),
    join(p.workspace, 'records', 'favorite', `${favorite.favoriteId}.json`),
    join(p.workspace, 'records', 'observation', `${evidenceId}.json`)];
  const frozen = await Promise.all(paths.map(path => readFile(path)));
  return { ...p, old, skill, directory, body, paths, frozen, proposal };
}
async function replace(s, body = s.body) {
  await rename(s.directory, s.directory + '-previous');
  await mkdir(s.directory);
  await writeFile(s.skill.path, body, { mode: 0o600 });
}
async function unchangedHistory(s) {
  for (let i = 0; i < s.paths.length; i++) assert.deepEqual(await readFile(s.paths[i]), s.frozen[i]);
}

test('same Skill body gets a new directory generation; missing TRUEFORM policy stays missing until a new switch', mac, async t => {
  const s = await fixture(t);
  await replace(s);
  const status = await sources.userSourceState({ workspace: s.workspace });
  assert.equal(status.conflict.kind, 'source-replaced');
  assert.equal(status.conflict.sourceId, s.skill.id);
  assert.equal(status.conflict.label, s.skill.label);
  const review = await sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id });
  assert.equal(review.bodyChanged, false);
  assert.ok(review.missingPreparedFiles.length > 0);
  assert.equal(await readFile(s.skill.path, 'utf8'), s.body.toString());
  const currentFiles = await readSourceProfileFiles(s.context);
  const applied = await sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId, confirmedNewLocation: true });
  assert.equal(applied.modeChangeRequired, true);
  assert.equal((await sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId,
    confirmedNewLocation: true })).duplicate, true);
  const now = await openWorkspace(s.workspace);
  assert.notEqual(now.scopeId, s.old.scopeId);
  assert.equal(now.reg.skills[0].id, s.skill.id);
  assert.equal(now.state.scopePreparationRequired, true);
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).conflict, null);
  assert.deepEqual(await readSourceProfileFiles(s.context), currentFiles);
  await unchangedHistory(s);
  const normal = await sources.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await sources.applyUserPlan({ workspace: s.workspace, planId: normal.planId });
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).preparedMode, 'normal');
  const nextSetup = await readSetup({ workspace: s.workspace, schemaVersion: 3 });
  const proposal = { ...s.proposal, scopeId: now.scopeId, normalId: now.reg.normalId,
    inventoryId: nextSetup.inventory.inventoryId };
  const reviewed = await reviewSetup({ workspace: s.workspace, proposal });
  await applySetup({ workspace: s.workspace, reviewId: reviewed.reviewId });
  const prepared = await sources.planUserMode({ workspace: s.workspace, mode: 'trueform' });
  await sources.applyUserPlan({ workspace: s.workspace, planId: prepared.planId });
  const ready = await sources.userSourceState({ workspace: s.workspace });
  assert.equal(ready.preparedMode, 'trueform');
  assert.equal(ready.registration.modeChangeRequired, false);
  assert.match(await readFile(join(s.directory, 'agents', 'openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
});

test('changed Skill body requires its own confirmation and creates a successor Normal without changing old records', mac, async t => {
  const s = await fixture(t);
  await replace(s, Buffer.from(s.body.toString().replace('PRIVATE_TEST Skill body.', 'PRIVATE_TEST revised Skill body.')));
  const review = await sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id });
  assert.equal(review.bodyChanged, true);
  assert.match(review.body, /revised Skill body/);
  await assert.rejects(sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId,
    confirmedNewLocation: true }), { kind: 'replaced-source-confirmation-required' });
  await assert.rejects(sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId,
    confirmedNewLocation: false, confirmedChangedContent: true }), { kind: 'replaced-source-confirmation-required' });
  const applied = await sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId,
    confirmedNewLocation: true, confirmedChangedContent: true });
  assert.equal(applied.modeChangeRequired, true);
  const now = await openWorkspace(s.workspace);
  assert.notEqual(now.reg.skills[0].id, s.skill.id);
  assert.notEqual(now.reg.normalId, s.old.reg.normalId);
  await unchangedHistory(s);
});

test('a copied TRUEFORM policy remains current evidence but never becomes successor Normal', mac, async t => {
  const s = await fixture(t);
  const policyPath = join(s.directory, 'agents', 'openai.yaml');
  const oldPolicy = await readFile(policyPath);
  await replace(s);
  await mkdir(join(s.directory, 'agents'));
  await writeFile(policyPath, oldPolicy, { mode: 0o600 });
  const review = await sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id });
  assert.deepEqual(review.missingPreparedFiles, []);
  await sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId, confirmedNewLocation: true });
  const now = await openWorkspace(s.workspace);
  const normal = await loadNormal(s.workspace, now.reg);
  const observed = await loadSnapshot(s.workspace, now.reg, now.state.snapshotId, 2);
  assert.equal(normal[now.reg.skills[0].id + ':policy'], null);
  assert.equal(observed[now.reg.skills[0].id + ':policy'].text, oldPolicy.toString());
  await unchangedHistory(s);
});

test('symlink replacement remains source-redirection', mac, async t => {
  const s = await fixture(t);
  await rename(s.directory, s.directory + '-previous');
  await symlink(s.directory + '-previous', s.directory);
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).conflict.kind, 'source-redirection');
  await assert.rejects(sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id }),
    { kind: 'source-redirection' });
});

test('a healthy registered Skill has no replacement review to adopt', mac, async t => {
  const s = await fixture(t);
  await assert.rejects(sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id }),
    { kind: 'replaced-source-unavailable' });
});

test('a file at the registered Skill folder remains source-redirection', mac, async t => {
  const s = await fixture(t);
  await rename(s.directory, s.directory + '-previous');
  await writeFile(s.directory, 'not a directory');
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).conflict.kind, 'source-redirection');
  await assert.rejects(sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id }),
    { kind: 'source-redirection' });
});

test('a legacy registration can adopt a replacement without rewriting its original Normal', mac, async t => {
  const s = await aiProfile(t), previous = await openWorkspace(s.workspace);
  const skill = previous.reg.skills[0], directory = join(skill.path, '..'), body = await readFile(skill.path);
  const oldNormalPath = join(s.workspace, 'records', 'observation', `${previous.reg.normalId}.json`);
  const oldNormal = await readFile(oldNormalPath);
  await rename(directory, directory + '-previous'); await mkdir(directory);
  await writeFile(skill.path, body, { mode: 0o600 });
  const review = await sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: skill.id });
  await sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId, confirmedNewLocation: true });
  assert.notEqual((await openWorkspace(s.workspace)).scopeId, previous.scopeId);
  assert.deepEqual(await readFile(oldNormalPath), oldNormal);
});

test('a second folder replacement after review is stale and preserves the earlier generation', mac, async t => {
  const s = await fixture(t);
  await replace(s);
  const review = await sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id });
  await rename(s.directory, s.directory + '-second');
  await mkdir(s.directory);
  await writeFile(s.skill.path, s.body, { mode: 0o600 });
  await assert.rejects(sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId,
    confirmedNewLocation: true }), { kind: 'stale-review' });
  assert.equal((await openWorkspace(s.workspace)).scopeId, s.old.scopeId);
  await unchangedHistory(s);
});

for (const phase of ['replaced-source-journal', 'replaced-source-manifest', 'replaced-source-state'])
test(`interrupted adoption at ${phase} cancels without replacing the external Skill`, mac, async t => {
  const s = await fixture(t);
  await replace(s);
  const review = await sources.reviewUserReplacedSource({ workspace: s.workspace, sourceId: s.skill.id });
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('synthetic interruption'); });
  await assert.rejects(sources.applyUserReplacedSource({ workspace: s.workspace, reviewId: review.reviewId,
    confirmedNewLocation: true }));
  setSourceTransactionTestHook(null);
  const recovered = await sources.recoverUserSources({ workspace: s.workspace });
  assert.equal(recovered.status, 'replaced-source-recording-cancelled');
  assert.equal((await openWorkspace(s.workspace)).scopeId, s.old.scopeId);
  assert.deepEqual(await readFile(s.skill.path), s.body);
  await unchangedHistory(s);
});

test('management Skill asks for new-content confirmation before re-registration and fresh TRUEFORM preparation', async () => {
  const guidance = await readFile(resolve('skills/unharness/SKILL.md'), 'utf8');
  for (const expected of ['source-replaced', 'review_replaced_source', 'apply_replaced_source',
    'confirmedNewLocation', 'confirmedChangedContent', '零式を準備し直す']) assert.ok(guidance.includes(expected), expected);
});

test('MCP review and approval share the guarded successor path', mac, async t => {
  const s = await fixture(t);
  await replace(s);
  const ai = await fixtureAiClient(t, s.workspace);
  const review = await ai.mutate('review_replaced_source', { sourceId: s.skill.id });
  assert.equal(review.bodyChanged, false);
  const applied = await ai.mutate('apply_replaced_source', { reviewId: review.reviewId, confirmedNewLocation: true });
  assert.equal(applied.nextScopeId, review.nextScopeId);
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).registration.modeChangeRequired, true);
});

test('local HTTP review and approval return a new accepted scope without changing source bytes', mac, async t => {
  const s = await fixture(t);
  await replace(s);
  const assetsDirectory = join(s.parent, 'synthetic-ui');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: s.context, assetsDirectory });
  t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  const token = (await (await fetch(gui.url + '/api/bootstrap', { headers })).json()).token;
  headers['X-Unharness-Token'] = token;
  const metadata = await (await fetch(gui.url + '/api/sources/metadata', { headers })).json();
  const accepted = await (await fetch(gui.url + '/api/sources/state', { headers })).json();
  const post = async (action, input) => {
    const response = await fetch(gui.url + '/api/sources/' + action, { method: 'POST', headers,
      body: JSON.stringify({ requestId: randomUUID(), launchId: metadata.launchId, contextId: metadata.contextId, ...input }) });
    assert.equal(response.status, 200, action);
    return response.json();
  };
  const review = (await post('review-replaced-source', { sourceId: s.skill.id })).result;
  const sourceBefore = await readSourceProfileFiles(s.context);
  const applied = await post('apply-replaced-source', { reviewId: review.reviewId, confirmedNewLocation: true });
  assert.equal(applied.result.nextScopeId, review.nextScopeId);
  assert.equal(applied.state.source.registration.scopeId, review.nextScopeId);
  assert.equal(applied.state.source.registration.modeChangeRequired, true);
  assert.equal(reviewedEnrollmentTransition(accepted, { reviewId: review.reviewId, nextScopeId: review.nextScopeId },
    { status: 'completed', result: applied.result, state: applied.state }), true);
  assert.deepEqual(await readSourceProfileFiles(s.context), sourceBefore);
});
