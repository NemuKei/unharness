import nativeTest from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm, rename, cp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import { openWorkspace, activeNormalId, loadSnapshot, readJson, loadRecord, record, saveSnapshot } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { registerLegacySourceProfile } from '../test-support/legacy-source-registration.mjs';
import * as enrollment from '../src/setup/plugin-enrollment.mjs';
import { pluginEnrollmentRegistration } from '../src/setup/plugin-enrollment-records.mjs';
const test = (name, fn) => nativeTest(name, { skip: process.platform !== 'darwin' }, fn);
const id = name => name + '@openai-curated-remote';

async function fixture(t, { selectors = [true], setup = false, legacyRevision } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-plugin-enrollment-')));
  t.after(async () => { setSourceTransactionTestHook(null); await rm(parent, { recursive: true, force: true }); });
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test/fixtures/plugin-enrollment-server.mjs') });
  const names = selectors.map((_, i) => 'fixture-plugin-' + (i + 1));
  await writeFile(join(owned.context.codexHome, '.fixture-plugins.json'), JSON.stringify({ names }));
  const config = join(owned.context.codexHome, 'config.toml');
  await writeFile(config, await readFile(config, 'utf8') + names.map((name, i) => selectors[i] === null ? ''
    : '\n[plugins."' + id(name) + '"]\nenabled = ' + selectors[i] + '\n').join(''));
  for (const name of names) {
    const root = join(owned.context.codexHome, 'plugins/cache/openai-curated-remote', name, '1.2.3');
    await mkdir(join(root, '.codex-plugin'), { recursive: true });
    await mkdir(join(root, 'skills/fixture'), { recursive: true });
    await writeFile(join(root, '.codex-plugin/plugin.json'), JSON.stringify({ name, version: '1.2.3', skills: './skills/' }));
    await writeFile(join(root, 'skills/fixture/SKILL.md'), '# Fixture\nA local fixture.\n');
  }
  const d = await sources.discoverUserSources(owned.context);
  const registered = legacyRevision ? await registerLegacySourceProfile({ parent, context: owned.context, revision: legacyRevision })
    : await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
      instructionsOptional: true, selectedSkillIds: d.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  if (setup) {
    const { readSetup, reviewSetup, applySetup } = await import('../src/setup/service.mjs');
    const w = await openWorkspace(registered.workspace);
    let proposal = { schemaVersion: 1, scopeId: w.scopeId, normalId: activeNormalId(w),
      basis: { application: 'codex', modelId: 'gpt-6-astra', modelSource: 'user-specified', desktopVersion: null,
        runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model',
          title: 'Official model guidance', checkedAt: '2026-09-09T00:00:00.000Z' }], rationale: 'Synthetic comparison.' },
      roles: w.reg.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Confirmed synthetic source.' })),
      unseal: { instructions: 'minimal', automaticSkillIds: [] }, trueform: { automaticExternalSkillIds: [] } };
    if (setup === 2) {
      const saved = await readSetup({ workspace: registered.workspace, schemaVersion: 2 });
      proposal = { ...proposal, schemaVersion: 2, inventoryId: saved.inventory.inventoryId,
        unseal: { instructions: 'minimal', additionalAutomaticSkillIds: [] }, trueform: { retainedOfficialPluginIds: [] } };
    } else if (setup === 3) {
      const saved = await readSetup({ workspace: registered.workspace, schemaVersion: 3 });
      proposal = { ...proposal, schemaVersion: 3, inventoryId: saved.inventory.inventoryId,
        trueform: { skillStates: w.reg.skills.map(s => ({ sourceId: s.id, state: 'manual' })), retainedOfficialPluginIds: [] },
        unseal: { instructions: 'minimal', skillElevations: [], additionalPluginIds: [] } };
    }
    const p = await reviewSetup({ workspace: registered.workspace, proposal });
    await applySetup({ workspace: registered.workspace, reviewId: p.reviewId });
    const mode = await sources.planUserMode({ workspace: registered.workspace, mode: 'unseal' });
    await sources.applyUserPlan({ workspace: registered.workspace, planId: mode.planId });
  }
  return { ...owned, ...registered, parent, names };
}
const request = (s, i = 0) => ({ pluginId: id(s.names[i]), origin: 'external', reason: 'User confirmed this optional plugin.', optional: true });
async function review(s, i = 0) {
  const inventory = await enrollment.inspectPluginEnrollment({ workspace: s.workspace });
  return enrollment.reviewPluginEnrollment({ workspace: s.workspace, discoveryId: inventory.discoveryId, additions: [request(s, i)] });
}

for (const setup of [false, true, 2, 3]) test('plugin-only enrollment preserves source bytes and Normal with previous setup ' + setup, async t => {
  assert.equal(typeof enrollment.inspectPluginEnrollment, 'function');
  const s = await fixture(t, { setup });
  const before = await openWorkspace(s.workspace), normal = await loadSnapshot(s.workspace, before.reg, activeNormalId(before));
  const bytes = await readSourceProfileFiles(s.context), reservation = await readFile(join(before.owner, 'reservation.json'));
  const p = await review(s);
  assert.equal(p.sourceFilesChanged, 0);
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  const result = await enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
  const next = await openWorkspace(s.workspace);
  assert.notEqual(next.scopeId, before.scopeId);
  assert.equal(next.reg.role, 'registration-controls-v3');
  assert.equal(next.reg.controlSchemaVersion, 3);
  assert.equal(next.reg.pluginEnrollmentReviewId, p.reviewId);
  assert.equal(next.reg.parentScopeId, before.scopeId);
  assert.deepEqual(next.reg.bindings, before.reg.bindings);
  assert.deepEqual(next.reg.skills, before.reg.skills);
  assert.deepEqual(next.reg.instructions, before.reg.instructions);
  assert.equal(next.reg.plugins[0].id, id(s.names[0]));
  assert.equal(next.reg.plugins[0].normalSelector, true);
  assert.equal((await loadRecord(s.workspace, 'input', next.reg.plugins[0].dependencyId)).role, 'plugin-dependency');
  assert.equal(next.state.setupId, null);
  assert.equal(next.state.setupSchemaVersion, 3);
  assert.equal(next.state.scopePreparationRequired, true);
  assert.equal(next.state.preparedMode, before.state.preparedMode);
  assert.equal(next.state.preparedSetupId, before.state.preparedSetupId);
  assert.deepEqual(next.manifest, { schemaVersion: 3, rootScopeId: before.rootScopeId });
  assert.deepEqual(await loadSnapshot(s.workspace, next.reg, activeNormalId(next)), normal);
  assert.deepEqual(await loadSnapshot(s.workspace, before.reg, activeNormalId(before)), normal);
  assert.deepEqual(await readSourceProfileFiles(s.context), bytes);
  assert.deepEqual(await readFile(join(before.owner, 'reservation.json')), reservation);
  assert.equal(result.adopted, true);
  assert.equal(result.duplicate, false);
  assert.equal((await enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId })).duplicate, true);
  assert.deepEqual((await openWorkspace(s.workspace)).state, next.state);
  if (before.state.setupId) assert.ok(await loadRecord(s.workspace, 'application', before.state.setupId));
});

test('plugin additions require exact confirmed optional identities and current discovery', async t => {
  const s = await fixture(t), inventory = await enrollment.inspectPluginEnrollment({ workspace: s.workspace });
  for (const addition of [{ ...request(s), optional: false }, { ...request(s), origin: 'unknown' },
    { ...request(s), path: '/invented/package' }, { ...request(s), reason: '' }, { ...request(s), pluginId: 'invented' }]) {
    await assert.rejects(enrollment.reviewPluginEnrollment({ workspace: s.workspace, discoveryId: inventory.discoveryId, additions: [addition] }));
  }
  await assert.rejects(enrollment.reviewPluginEnrollment({ workspace: s.workspace, discoveryId: inventory.discoveryId,
    additions: [request(s), request(s)] }), { kind: 'plugin-enrollment-proposal-invalid' });
  await assert.rejects(enrollment.reviewPluginEnrollment({ workspace: s.workspace, discoveryId: '0'.repeat(64),
    additions: [request(s)] }), { kind: 'stale-discovery' });
  await assert.rejects(enrollment.inspectPluginEnrollment({ workspace: s.workspace, context: s.context }), { kind: 'invalid-request' });
});

for (const phase of ['plugin-enrollment-journal', 'plugin-enrollment-manifest', 'plugin-enrollment-state'])
test('offline cancellation restores record pointers after ' + phase + ' and preserves source edits', async t => {
  const s = await fixture(t), p = await review(s), before = await openWorkspace(s.workspace);
  setSourceTransactionTestHook(at => { if (at === phase) throw Error('synthetic stop'); });
  await assert.rejects(enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId }), /synthetic stop/);
  setSourceTransactionTestHook(null);
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'normal' }), { kind: 'recovery-required' });
  const config = join(s.context.codexHome, 'config.toml');
  await writeFile(config, await readFile(config, 'utf8') + '\n# Independent edit during cancellation\n');
  const bytes = await readSourceProfileFiles(s.context);
  // A removed installation and unavailable native peer cannot block rollback.
  const packageRoot = join(s.context.codexHome, 'plugins/cache/openai-curated-remote', s.names[0], '1.2.3');
  await rm(packageRoot, { recursive: true });
  await rm(join(s.context.codexHome, '.fixture-plugins.json'));
  const { stdout } = await promisify(execFile)(process.execPath,
    [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
  assert.equal(JSON.parse(stdout).status, 'plugin-enrollment-recording-cancelled');
  const after = await openWorkspace(s.workspace);
  assert.deepEqual(after.state, before.state);
  assert.deepEqual(after.manifest, before.manifest);
  assert.deepEqual(await readSourceProfileFiles(s.context), bytes);
  await assert.rejects(readFile(join(packageRoot, '.codex-plugin/plugin.json')), { code: 'ENOENT' });
});

test('foreign recovery stages survive without partial pointer rollback', async t => {
  const s = await fixture(t), p = await review(s);
  setSourceTransactionTestHook(at => { if (at === 'plugin-enrollment-state') throw Error('synthetic stop'); });
  await assert.rejects(enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId }));
  setSourceTransactionTestHook(null);
  const before = await openWorkspace(s.workspace), stage = join(s.workspace, 'registration.json.next');
  await writeFile(stage, JSON.stringify({ independent: true }));
  await assert.rejects(sources.recoverUserSources({ workspace: s.workspace }), { kind: 'foreign-stage' });
  assert.deepEqual(await readJson(stage), { independent: true });
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  await rm(stage);
  await sources.recoverUserSources({ workspace: s.workspace });
});

for (const selector of [false, null]) test('plugin enrollment preserves exact disabled or absent Normal selector ' + selector, async t => {
  const s = await fixture(t, { selectors: [selector] }), p = await review(s);
  const bytes = await readSourceProfileFiles(s.context);
  await writeFile(join(s.context.codexHome, '.fixture-plugin-requests.jsonl'), '');
  await enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
  const w = await openWorkspace(s.workspace);
  assert.equal(w.reg.plugins[0].normalSelector, selector);
  assert.equal(w.reg.plugins[0].normalEnabled, selector ?? true);
  assert.deepEqual(await readSourceProfileFiles(s.context), bytes);
  const requests = (await readFile(join(s.context.codexHome, '.fixture-plugin-requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(requests.length > 0);
  assert.ok(requests.every(q => !['plugin/search', 'plugin/read', 'plugin/skill/read'].includes(q.method)));
});

test('successive plugin additions keep their complete lineage, old favorite and appearance collection', async t => {
  const s = await fixture(t, { selectors: [true, null, false] });
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Before plugin enrollment' });
  const original = await loadRecord(s.workspace, 'favorite', favorite.favoriteId);
  const appearance = await import('../src/appearances/service.mjs');
  const collected = await appearance.discoverUserAppearance({ workspace: s.workspace });
  const bytes = await readSourceProfileFiles(s.context), normalIds = [];
  for (let i = 0; i < s.names.length; i++) {
    const before = await openWorkspace(s.workspace), p = await review(s, i);
    normalIds.push(activeNormalId(before));
    await enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
    const after = await openWorkspace(s.workspace);
    assert.equal(after.registrations.length, i + 2);
    assert.equal(after.reg.plugins.length, i + 1);
    assert.deepEqual(after.reg.plugins.slice(0, i), before.reg.plugins ?? []);
    assert.equal(after.reg.parentNormalId, activeNormalId(before));
    assert.deepEqual(await loadRecord(s.workspace, 'favorite', favorite.favoriteId), original);
    assert.deepEqual(await readSourceProfileFiles(s.context), bytes);
  }
  const final = await openWorkspace(s.workspace);
  assert.deepEqual(final.reg.plugins.map(p => p.normalSelector), [true, null, false]);
  const inventory = await enrollment.inspectPluginEnrollment({ workspace: s.workspace });
  assert.deepEqual(inventory.candidates, []);
  assert.equal(inventory.registeredCount, 3);
  await assert.rejects(enrollment.reviewPluginEnrollment({ workspace: s.workspace, discoveryId: inventory.discoveryId,
    additions: [request(s)] }), { kind: 'unsupported-source' });
  const readAppearance = await appearance.readUserAppearance({ workspace: s.workspace });
  assert.deepEqual(readAppearance.state, collected.state);
  assert.equal(readAppearance.stateId, collected.stateId);
  for (const normalId of normalIds) assert.ok(await loadSnapshot(s.workspace, final.reg, normalId));
});

for (const mutation of ['body', 'directory']) test('changed plugin ' + mutation + ' invalidates an already reviewed addition', async t => {
  const s = await fixture(t), p = await review(s), before = await openWorkspace(s.workspace);
  const root = join(s.context.codexHome, 'plugins/cache/openai-curated-remote', s.names[0], '1.2.3');
  if (mutation === 'body') await writeFile(join(root, 'skills/fixture/SKILL.md'), '# Independently edited plugin\n');
  else { await rename(root, root + '-old'); await cp(root + '-old', root, { recursive: true }); }
  await assert.rejects(enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId }), { kind: 'plugin-dependency-changed' });
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  await assert.rejects(readFile(join(s.workspace, 'pending.json')), { code: 'ENOENT' });
});

test('source edits at the final enrollment boundary remain untouched and cancel offline', async t => {
  const s = await fixture(t), p = await review(s), before = await openWorkspace(s.workspace);
  const path = join(s.context.codexHome, 'AGENTS.md');
  setSourceTransactionTestHook(async at => { if (at === 'plugin-enrollment-journal') await writeFile(path, '# Independent edit\n'); });
  await assert.rejects(enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId }), { kind: 'source-conflict' });
  setSourceTransactionTestHook(null);
  await assert.rejects(review(s), { kind: 'recovery-required' });
  await sources.recoverUserSources({ workspace: s.workspace });
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  assert.equal(await readFile(path, 'utf8'), '# Independent edit\n');
});

test('a changed preparation makes plugin enrollment review stale', async t => {
  const s = await fixture(t), p = await review(s);
  const plan = await sources.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await sources.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const before = await openWorkspace(s.workspace);
  await assert.rejects(enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId }), { kind: 'stale-plan' });
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
});

test('active replay and pending appearance recording prevent plugin enrollment', async t => {
  const s = await fixture(t), declaration = { request: 'READY', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true }], ratings: [],
    budget: { maxAttempts: 2, maxTurnsPerAttempt: 1, maxRecordedTokens: 150 } };
  const p = await review(s);
  const startReview = await sources.reviewUserStart({ workspace: s.workspace, declaration });
  const start = await sources.saveUserStart({ workspace: s.workspace, reviewId: startReview.reviewId });
  const replay = await sources.reviewUserReplay({ workspace: s.workspace, startId: start.startId });
  await sources.prepareUserReplay({ workspace: s.workspace, reviewId: replay.reviewId });
  await assert.rejects(review(s), { kind: 'replay-active-attempt' });
  // An existing review cannot bypass the newly active replay either.
  await assert.rejects(enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId }), { kind: 'replay-active-attempt' });
  const other = await fixture(t), appearance = await import('../src/appearances/service.mjs');
  setSourceTransactionTestHook(at => { if (at === 'appearance-journaled') throw Error('synthetic stop'); });
  await assert.rejects(appearance.discoverUserAppearance({ workspace: other.workspace }), { kind: 'appearance-publication-uncertain' });
  setSourceTransactionTestHook(null);
  await assert.rejects(review(other), { kind: 'appearance-recovery-required' });
});

test('the actual preceding writer refuses a plugin-enrolled profile before any source write', async t => {
  const s = await fixture(t, { legacyRevision: '7589c9a' });
  assert.equal((await s.callLegacy('status', { workspace: s.workspace })).preparedMode, 'normal');
  const p = await review(s);
  await enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
  const before = await openWorkspace(s.workspace), bytes = await readSourceProfileFiles(s.context);
  for (const [action, extra] of [['status', {}], ['plan', { mode: 'normal' }], ['recover', {}]])
    await assert.rejects(s.callLegacy(action, { workspace: s.workspace, ...extra }), error => {
      assert.equal(JSON.parse(error.stderr).error.kind, 'workspace-invalid'); return true;
    });
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  assert.deepEqual(await readSourceProfileFiles(s.context), bytes);
});

test('v3 setup, ordinary enrollment and plugin additions share one continuous scope history', async t => {
  const s = await fixture(t, { setup: 3, selectors: [true, true] }), root = await openWorkspace(s.workspace);
  const originalNormal = await loadSnapshot(s.workspace, root.reg, activeNormalId(root));
  const originalBytes = await readSourceProfileFiles(s.context);
  await enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: (await review(s)).reviewId });
  const first = await openWorkspace(s.workspace), firstPlugin = structuredClone(first.reg.plugins[0]);
  const { readSetup, reviewSetup, applySetup } = await import('../src/setup/service.mjs');
  const inventory = (await readSetup({ workspace: s.workspace, schemaVersion: 3 })).inventory;
  const proposal = { schemaVersion: 3, scopeId: first.scopeId, normalId: activeNormalId(first), inventoryId: inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Official fixture reference',
        checkedAt: '2026-09-11T00:00:00Z' }], rationale: 'Keep registered sources during lineage verification.' },
    roles: first.reg.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Owned synthetic Skill.' })),
    trueform: { skillStates: first.reg.skills.map(s => ({ sourceId: s.id, state: 'manual' })), retainedOfficialPluginIds: [id(s.names[0])] },
    unseal: { instructions: 'minimal', skillElevations: [], additionalPluginIds: [] } };
  await applySetup({ workspace: s.workspace, reviewId: (await reviewSetup({ workspace: s.workspace, proposal })).reviewId });
  const { inspectEnrollment, reviewEnrollment, applyEnrollment } = await import('../src/setup/enrollment.mjs');
  const skillPath = join(s.context.codexHome, 'skills/addition/SKILL.md');
  await mkdir(join(skillPath, '..'), { recursive: true });
  const skillBody = '---\nname: addition\ndescription: Added synthetic source\n---\n\nLocal fixture data.\n';
  await writeFile(skillPath, skillBody);
  const ordinary = await inspectEnrollment({ workspace: s.workspace });
  const candidate = ordinary.candidates.find(c => c.path === skillPath);
  assert.ok(candidate);
  const p = await reviewEnrollment({ workspace: s.workspace, discoveryId: ordinary.discoveryId,
    additions: [{ sourceId: candidate.id, origin: 'self', reason: 'User confirmed a synthetic source.' }] });
  await applyEnrollment({ workspace: s.workspace, reviewId: p.reviewId });
  const middle = await openWorkspace(s.workspace);
  assert.equal(middle.reg.role, 'registration');
  assert.equal(middle.reg.controlSchemaVersion, 3);
  assert.equal(middle.reg.pluginEnrollmentReviewId, undefined);
  assert.deepEqual(middle.reg.plugins, [firstPlugin]);
  assert.equal(middle.state.setupId, null);
  const finalReview = await review(s, 1);
  await enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId: finalReview.reviewId });
  const final = await openWorkspace(s.workspace);
  assert.equal(final.registrations.length, 4);
  assert.deepEqual(final.registrations.map(s => s.reg.role), ['registration-controls-v3', 'registration', 'registration-controls-v3', 'registration']);
  assert.equal(final.manifestVersion, 3);
  assert.equal(final.state.setupSchemaVersion, 3);
  assert.deepEqual(final.reg.skills, middle.reg.skills);
  assert.deepEqual(final.reg.plugins[0], firstPlugin);
  assert.equal(final.reg.plugins[1].id, id(s.names[1]));
  assert.deepEqual(final.reg.bindings, middle.reg.bindings);
  assert.deepEqual(await loadSnapshot(s.workspace, root.reg, activeNormalId(root)), originalNormal);
  assert.deepEqual(await readSourceProfileFiles(s.context), originalBytes);
  assert.equal(await readFile(skillPath, 'utf8'), skillBody);
});

for (const mutation of ['Normal bytes', 'role confirmation', 'input identity'])
test('a coherent child record cannot authorize altered ' + mutation, async t => {
  const s = await fixture(t), p = await review(s), before = await openWorkspace(s.workspace);
  const payload = await loadRecord(s.workspace, 'input', p.reviewId);
  if (mutation === 'Normal bytes') {
    const normal = await loadSnapshot(s.workspace, before.reg, payload.nextNormalId);
    normal.config.text += '\n# Unreviewed change\n';
    payload.nextNormalId = await saveSnapshot(s.workspace, before.reg, normal, 2);
  } else if (mutation === 'role confirmation') payload.plugins[0].role.optional = false;
  else payload.additions[0].pluginId = 'other-plugin@openai-curated-remote';
  const reviewId = await record(s.workspace, 'input', payload);
  await record(s.workspace, 'scope', pluginEnrollmentRegistration(before.reg, payload, reviewId));
  await assert.rejects(enrollment.adoptPluginEnrollment({ workspace: s.workspace, reviewId }), { kind: 'plugin-enrollment-record-invalid' });
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  await assert.rejects(readFile(join(s.workspace, 'pending.json')), { code: 'ENOENT' });
});
