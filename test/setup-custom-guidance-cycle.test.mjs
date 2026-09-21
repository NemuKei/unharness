import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, lstat, mkdtemp, realpath, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { addSetupSkill } from '../test-support/setup-profile.mjs';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { registerLegacySourceProfile } from '../test-support/legacy-source-registration.mjs';
import * as sources from '../src/sources/service.mjs';
import { openWorkspace, loadRecord, loadSnapshot, record } from '../src/sources/records.mjs';
import { registeredSourceExpectations } from '../src/sources/observation.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { readModeContents, readModeSource } from '../src/setup/mode-contents.mjs';
import { inspectEnrollment, reviewEnrollment, applyEnrollment } from '../src/setup/enrollment.mjs';
const mac = { skip: process.platform !== 'darwin' };
const body = '# Confirmed local guidance\n\nUse only the workflow requested for this task.\n<script>untrusted example, never execute this text</script>\n';

async function fixture(t, legacyRevision) {
  let s;
  if (legacyRevision) {
    const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-custom-legacy-')));
    t.after(() => rm(parent, { recursive: true, force: true }));
    const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
    s = { ...owned, ...await registerLegacySourceProfile({ parent, context: owned.context, revision: legacyRevision }), parent };
  } else s = await aiProfile(t);
  const inventory = (await readSetup({ workspace: s.workspace, schemaVersion: 3 })).inventory;
  const proposal = { schemaVersion: 3, scopeId: s.scopeId, normalId: s.normalId, inventoryId: inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model',
        title: 'Fixture reference', checkedAt: '2026-09-20T00:00:00.000Z' }], rationale: 'Owned fixture for custom instructions.' },
    roles: inventory.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Synthetic optional source' })),
    trueform: { skillStates: inventory.skills.map(s => ({ sourceId: s.id, state: 'disabled' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: 'minimal', skillElevations: inventory.skills.map(s => ({ sourceId: s.id, state: 'manual' })), additionalPluginIds: [] } };
  await applySetup({ workspace: s.workspace, reviewId: (await reviewSetup({ workspace: s.workspace, proposal })).reviewId });
  t.after(() => setSourceTransactionTestHook(null));
  return { ...s, proposal };
}
async function custom(s, text = body) {
  const r = await readSetup({ workspace: s.workspace, schemaVersion: 4 });
  return { ...s.proposal, schemaVersion: 4, scopeId: r.scopeId, normalId: r.normalId, inventoryId: r.inventory.inventoryId,
    unseal: { ...s.proposal.unseal, instructions: 'custom', customInstructions: text } };
}
async function adopt(s, p) {
  const r = await reviewSetup({ workspace: s.workspace, proposal: p });
  assert.equal(r.sourceFilesChanged, 0);
  return applySetup({ workspace: s.workspace, reviewId: r.reviewId });
}
async function prepare(s, mode) {
  const p = await sources.planUserMode({ workspace: s.workspace, mode });
  await sources.applyUserPlan({ workspace: s.workspace, planId: p.planId });
  return p;
}

test('v4 saves a custom pair separately, removes it in TRUEFORM, and restores Normal and v3 favorites exactly', mac, async t => {
  const s = await fixture(t);
  await prepare(s, 'unseal');
  const oldFiles = await readSourceProfileFiles(s.context);
  const oldFavorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'v3 guide' });
  const oldRecord = await loadRecord(s.workspace, 'favorite', oldFavorite.favoriteId);
  const before = await openWorkspace(s.workspace), proposal = await custom(s);
  const saved = await adopt(s, proposal), after = await openWorkspace(s.workspace);
  assert.equal(after.manifestVersion, 4);
  assert.equal(after.state.setupSchemaVersion, 4);
  assert.equal(after.reg.normalId, before.reg.normalId);
  assert.equal(after.state.snapshotId, before.state.snapshotId);
  assert.deepEqual(after.state.preparation, before.state.preparation);
  assert.equal(after.state.preparedSetupId, before.state.preparedSetupId);
  assert.deepEqual(await readSourceProfileFiles(s.context), oldFiles);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', oldFavorite.favoriteId), oldRecord);

  const p = await prepare(s, 'unseal');
  assert.equal(p.setupId, saved.setupId);
  assert.equal(p.guide.id, 'unharness-custom-v1');
  assert.equal(Object.hasOwn(p.guide, 'text'), false);
  assert.equal((await readSourceProfileFiles(s.context)).override.text, body);
  const contents = await readModeContents({ workspace: s.workspace });
  assert.equal(contents.modes.unseal.instructions.style, 'custom');
  assert.equal(contents.modes.unseal.instructions.readable, true);
  assert.equal((await readModeSource({ workspace: s.workspace, mode: 'unseal',
    snapshotId: contents.modes.unseal.snapshotId, sourceId: contents.modes.unseal.instructions.sourceId })).text, body);
  assert.equal(contents.modes.trueform.instructions.readable, false);

  await prepare(s, 'trueform');
  assert.equal((await readSourceProfileFiles(s.context)).override.text, '<!-- -->\n');
  await prepare(s, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: oldFavorite.favoriteId });
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.deepEqual(await readSourceProfileFiles(s.context), oldFiles);
  await assert.rejects(reviewSetup({ workspace: s.workspace, proposal: s.proposal }), { kind: 'setup-upgrade-required' });
  assert.equal((await openWorkspace(s.workspace)).manifestVersion, 4);
});

test('custom favorites freeze the exact old text after another paired configuration is saved', mac, async t => {
  const s = await fixture(t);
  const first = await adopt(s, await custom(s, 'First instructions\n'));
  await prepare(s, 'unseal');
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Custom one' });
  const frozen = await loadRecord(s.workspace, 'favorite', favorite.favoriteId);
  await adopt(s, await custom(s, 'Second instructions\n'));
  await prepare(s, 'unseal');
  assert.equal((await readSourceProfileFiles(s.context)).override.text, 'Second instructions\n');
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.equal((await readSourceProfileFiles(s.context)).override.text, 'First instructions\n');
  assert.equal((await openWorkspace(s.workspace)).state.preparedSetupId, first.setupId);
  assert.deepEqual(await loadRecord(s.workspace, 'favorite', favorite.favoriteId), frozen);
});

for (const phase of ['setup-journal', 'setup-manifest', 'setup-state']) {
  test('v4 adoption cancels offline at ' + phase + ' without changing the old state or files', mac, async t => {
    const s = await fixture(t), before = await openWorkspace(s.workspace), files = await readSourceProfileFiles(s.context);
    const review = await reviewSetup({ workspace: s.workspace, proposal: await custom(s) });
    setSourceTransactionTestHook(p => { if (p === phase) throw Error('synthetic interruption'); });
    await assert.rejects(applySetup({ workspace: s.workspace, reviewId: review.reviewId }));
    setSourceTransactionTestHook(null);
    const out = await promisify(execFile)(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
    assert.equal(JSON.parse(out.stdout).status, 'setup-recording-cancelled');
    const after = await openWorkspace(s.workspace);
    assert.deepEqual(after.state, before.state);
    assert.deepEqual(after.manifest, before.manifest);
    assert.deepEqual(await readSourceProfileFiles(s.context), files);
    await assert.rejects(lstat(join(s.workspace, 'pending.json')), { code: 'ENOENT' });
  });
}

test('v4 never overwrites independently edited optional instructions', mac, async t => {
  const s = await fixture(t); await adopt(s, await custom(s)); await prepare(s, 'unseal');
  const path = join(s.context.codexHome, 'AGENTS.override.md');
  await writeFile(path, 'Independent user edit\n');
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'trueform' }), { kind: 'source-conflict' });
  assert.equal(await readFile(path, 'utf8'), 'Independent user edit\n');
});

test('a rehashed v4 proposal cannot substitute custom text behind its frozen snapshot', mac, async t => {
  const s = await fixture(t), saved = await adopt(s, await custom(s));
  const current = await openWorkspace(s.workspace);
  const { kind, ...forged } = await loadRecord(s.workspace, 'input', saved.reviewId);
  forged.proposal.unseal.customInstructions = 'Substituted instructions\n';
  const reviewId = await record(s.workspace, 'input', forged);
  const setupId = await record(s.workspace, 'application', { role: 'release-setup', schemaVersion: 4,
    scopeId: current.scopeId, reviewId });
  await writeFile(join(s.workspace, 'state.json'), JSON.stringify({ ...current.state, setupId }));
  await assert.rejects(sources.planUserMode({ workspace: s.workspace, mode: 'unseal' }), { kind: 'setup-record-invalid' });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('v4 Skill enrollment keeps the writer fence and requires a new pair without discarding old custom favorites', mac, async t => {
  const s = await fixture(t); await adopt(s, await custom(s)); await prepare(s, 'unseal');
  const favorite = await sources.saveUserFavorite({ workspace: s.workspace, name: 'Before expansion' });
  const added = await addSetupSkill(s), d = await inspectEnrollment({ workspace: s.workspace });
  const addition = { sourceId: d.candidates.find(c => c.path === added.path).id, origin: 'self', reason: 'Optional fixture addition' };
  const review = await reviewEnrollment({ workspace: s.workspace, discoveryId: d.discoveryId, additions: [addition] });
  await applyEnrollment({ workspace: s.workspace, reviewId: review.reviewId });
  const r = await readSetup({ workspace: s.workspace, schemaVersion: 4 }), state = await openWorkspace(s.workspace);
  assert.equal(state.manifestVersion, 4); assert.equal(state.state.setupSchemaVersion, 4);
  assert.equal(r.setupId, null); assert.equal(r.enrollment.setupRequired, true);
  const proposal = { ...await custom(s), roles: r.enrollment.roles,
    trueform: { ...s.proposal.trueform, skillStates: [...s.proposal.trueform.skillStates, { sourceId: addition.sourceId, state: 'manual' }] } };
  await adopt(s, proposal); await prepare(s, 'trueform');
  const restore = await sources.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  await sources.applyUserPlan({ workspace: s.workspace, planId: restore.planId });
  assert.equal((await readSourceProfileFiles(s.context)).override.text, body);
  assert.deepEqual(await readFile(added.path), added.bytes);
  const restored = await openWorkspace(s.workspace);
  const files = await loadSnapshot(restored.workspace, restored.reg, restored.state.snapshotId);
  assert.equal((await registeredSourceExpectations(restored, files))[0].expected, 'custom-guide');
});

test('the actual v3 writer refuses a v4 workspace before planning or recovering source writes', mac, async t => {
  const s = await fixture(t, 'cc97c9b');
  assert.equal((await s.callLegacy('status', { workspace: s.workspace })).preparedMode, 'normal');
  await adopt(s, await custom(s));
  const files = await readSourceProfileFiles(s.context);
  for (const [action, args] of [['status', {}], ['plan', { mode: 'normal' }], ['recover', {}]])
    await assert.rejects(s.callLegacy(action, { workspace: s.workspace, ...args }), error => {
      assert.equal(JSON.parse(error.stderr).error.kind, 'workspace-invalid'); return true;
    });
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
});

test('a v4 manifest cannot be attached to v3 state without its matching adoption journal', mac, async t => {
  const s = await fixture(t), w = await openWorkspace(s.workspace);
  await writeFile(join(s.workspace, 'registration.json'), JSON.stringify({ schemaVersion: 4, rootScopeId: w.rootScopeId }));
  await assert.rejects(openWorkspace(s.workspace), { kind: 'workspace-invalid' });
});
