import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pluginStateProfile, pluginStateSetup } from '../test-support/plugin-state-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import { openWorkspace, loadSnapshot, loadRecord } from '../src/sources/records.mjs';
import { projectObservation } from '../src/sources/observation-record.mjs';
import { replayRecording, replayTaskId } from '../test-support/replay-recording.mjs';
import { projectReplayTask } from '../src/codex/replay-observation.mjs';
import * as helper from '../src/codex/plugin-task-observation.mjs';
import { inspectPluginEnrollment, reviewPluginEnrollment, adoptPluginEnrollment } from '../src/setup/plugin-enrollment.mjs';
const mac = { skip: process.platform !== 'darwin' };
const features = { skills: 1, mcpServers: 0, hooks: 0, apps: 0, appTemplates: 0, scheduledTasks: null };
const binding = { pluginId: 'sample@openai-curated-remote', dependencyId: 'a'.repeat(64), sourceRevision: '1.2.3',
  configuration: 'saved-snapshot', expectedEnabled: false, features,
  skills: [{ name: 'sample:work', path: '/synthetic/plugin/skills/work/SKILL.md' }] };
const state = body => ({ host_skills: { includeInstructions: true, body: '### Available skills\n' + body } });
const present = '- sample:work: Fixture (file: /synthetic/plugin/skills/work/SKILL.md)\n';

test('a disabled plugin with an exact Skill in the initial catalog is not matched', () => {
  assert.equal(typeof helper.projectPluginInputs, 'function');
  const [p] = helper.projectPluginInputs([binding], state(present), '0.153.4');
  assert.equal(p.inputStatus, 'not-matched');
  assert.equal(p.skillCatalog.available, true);
  assert.equal(p.skillCatalog.matchedCount, 1);
  assert.equal(p.runtimeStatus, 'unknown');
});
for (const [name, input, version, enabled, expected] of [
  ['absent disabled Skill', state(''), '0.153.4', false, 'matched'],
  ['present enabled Skill', state(present), '0.153.4', true, 'matched'],
  ['missing enabled Skill may be manual', state(''), '0.153.4', true, 'unknown'],
  ['missing catalog', {}, '0.153.4', false, 'unknown'],
  ['malformed alias', state('- sample:work: Fixture (file: missing/SKILL.md)\n'), '0.153.4', false, 'unknown'],
  ['same-name local copy', state('- sample:work: Fixture (file: /different/SKILL.md)\n'), '0.153.4', false, 'unknown'],
  ['unsupported runtime', state(present), '0.999.0', false, 'unknown'],
]) test('plugin input coverage: ' + name, () => {
  const [p] = helper.projectPluginInputs([{ ...binding, expectedEnabled: enabled }], input, version);
  assert.equal(p.inputStatus, expected);
  assert.equal(p.runtimeStatus, 'unknown');
  assert.equal(p.features.scheduledTasks, null);
});

async function prepare(s, mode) {
  const p = await sources.planUserMode({ workspace: s.workspace, mode });
  await sources.applyUserPlan({ workspace: s.workspace, planId: p.planId });
}
async function recordTask(s, { pluginPresent = false, catalogMissing = false, ordinaryAutomatic = false, project = s.context.project } = {}) {
  const w = await openWorkspace(s.workspace), files = await loadSnapshot(s.workspace, w.reg, w.state.snapshotId);
  const global = (files.override?.text?.trim() ? files.override.text : files.base?.text ?? '').trim();
  const taskId = randomUUID();
  const entries = [
    ...(ordinaryAutomatic ? ['- example: Ordinary fixture (file: ' + join(s.context.codexHome, 'skills/example/SKILL.md') + ')'] : []),
    ...(pluginPresent ? ['- fixture-state:fixture: Plugin fixture (file: ' + join(s.packageRoot, 'skills/fixture/SKILL.md') + ')'] : []),
  ];
  const records = replayRecording({ taskId, project, createdAt: new Date().toISOString(),
    instructions: global + '\n\n--- project-doc ---\n\n# Required project instructions',
    catalog: '### Available skills\n' + entries.join('\n') + '\n' });
  if (catalogMissing) delete records.find(r => r.type === 'world_state').payload.state.host_skills;
  await mkdir(join(s.context.codexHome, 'sessions'), { recursive: true });
  await writeFile(join(s.context.codexHome, 'sessions', 'rollout-' + taskId + '.jsonl'), records.map(JSON.stringify).join('\n') + '\n');
  return { taskId, w };
}

test('schema3 stops false mode matches and preserves separate input and runtime coverage', mac, async t => {
  const s = await pluginStateProfile(t); await pluginStateSetup(s); await prepare(s, 'trueform');
  for (const [options, status, inputStatus] of [
    [{ pluginPresent: true }, 'not-matched-record', 'not-matched'],
    [{}, 'unknown-record', 'matched'],
    [{ catalogMissing: true }, 'unknown-record', 'unknown'],
  ]) {
    const { taskId, w } = await recordTask(s, options);
    const observed = await sources.observeUserTask({ workspace: s.workspace, taskId });
    assert.equal(observed.status, status);
    assert.equal(observed.plugins[0].inputStatus, inputStatus);
    assert.equal(observed.coverage.runtimeStatus, 'unknown');
    assert.ok(observed.reasons.includes('plugin-runtime-state-unavailable'));
    const stored = await loadRecord(s.workspace, 'observation', observed.observationId);
    assert.equal(stored.schemaVersion, 3);
    assert.equal(stored.plugins[0].features.scheduledTasks, null);
    assert.equal(projectObservation(stored, observed.observationId, w).status, status);
    assert.throws(() => projectObservation({ ...stored, status: 'matched-record' }, observed.observationId, w));
    const fake = structuredClone(stored); fake.plugins[0].runtimeStatus = 'matched';
    assert.throws(() => projectObservation(fake, observed.observationId, w));
    const legacy = { ...stored, schemaVersion: 1, status: 'matched-record', reasons: [] };
    delete legacy.sourceStatus; delete legacy.plugins; delete legacy.coverage;
    assert.throws(() => projectObservation(legacy, observed.observationId, w));
  }
});

test('ordinary run comparison cannot acquire a matching association from an unverified plugin runtime', mac, async t => {
  const s = await pluginStateProfile(t); await pluginStateSetup(s); await prepare(s, 'trueform');
  const { taskId } = await recordTask(s);
  const reviewed = await sources.reviewUserRun({ workspace: s.workspace, taskId });
  assert.equal(reviewed.source.observation.status, 'unknown-record');
  assert.equal(reviewed.source.observation.coverage.inputStatus, 'matched');
  assert.equal(reviewed.source.association, null);
});

test('the earlier scope keeps its original observation schema and receives no later plugin coverage', mac, async t => {
  const s = await pluginStateProfile(t, true, false);
  const { taskId, w } = await recordTask(s, { ordinaryAutomatic: true, pluginPresent: true });
  const observed = await sources.observeUserTask({ workspace: s.workspace, taskId });
  const stored = await loadRecord(s.workspace, 'observation', observed.observationId);
  assert.equal(stored.schemaVersion, 1);
  assert.equal(observed.status, 'matched-record');
  assert.equal(observed.plugins, undefined);
  const reviewed = await sources.reviewUserRun({ workspace: s.workspace, taskId });
  const run = await sources.saveUserRun({ workspace: s.workspace, reviewId: reviewed.reviewId,
    assessment: { outcome: 'accepted', provenance: 'agent', requirements: [], ratings: [] } });
  const inventory = await inspectPluginEnrollment({ workspace: s.workspace });
  const review = await reviewPluginEnrollment({ workspace: s.workspace, discoveryId: inventory.discoveryId,
    additions: [{ pluginId: s.pluginId, origin: 'external', reason: 'Owned fixture.', optional: true }] });
  await adoptPluginEnrollment({ workspace: s.workspace, reviewId: review.reviewId });
  assert.equal(projectObservation(stored, observed.observationId, w).status, 'matched-record');
  assert.deepEqual(await sources.readUserRun({ workspace: s.workspace, runId: run.runId }), run);
});

test('replay qualification also separates plugin input matches from unavailable runtime evidence', () => {
  const b = { taskId: replayTaskId, project: '/synthetic/replay', readyAt: '2026-09-09T01:00:00.000Z',
    observedAt: '2026-09-09T01:01:00.000Z', request: '  READY\n', expectedSources: [], expectedPlugins: [binding],
    instructions: '# Optional\n\n--- project-doc ---\n\n# Required',
    nativeConfig: { model: 'gpt-5', model_reasoning_effort: 'high', approval_policy: 'never', sandbox_mode: 'read-only' },
    recordRead: { incompleteTrailingLine: false, snapshotBytes: 2000 } };
  for (const [body, expectedStatus] of [['', 'unknown-record'], [present, 'not-matched-record']]) {
    const q = projectReplayTask(replayRecording({ catalog: '### Available skills\n' + body }), b).qualification;
    assert.equal(q.status, expectedStatus);
    assert.equal(q.parserVersion, 'codex-desktop-replay-0.153.4/v2');
    assert.equal(q.sourceStatus, 'matched-record');
    assert.equal(q.coverage.runtimeStatus, 'unknown');
  }
});

test('a plugin with no known Skills has no observable input proof even with an available empty catalog', () => {
  const [p] = helper.projectPluginInputs([{ ...binding, features: { ...features, skills: 0 }, skills: [] }], state(''), '0.153.4');
  assert.equal(p.skillCatalog.available, true);
  assert.equal(p.skillCatalog.expectedCount, 0);
  assert.equal(p.inputStatus, 'unknown');
  assert.equal(p.runtimeStatus, 'unknown');
});

test('saved replay results retain plugin evidence and cannot qualify a mode comparison', mac, async t => {
  const s = await pluginStateProfile(t); await pluginStateSetup(s); await prepare(s, 'trueform');
  const declaration = { request: '  READY\n', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true }], ratings: [],
    budget: { maxAttempts: 2, maxTurnsPerAttempt: 1, maxRecordedTokens: 150 } };
  const startReview = await sources.reviewUserStart({ workspace: s.workspace, declaration });
  const start = await sources.saveUserStart({ workspace: s.workspace, reviewId: startReview.reviewId });
  const replayReview = await sources.reviewUserReplay({ workspace: s.workspace, startId: start.startId });
  const attempt = await sources.prepareUserReplay({ workspace: s.workspace, reviewId: replayReview.reviewId });
  const handoff = await sources.handoffUserReplay({ workspace: s.workspace, attemptId: attempt.attemptId });
  const { taskId } = await recordTask(s, { project: handoff.project });
  const observed = await sources.observeUserReplay({ workspace: s.workspace, attemptId: attempt.attemptId, taskId });
  assert.equal(observed.qualification.sourceStatus, 'matched-record');
  assert.equal(observed.qualification.status, 'unknown-record');
  assert.equal(observed.qualification.coverage.inputStatus, 'matched');
  assert.equal(observed.qualification.plugins[0].runtimeStatus, 'unknown');
  const stored = await loadRecord(s.workspace, 'application', observed.resultReviewId);
  assert.equal(stored.schemaVersion, 2);
  const result = await sources.saveUserReplayResult({ workspace: s.workspace, resultReviewId: observed.resultReviewId,
    assessment: { outcome: 'accepted', provenance: 'agent', requirements: [{ id: 'complete', result: 'pass' }], ratings: [] } });
  assert.equal((await sources.readUserReplayResult({ workspace: s.workspace, resultId: result.resultId })).qualification.status, 'unknown-record');
  const comparison = await sources.compareUserReplayResults({ workspace: s.workspace, resultIds: [result.resultId] });
  assert.ok(comparison.aggregate.reasons.includes('unqualified-or-unavailable-records'));
  assert.equal(comparison.aggregate.totalTokens, null);
  await assert.rejects(sources.saveUserReplayFavorite({ workspace: s.workspace, resultId: result.resultId }), { kind: 'replay-result-unavailable' });
});
