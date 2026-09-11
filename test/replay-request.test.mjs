import test from 'node:test';
import assert from 'node:assert/strict';
import { replayRecording, replayTaskId } from '../test-support/replay-recording.mjs';
const mod = await import('../src/codex/replay-request.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
function project(records = replayRecording(), request = '  READY\n') {
  assert.equal(typeof mod.projectReplayRequest, 'function');
  return mod.projectReplayRequest(records, { taskId: replayTaskId, request });
}
test('first actual native user request preserves exact whitespace and ignores injected host messages', () => {
  const result = project();
  assert.equal(result.status, 'matched'); assert.equal(result.route, 'user-created');
  assert.equal(result.bytes, 8); assert.match(result.digest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('READY'), false);
  assert.equal(project(replayRecording(), 'READY').status, 'not-matched');
});
test('recognized initial delegation requires exact native namespace, envelope and mirrored identity', () => {
  const r = replayRecording({ route: 'agent_created_thread' });
  assert.equal(project(r).status, 'matched'); assert.equal(project(r).route, 'agent-created');
  const maximum = 'a'.repeat(65536);
  assert.equal(project(replayRecording({ route: 'agent_created_thread', request: maximum }), maximum).status, 'matched');
  for (const edit of [r => { r[5].payload.namespace = 'other'; }, r => { r[6].payload.item.output += '\n'; }, r => { r[6].payload.thread_id = 'other'; }, r => { r[5].payload.output = '<input>  READY\n</input>'; }]) {
    const bad = structuredClone(r); edit(bad); assert.notEqual(project(bad).status, 'matched');
  }
});
test('the observed desktop-work agent route preserves the same exact native request checks', () => {
  const r = replayRecording({ route: 'agent_created_thread' });
  Object.assign(r[0].payload, { originator: 'codex_work_desktop', source: 'vscode' });
  assert.equal(project(r).status, 'matched');
  for (const change of [m => { m.source = 'cli'; }, m => { m.cli_version = '0.154.0'; },
    m => { m.thread_source = 'user'; }, m => { m.originator = 'codex_work_cli'; },
    m => { m.forked_from_id = replayTaskId; }]) {
    const changed = structuredClone(r); change(changed[0].payload);
    assert.notEqual(project(changed).status, 'matched');
  }
  const mismatched = structuredClone(r); mismatched[6].payload.item.output += '\n';
  assert.notEqual(project(mismatched).status, 'matched');
});
test('matching later messages, pasted evidence, partial attachments and matching answers do not prove the first request', () => {
  for (const edit of [
    r => { r.splice(5, 2); },
    r => { r[5].payload.content[0].text = 'wrong'; r[6].payload.item.content[0].text = 'wrong'; r.push(...replayRecording().slice(5, 7)); },
    r => { r.splice(5, 0, structuredClone(r[7])); },
    r => { r[6].payload.item.content.push({ type: 'image', image_url: 'private' }); },
    r => { r[5].payload.content.push({ type: 'input_text', text: 'extra' }); },
    r => { r[6].payload.turn_id = 'different-turn'; },
    r => { r[6].payload.item.id = 'different-id'; },
    r => { r[5].payload.role = 'developer'; },
    r => { r.splice(6, 1); },
  ]) { const r = replayRecording(); edit(r); assert.notEqual(project(r).status, 'matched'); }
});
test('ambiguous initial inputs, unsupported routes and forks remain unavailable', () => {
  for (const edit of [
    r => { const extra = structuredClone(r.slice(5, 7)); extra[0].payload.id = extra[1].payload.item.id = 'second'; r.splice(7, 0, ...extra); },
    r => { r[0].payload.thread_source = 'agent_forked_thread'; },
    r => { r[0].payload.forked_from_id = replayTaskId; },
    r => { r[0].payload.cli_version = '0.999.0'; },
    r => { r[0].payload.originator = 'CLI'; },
    r => { r.splice(4, 1); },
  ]) { const r = replayRecording(); edit(r); assert.notEqual(project(r).status, 'matched'); }
});
