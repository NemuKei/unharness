import test from 'node:test';
import assert from 'node:assert/strict';
import { replayRecording, replayTaskId } from '../test-support/replay-recording.mjs';
const mod = await import('../src/codex/replay-observation.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const binding = { taskId: replayTaskId, project: '/synthetic/replay', readyAt: '2026-09-09T01:00:00.000Z',
  observedAt: '2026-09-09T01:01:00.000Z', request: '  READY\n',
  expectedSources: [{ sourceId: 'instructions', category: 'instructions', expected: 'saved-instructions', text: '# Optional' }],
  instructions: '# Optional\n\n--- project-doc ---\n\n# Required',
  nativeConfig: { model: 'gpt-5', model_reasoning_effort: 'high', approval_policy: 'never', sandbox_mode: 'read-only' },
  recordRead: { incompleteTrailingLine: false, snapshotBytes: 2000 } };
const project = (r = replayRecording(), overrides = {}) => {
  assert.equal(typeof mod.projectReplayTask, 'function');
  return mod.projectReplayTask(r, { ...binding, ...overrides });
};
test('replay qualifies exact first request, loaded selected sources, retained project guidance and configured runtime fields', () => {
  const r = project(); assert.equal(r.qualification.status, 'matched-record');
  assert.equal(r.measurement.selectedTurnIds.length, 1); assert.equal(r.outputText, 'READY');
  assert.equal(r.qualification.startingFilesAtTaskStart, 'not-recorded');
  assert.equal(r.qualification.completeIsolationVerified, false);
});
test('old, future, wrong task/project, forked or unfinished task cannot qualify', () => {
  for (const edit of [
    r => { r[0].payload.timestamp = '2020-01-01T00:00:00.000Z'; },
    r => { r[0].payload.timestamp = '2030-01-01T00:00:00.000Z'; },
    r => { r[0].payload.cwd = '/elsewhere'; },
    r => { r[4].payload.cwd = '/elsewhere'; },
    r => { r[0].payload.id = '22222222-2222-4222-8222-222222222222'; },
    r => { r[0].payload.forked_from_id = replayTaskId; },
    r => { r.pop(); },
  ]) { const r = replayRecording(); edit(r); assert.notEqual(project(r).qualification.status, 'matched-record'); }
});
test('changed runtime permissions, model, effort and loaded project instructions are explicit mismatches', () => {
  for (const edit of [
    r => { r[4].payload.model = 'other-model'; },
    r => { r[4].payload.effort = 'low'; },
    r => { r[4].payload.approval_policy = 'on-request'; },
    r => { r[4].payload.sandbox_policy = { type: 'danger-full-access' }; },
    r => { r[3].payload.state.agents_md.text += '\nChanged project requirements'; },
  ]) { const r = replayRecording(); edit(r); assert.equal(project(r).qualification.status, 'not-matched-record'); }
});
test('repo Skill expectations use the derived identity and absence is unavailable when the catalog grammar is unknown', () => {
  const source = { sourceId: 'skill', category: 'skill', expected: 'automatic-catalog', name: 'example', path: '/synthetic/replay/.agents/skills/example/SKILL.md' };
  const records = replayRecording({ catalog: '### Available skills\n- example: Synthetic (file: /synthetic/replay/.agents/skills/example/SKILL.md)' });
  assert.equal(project(records, { expectedSources: [...binding.expectedSources, source] }).qualification.status, 'matched-record');
  records[3].payload.state.host_skills.body = '### Available skills\n- unknown grammar';
  assert.equal(project(records, { expectedSources: [{ ...source, expected: 'disabled' }] }).qualification.status, 'unknown-record');
});
test('every recorded turn is included; another incomplete turn and partial reads remain unqualified', () => {
  const r = replayRecording();
  r.push({ type: 'event_msg', timestamp: '2026-09-09T01:00:02.000Z', payload: { type: 'task_started', turn_id: 'turn-2' } },
    { ...r[4], timestamp: '2026-09-09T01:00:02.000Z', payload: { ...r[4].payload, turn_id: 'turn-2' } });
  const result = project(r); assert.equal(result.measurement.selectedTurnIds.length, 2);
  assert.notEqual(result.qualification.status, 'matched-record');
  assert.notEqual(project(replayRecording(), { recordRead: { incompleteTrailingLine: true, snapshotBytes: 2000 } }).qualification.status, 'matched-record');
});
test('malformed or late initial world state and missing retained conditions remain unknown', () => {
  const r = replayRecording(); r[3].payload.state = null;
  assert.equal(project(r).qualification.status, 'unknown-record');
  assert.equal(project(replayRecording(), { instructions: null }).qualification.status, 'unknown-record');
  assert.equal(project(replayRecording(), { nativeConfig: {} }).qualification.status, 'unknown-record');
});

test('later native source changes cannot be hidden by restoring the first loaded state', () => {
  const r = replayRecording(), later = structuredClone(r[3]);
  later.payload.state.agents_md.text = 'Changed optional instructions';
  r.splice(8, 0, later, structuredClone(r[3]));
  assert.notEqual(project(r).qualification.status, 'matched-record');
});
