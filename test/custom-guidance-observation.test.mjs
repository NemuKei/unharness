import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOwnedSourceProfile, readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import { openWorkspace, loadSnapshot } from '../src/sources/records.mjs';
import { registeredSourceExpectations } from '../src/sources/observation.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import * as replay from '../src/experiments/replay-service.mjs';
const mac = { skip: process.platform !== 'darwin' };
const guide = '# Frozen custom guidance\n\nOnly use selected workflows.\n';
async function fixture(t, { disabled = false, state = 'automatic', custom = true } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-custom-observation-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  if (disabled) {
    const file = join(owned.context.codexHome, 'config.toml'), path = join(owned.context.codexHome, 'skills/example/SKILL.md');
    await writeFile(file, await readFile(file, 'utf8') + '\n[[skills.config]]\npath = ' + JSON.stringify(path) + '\nenabled = false\n');
  }
  await writeFile(join(owned.context.codexHome, 'replay-native-fixture.json'), '{}');
  const d = await sources.discoverUserSources(owned.context);
  const reg = await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
    instructionsOptional: true, selectedSkillIds: d.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  const inventory = (await readSetup({ workspace: reg.workspace, schemaVersion: 4 })).inventory;
  const proposal = { schemaVersion: 4, scopeId: reg.scopeId, normalId: reg.normalId, inventoryId: inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model',
        title: 'Fixture reference', checkedAt: '2026-09-20T00:00:00Z' }], rationale: 'Custom source-observation fixture' },
    roles: inventory.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Owned optional fixture' })),
    trueform: { skillStates: inventory.skills.map(s => ({ sourceId: s.id, state: 'manual' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: custom ? 'custom' : 'none', ...(custom ? { customInstructions: guide } : {}),
      skillElevations: state === 'automatic' ? inventory.skills.map(s => ({ sourceId: s.id, state })) : [], additionalPluginIds: [] } };
  await applySetup({ workspace: reg.workspace, reviewId: (await reviewSetup({ workspace: reg.workspace, proposal })).reviewId });
  const plan = await sources.planUserMode({ workspace: reg.workspace, mode: 'unseal' });
  await sources.applyUserPlan({ workspace: reg.workspace, planId: plan.planId });
  return { ...owned, ...reg, parent, expectedText: custom ? guide : '<!-- -->\n', automatic: state === 'automatic' };
}
async function recording(s, text = s.expectedText) {
  const taskId = randomUUID(), records = [
    { type: 'session_meta', payload: { id: taskId, timestamp: new Date().toISOString(), cwd: s.context.project,
      originator: 'Codex Desktop', thread_source: 'user', cli_version: '0.153.4' } },
    { type: 'turn_context', payload: { cwd: s.context.project, turn_id: 'turn-1', model: 'synthetic-model', effort: 'high' } },
    { type: 'world_state', payload: { full: true, state: {
      agents_md: { directory: s.context.project, text: text.trim() + '\n\n--- project-doc ---\n\n# Required project instructions' },
      host_skills: { includeInstructions: true, body: '### Available skills\n' +
        (s.automatic ? '- example: Synthetic (file: ' + join(s.context.codexHome, 'skills/example/SKILL.md') + ')' : '') },
      permissions: { instructions: 'PRIVATE fixture policy' } } } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'PRIVATE answer' }] } },
    { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1' } },
  ];
  const directory = join(s.context.codexHome, 'sessions'); await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'rollout-' + taskId + '.jsonl'), records.map(r => JSON.stringify(r)).join('\n') + '\n');
  return taskId;
}

test('custom UNSEAL input is matched, mismatches stay visible, and observation readback retains the custom identity', mac, async t => {
  const s = await fixture(t), taskId = await recording(s);
  const matched = await sources.observeUserTask({ workspace: s.workspace, taskId });
  assert.equal(matched.status, 'matched-record');
  assert.equal(matched.sources.find(s => s.category === 'instructions').expected, 'custom-guide');
  assert.equal(matched.verification.runtimeStateVerified, false);
  assert.equal((await sources.userSourceState({ workspace: s.workspace })).observation.status, 'matched-record');
  const changed = await sources.observeUserTask({ workspace: s.workspace, taskId: await recording(s, 'Different instructions') });
  assert.equal(changed.status, 'not-matched-record');
  assert.ok(changed.reasons.includes('instruction-prefix-mismatch'));
  assert.ok(!JSON.stringify(matched).includes(guide.trim()));
});

for (const state of ['manual', 'automatic']) test('v4 observes a Normal-disabled Skill explicitly enabled as ' + state, mac, async t => {
  const s = await fixture(t, { disabled: true, state, custom: false });
  const result = await sources.observeUserTask({ workspace: s.workspace, taskId: await recording(s) });
  assert.equal(result.status, 'matched-record');
  assert.equal(result.sources.find(s => s.category === 'skill').expected, state === 'manual' ? 'manual-only' : 'automatic-catalog');
});

test('custom expectation requires the prepared frozen body instead of accepting arbitrary v4 text', mac, async t => {
  const s = await fixture(t), w = await openWorkspace(s.workspace), files = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
  const changed = structuredClone(files); changed.override.text = 'Never approved';
  assert.equal((await registeredSourceExpectations(w, changed))[0].expected, 'unknown');
  assert.equal((await registeredSourceExpectations({ ...w, state: { ...w.state, preparedSetupId: null } }, files))[0].expected, 'unknown');
});

test('custom instructions survive replay review, saved-record validation, preparation and handoff', mac, async t => {
  const s = await fixture(t);
  await writeFile(join(s.context.project, 'work.txt'), 'Frozen input\n');
  const declaration = { request: 'Return READY', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true }],
    ratings: [], budget: { maxAttempts: 1, maxTurnsPerAttempt: 1, maxRecordedTokens: 500 } };
  const start = await sources.saveUserStart({ workspace: s.workspace,
    reviewId: (await sources.reviewUserStart({ workspace: s.workspace, declaration })).reviewId });
  const before = await readSourceProfileFiles(s.context);
  const reviewed = await replay.reviewUserReplay({ workspace: s.workspace, startId: start.startId });
  const attempt = await replay.prepareUserReplay({ workspace: s.workspace, reviewId: reviewed.reviewId });
  const handoff = await replay.handoffUserReplay({ workspace: s.workspace, attemptId: attempt.attemptId });
  assert.equal(handoff.phase, 'ready');
  assert.equal((await replay.readUserReplay({ workspace: s.workspace, attemptId: attempt.attemptId })).phase, 'ready');
  assert.deepEqual(await readSourceProfileFiles(s.context), before);
  await replay.cancelUserReplay({ workspace: s.workspace, attemptId: attempt.attemptId });
});
