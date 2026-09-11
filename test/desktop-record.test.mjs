import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectDesktopRecord, findCurrentDesktopSession, summarizeDesktopRecords } from '../src/codex/desktop-record.mjs';
import { createDesktopFixture, fixtureMarkers, readDesktopFixture } from '../src/codex/desktop-fixture.mjs';
import { desktopMain } from '../src/codex/desktop-cli.mjs';

const markers = { fixed: 'FIXED_NONCE', procedure: 'PROCEDURE_NONCE', skillCatalog: 'CATALOG_NONCE', skillBody: 'BODY_NONCE' };
function record(type, payload) { return { type, payload }; }
function message(role, text, type = 'input_text') { return record('response_item', { type: 'message', role, content: [{ type, text }] }); }
function sample({ cwd = '/synthetic', timestamp = '2026-09-06T10:00:00Z' } = {}) {
  return [record('session_meta', { id: 'private-id', timestamp, cwd, originator: 'Codex Desktop', source: 'vscode', cli_version: '0.153.4', base_instructions: { text: 'PRIVATE SYSTEM' } }),
    message('developer', '<skills_instructions>### Available skills CATALOG_NONCE</skills_instructions>\n## Memory MEMORY_SUMMARY PRIVATE MEMORY'),
    message('user', 'FIXED_NONCE PROCEDURE_NONCE PRIVATE REQUEST'),
    record('world_state', { full: true, state: { host_skills: { body: 'CATALOG_NONCE' }, agents_md: { directory: cwd, text: 'FIXED_NONCE' }, permissions: { instructions: 'private hash' } } }),
    record('turn_context', { cwd, turn_id: 'private-turn', model: 'private-model' }),
    message('assistant', 'READY', 'output_text'),
    record('token_usage_record', { thread_id: 'private-id', usage: { input_tokens: 31337, cached_input_tokens: 100, total_tokens: 31350 } }),
    record('event_msg', { type: 'task_complete', turn_id: 'private-turn' })];
}

test('desktop projection retains source/usage availability and excludes private contents and totals', () => {
  const result = summarizeDesktopRecords(sample(), { expectedCwd: '/synthetic', preparedAt: '2026-09-06T09:00:00Z', markers });
  assert.equal(result.provenance.freshFixtureTaskCandidate, true);
  assert.equal(result.initialInput.memoryGuidance, true);
  assert.equal(result.initialInput.hostSkillCatalog, true);
  assert.equal(result.recordedSources.permissions, 'field-recorded');
  assert.equal(result.recordedSources.skills, 'unknown');
  assert.deepEqual(result.initialInput.markers, { fixed: 'present', procedure: 'present', skillCatalog: 'present', skillBody: 'absent-in-record' });
  assert.equal(result.usage.firstTurnCompleted, true);
  assert.equal(result.usage.records, 1);
  assert.equal(result.usage.fieldsPresent.input_tokens, true);
  for (const value of ['PRIVATE', 'private-id', 'private-turn', 'private-model', '/synthetic', '31337', 'NONCE']) assert.ok(!JSON.stringify(result).includes(value), value);
  assert.equal(result.desktopSessionAttached, false);
  assert.equal(result.runtimeStateVerified, false);
  assert.equal(result.modeSwitchingVerified, false);
  assert.equal(result.usage.completeness, 'unknown');
});

test('missing inputs and missing source fields remain unknown, never disabled', () => {
  const result = summarizeDesktopRecords(sample().filter(r => ['session_meta', 'turn_context'].includes(r.type)), { markers });
  assert.equal(result.initialInput.markers.fixed, 'unknown');
  assert.equal(result.provenance.freshFixtureTaskCandidate, false);
  assert.equal(result.recordedSources.agents_md, 'unknown');
});
test('desktop-work is recognized only for the version and agent route observed in the native app', () => {
  const records = sample();
  Object.assign(records[0].payload, { originator: 'codex_work_desktop', thread_source: 'agent_created_thread' });
  const options = { expectedCwd: '/synthetic', preparedAt: '2026-09-06T09:00:00Z' };
  assert.equal(summarizeDesktopRecords(records, options).provenance.freshFixtureTaskCandidate, true);
  for (const patch of [{ source: 'cli' }, { cli_version: '0.154.0' }, { thread_source: 'user' },
    { originator: 'codex_work_cli' }, { forked_from_id: 'another-task' }]) {
    const changed = structuredClone(records); Object.assign(changed[0].payload, patch);
    assert.equal(summarizeDesktopRecords(changed, options).provenance.freshFixtureTaskCandidate, false);
  }
});

test('CLI origin, forks, wrong cwd and stale preparation cannot qualify as a fresh fixture task', () => {
  for (const mutate of [s => { s[0].payload.originator = 'codex_cli_rs'; },
    s => { s[0].payload.forked_from_id = 'other'; },
    s => { s[0].payload.thread_source = 'agent_forked_thread'; },
    s => { s[0].payload.cwd = '/wrong'; },
    s => { s[4].payload.cwd = '/changed'; },
    s => { s[0].payload.timestamp = '2026-09-06T08:00:00Z'; }]) {
    const records = sample(); mutate(records);
    const result = summarizeDesktopRecords(records, { expectedCwd: '/synthetic', preparedAt: '2026-09-06T09:00:00Z', markers });
    assert.equal(result.provenance.freshFixtureTaskCandidate, false);
  }
});

test('records known task creation routes without echoing arbitrary source metadata', () => {
  for (const [source, expected] of [['user', 'user-created'], ['agent_created_thread', 'agent-created'],
    ['agent_forked_thread', 'agent-forked'],
    ['PRIVATE-ROUTE', 'unknown'], [{ private: 'PRIVATE-ROUTE' }, 'unknown'], [undefined, 'unknown']]) {
    const records = sample(); records[0].payload.thread_source = source;
    const result = summarizeDesktopRecords(records);
    assert.equal(result.provenance.recordedStartRoute, expected);
    assert.ok(!JSON.stringify(result).includes('PRIVATE-ROUTE'));
  }
});

test('assistant claims, tool output, later input and later world state cannot contaminate initial marker evidence', () => {
  const records = sample();
  records.push(message('assistant', 'BODY_NONCE', 'output_text'),
    record('response_item', { type: 'function_call_output', output: 'BODY_NONCE' }),
    message('user', 'BODY_NONCE'), record('world_state', { full: true, state: { agents_md: { text: 'BODY_NONCE' } } }));
  const result = summarizeDesktopRecords(records, { markers });
  assert.equal(result.initialInput.markers.skillBody, 'absent-in-record');
  assert.equal(result.fixtureBodyInToolOutput, true);
  assert.equal(result.fullWorldStateRecords, 2);
  assert.equal(result.runtimeStateVerified, false);
});

test('recognizes desktop custom-tool output text blocks without mixing them into initial input', () => {
  const records = sample();
  records.push(record('response_item', { type: 'custom_tool_call_output', output: [
    { type: 'input_text', text: 'Tool completed.' },
    { type: 'input_text', text: 'BODY_NONCE' },
  ] }));
  const result = summarizeDesktopRecords(records, { markers });
  assert.equal(result.fixtureBodyInToolOutput, true);
  assert.equal(result.initialInput.markers.skillBody, 'absent-in-record');
  assert.ok(!JSON.stringify(result).includes('BODY_NONCE'));
});

test('ignores body markers in custom-tool arguments, metadata and non-text output blocks', () => {
  const records = sample();
  records.push(record('response_item', { type: 'custom_tool_call', input: 'BODY_NONCE' }),
    record('response_item', { type: 'custom_tool_call_output', output: [
      { type: 'input_text', text: 'no body token', metadata: 'BODY_NONCE' },
      { type: 'input_image', image_url: 'BODY_NONCE' },
      { type: 'unknown', text: 'BODY_NONCE' },
    ] }),
    record('response_item', { type: 'custom_tool_call_output', output: { text: 'BODY_NONCE' } }));
  assert.equal(summarizeDesktopRecords(records, { markers }).fixtureBodyInToolOutput, false);
});

test('usage must belong to the selected task and contain nonnegative safe numeric fields', () => {
  const records = sample();
  records.push(record('token_usage_record', { thread_id: 'other', usage: { total_tokens: 9 } }),
    record('token_usage_record', { thread_id: 'private-id', usage: { total_tokens: -2 } }),
    record('token_usage_record', { thread_id: 'private-id', usage: { input_tokens: 'SECRET' } }));
  const result = summarizeDesktopRecords(records);
  assert.equal(result.usage.records, 1);
  assert.equal(result.usage.invalidRecords, 3);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('rejects ambiguous identity and malformed metadata', () => {
  for (const records of [[], [...sample(), sample()[0]], [record('session_meta', { id: 'x' })]]) {
    assert.throws(() => summarizeDesktopRecords(records), { kind: 'invalid-desktop-record' });
  }
  assert.throws(() => summarizeDesktopRecords(sample(), { expectedSessionId: 'another-task' }), { kind: 'desktop-record-identity-mismatch' });
});

test('version labels cannot export arbitrary private build metadata', () => {
  const records = sample();
  records[0].payload.cli_version = '0.153.4+PRIVATE-ID-0123456789';
  const result = summarizeDesktopRecords(records);
  assert.equal(result.codexCliVersion, '0.153.4');
  assert.ok(!JSON.stringify(result).includes('PRIVATE-ID'));
});

async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-record-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return parent;
}

test('reads a bounded explicit session and associates only an intact owned fixture', async t => {
  const parent = await setup(t);
  const fixture = await createDesktopFixture({ parent });
  const { state } = await readDesktopFixture(fixture.fixture);
  const records = sample({ cwd: fixture.project, timestamp: new Date(Date.now() + 1000).toISOString() });
  records[2] = message('user', fixtureMarkers(state.seed).fixed);
  const session = join(parent, 'セッション.jsonl');
  await writeFile(session, records.map(JSON.stringify).join('\n') + '\n');
  const result = await collectDesktopRecord({ session, fixture: fixture.fixture });
  assert.equal(result.provenance.freshFixtureTaskCandidate, true);
  assert.equal(result.initialInput.markers.fixed, 'present');
  await writeFile(join(fixture.project, 'AGENTS.md'), 'external edit');
  await assert.rejects(collectDesktopRecord({ session, fixture: fixture.fixture }), { kind: 'fixture-conflict' });
});

test('a partial final append is marked incomplete; malformed complete lines fail safely', async t => {
  const parent = await setup(t); const session = join(parent, 'partial.jsonl');
  const content = sample().map(JSON.stringify).join('\n');
  await writeFile(session, content + '\n{"private-incomplete');
  assert.equal((await collectDesktopRecord({ session })).recordRead.incompleteTrailingLine, true);
  await writeFile(session, content + '\n{"private-incomplete\n');
  await assert.rejects(collectDesktopRecord({ session }), { kind: 'invalid-desktop-record' });
  await writeFile(session, content);
  assert.equal((await collectDesktopRecord({ session })).recordRead.incompleteTrailingLine, false);
});

test('desktop CLI validates arguments, sanitizes errors and never replaces an output', async t => {
  const parent = await setup(t); const session = join(parent, 'session.jsonl');
  await writeFile(session, sample().map(JSON.stringify).join('\n') + '\n');
  let out = ''; let err = '';
  const io = { stdout: { write(s) { out += s; } }, stderr: { write(s) { err += s; } } };
  for (const args of [['inspect-desktop'], ['desktop-fixture', 'set', '--fixture', 'PRIVATE', '--case', 'TRUEFORM'],
    ['inspect-desktop', '--current', '--session', session], ['inspect-desktop', '--current', '--current'],
    ['desktop-fixture', 'create', '--parent', parent, '--parent', parent]]) assert.equal(await desktopMain(args, io), 2);
  assert.ok(!err.includes('PRIVATE'));
  const output = join(parent, '出 力.json');
  out = '';
  assert.equal(await desktopMain(['inspect-desktop', '--session', session, '--output', output], io), 0);
  const saved = await readFile(output, 'utf8');
  assert.equal(saved, out);
  assert.equal(await desktopMain(['inspect-desktop', '--session', session, '--output', output], io), 1);
  assert.equal(await readFile(output, 'utf8'), saved);
  assert.equal(await desktopMain(['inspect-desktop', '--session', 'PRIVATE-MISSING'], io), 1);
  assert.ok(!err.includes('PRIVATE'));
});

test('current-session discovery selects one ID by filename without reading other task contents', async t => {
  const parent = await setup(t);
  const directory = join(parent, 'sessions', '2026', '09', '06');
  await mkdir(directory, { recursive: true });
  const sessionId = '00000000-1111-2222-3333-444444444444';
  const selected = join(directory, `rollout-time-${sessionId}.jsonl`);
  await writeFile(selected, 'not read during filename discovery');
  await writeFile(join(directory, 'unrelated.jsonl'), '{ invalid private contents');
  assert.equal(await findCurrentDesktopSession({ codexHome: parent, sessionId }), selected);
  await assert.rejects(findCurrentDesktopSession({ codexHome: parent, sessionId: '../../PRIVATE' }), { kind: 'current-session-unavailable' });
  await writeFile(join(directory, `duplicate-${sessionId}.jsonl`), '');
  await assert.rejects(findCurrentDesktopSession({ codexHome: parent, sessionId }), { kind: 'current-session-unavailable' });
});

test('rejects oversized input and oversized incomplete trailing records', async t => {
  const parent = await setup(t); const path = join(parent, 'large.jsonl');
  await writeFile(path, sample().map(JSON.stringify).join('\n') + '\n{' + 'x'.repeat(8 * 1024 * 1024));
  await assert.rejects(collectDesktopRecord({ session: path }), { kind: 'desktop-record-too-large' });
  const { open } = await import('node:fs/promises');
  const handle = await open(path, 'w');
  await handle.truncate(64 * 1024 * 1024 + 1); await handle.close();
  await assert.rejects(collectDesktopRecord({ session: path }), { kind: 'desktop-record-too-large' });
});

test('rejects a named pipe before opening it', { skip: process.platform === 'win32' }, async t => {
  const parent = await setup(t); const path = join(parent, 'pipe.jsonl');
  const result = spawnSync('mkfifo', [path], { timeout: 3000 });
  assert.equal(result.status, 0);
  await assert.rejects(collectDesktopRecord({ session: path }), { kind: 'invalid-desktop-record' });
});
