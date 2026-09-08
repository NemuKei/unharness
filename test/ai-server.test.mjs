import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { userSourceState, listUserFavorites } from '../src/sources/service.mjs';
import { replayRecording } from '../test-support/replay-recording.mjs';

async function connect(t, p, protocolVersions) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [resolve('bin/unharness.mjs'), 'mcp', '--workspace', p.workspace], stderr: 'pipe' });
  let errors = '';
  transport.stderr.on('data', data => { errors += data; });
  const client = new Client({ name: 'unharness-qualification-client', version: '1.0.0' },
    { capabilities: {}, ...(protocolVersions ? { supportedProtocolVersions: protocolVersions }
      : { versionNegotiation: { mode: { pin: '2026-07-28' } } }) });
  t.after(() => client.close());
  await client.connect(transport, { timeout: 5000 });
  async function call(name, args = {}) {
    const response = await client.callTool({ name, arguments: args }, { timeout: 10000 });
    assert.ok(response.structuredContent, JSON.stringify(response));
    for (const text of response.content.filter(c => c.type === 'text'))
      assert.deepEqual(JSON.parse(text.text), response.structuredContent);
    return response;
  }
  const status = (await call('status')).structuredContent;
  assert.equal(status.ok, true);
  const connectionId = status.result.connectionId;
  const mutate = async (name, args = {}, requestId = randomUUID()) => call(name, { ...args, connectionId, requestId });
  return { client, call, mutate, connectionId, status: status.result, errors: () => errors };
}

for (const protocols of [undefined, ['2025-11-25']]) test(`official stdio client sees a fixed truthful catalog (${protocols?.[0] ?? 'current'})`, async t => {
  const p = await aiProfile(t), s = await connect(t, p, protocols);
  assert.equal(s.client.getServerVersion().name, 'unharness');
  assert.equal(s.client.getNegotiatedProtocolVersion(), protocols?.[0] ?? '2026-07-28');
  const tools = (await s.client.listTools()).tools;
  const names = tools.map(tool => tool.name);
  for (const name of ['status', 'operation_status', 'plan_mode', 'apply_plan', 'save_favorite', 'recover', 'observe_task', 'compare_runs', 'review_start', 'handoff_replay', 'save_replay_favorite'])
    assert.ok(names.includes(name), name);
  assert.ok(!names.some(name => /register|discover|source_body/.test(name)));
  for (const tool of tools) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    assert.equal(tool.outputSchema.type, 'object', tool.name);
    assert.equal(tool.annotations.openWorldHint, false, tool.name);
  }
  assert.equal(tools.find(t => t.name === 'status').annotations.readOnlyHint, true);
  assert.equal(tools.find(t => t.name === 'plan_mode').annotations.readOnlyHint, false);
  assert.equal(s.status.source.preparedMode, 'normal');
  assert.equal(s.status.source.verification.runtimeStateVerified, false);
  assert.equal(s.status.source.registration.scopeId, p.scopeId);
  assert.ok(!JSON.stringify(s.status).includes('PRIVATE_TEST'));
  assert.equal(s.errors(), '');
});

async function syntheticRecording(p, { project = p.context.project, request = '  READY\n', createdAt = new Date().toISOString(), answer = 'READY' } = {}) {
  const taskId = randomUUID();
  const records = replayRecording({ taskId, project, request, createdAt,
    instructions: '# PRIVATE_TEST optional user guide\n\n--- project-doc ---\n\n# Required project instructions' });
  records.find(r => r.type === 'response_item' && r.payload.role === 'assistant').payload.content[0].text = answer;
  records.at(-1).payload.last_agent_message = answer;
  await mkdir(join(p.context.codexHome, 'sessions'), { recursive: true });
  await writeFile(join(p.context.codexHome, 'sessions', `rollout-${taskId}.jsonl`), records.map(r => JSON.stringify(r)).join('\n') + '\n');
  await new Promise(resolve => setTimeout(resolve, 25));
  return taskId;
}

test('MCP ordinary observations, attributed assessments, explicit output and historical favorites share private records', async t => {
  const p = await aiProfile(t, { skills: false }), s = await connect(t, p);
  const taskId = await syntheticRecording(p, { answer: 'PRIVATE SAVED ANSWER' });
  const observation = (await s.mutate('observe_task', { taskId })).structuredContent;
  assert.equal(observation.ok, true, JSON.stringify(observation));
  assert.equal(observation.result.status, 'matched-record');
  const review = (await s.mutate('review_run', { taskId })).structuredContent;
  assert.equal(review.ok, true, JSON.stringify(review));
  const assessment = { outcome: 'accepted', provenance: 'agent', requirements: [{ id: 'complete', label: 'Complete the request', critical: true, result: 'pass' }], ratings: [] };
  const saved = (await s.mutate('save_run', { reviewId: review.result.reviewId, assessment })).structuredContent;
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const { runId } = saved.result;
  const read = (await s.call('read_run', { runId })).structuredContent;
  assert.equal(read.result.assessment.provenance, 'agent');
  const history = (await s.call('list_runs')).structuredContent;
  const compared = (await s.call('compare_runs', { runIds: [runId] })).structuredContent;
  assert.equal(compared.result.aggregate.totalTokens, 100);
  assert.equal(compared.result.creationEligible, false);
  assert.ok(!JSON.stringify([review, saved, read, history, compared]).includes('PRIVATE SAVED ANSWER'));
  assert.equal((await s.call('read_run_output', { runId })).structuredContent.result.text, 'PRIVATE SAVED ANSWER');
  assert.equal((await s.mutate('save_run_favorite', { runId })).structuredContent.ok, true);
});

test('MCP saved starts and sequential replay preserve exact inputs and expose recorded results', async t => {
  const p = await aiProfile(t, { skills: false }), s = await connect(t, p);
  const declaration = { request: '  READY\n', requirements: [{ id: 'complete', label: 'Exactly READY', critical: true }], ratings: [],
    budget: { maxAttempts: 2, maxTurnsPerAttempt: 1, maxRecordedTokens: 150 } };
  await writeFile(join(p.context.project, 'work.bin'), Buffer.from([0, 255, 2]));
  const reviewed = (await s.mutate('review_start', { declaration })).structuredContent;
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  const start = (await s.mutate('save_start', { reviewId: reviewed.result.reviewId })).structuredContent;
  assert.equal(start.ok, true, JSON.stringify(start));
  const { startId } = start.result;
  assert.deepEqual((await s.call('read_start', { startId })).structuredContent.result.declaration, declaration);
  assert.equal((await s.call('list_starts')).structuredContent.result.starts.length, 1);
  const plan = (await s.mutate('review_replay', { startId })).structuredContent;
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const prepared = (await s.mutate('prepare_replay', { reviewId: plan.result.reviewId })).structuredContent;
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  const { attemptId } = prepared.result;
  const ready = (await s.mutate('handoff_replay', { attemptId })).structuredContent;
  assert.equal(ready.ok, true, JSON.stringify(ready));
  assert.equal(ready.result.request, declaration.request);
  assert.equal(ready.result.desktopRuntimeVerified, false);
  const taskId = await syntheticRecording(p, { project: ready.result.project, createdAt: new Date(Date.parse(ready.result.readyAt) + 1).toISOString() });
  await writeFile(join(ready.result.project, 'answer.txt'), 'Produced output');
  const observed = (await s.mutate('observe_replay', { attemptId, taskId })).structuredContent;
  assert.equal(observed.ok, true, JSON.stringify(observed));
  assert.equal(observed.result.qualification.status, 'matched-record');
  const saved = (await s.mutate('save_replay_result', { resultReviewId: observed.result.resultReviewId,
    assessment: { outcome: 'accepted', requirements: [{ id: 'complete', result: 'pass' }], ratings: [], provenance: 'agent' } })).structuredContent;
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(saved.result.acceptance.accepted, true);
  const { resultId } = saved.result;
  assert.equal((await s.call('read_replay_result', { resultId })).structuredContent.result.resultId, resultId);
  assert.equal((await s.call('read_replay', { attemptId })).structuredContent.result.phase, 'recorded');
  assert.equal((await s.call('list_replays')).structuredContent.result.activeAttemptId, null);
  assert.equal((await s.call('compare_replays', { resultIds: [resultId] })).structuredContent.result.aggregate.totalTokens, 100);
  assert.equal((await s.mutate('save_replay_favorite', { resultId })).structuredContent.ok, true);
  assert.deepEqual(await readFile(join(p.context.project, 'work.bin')), Buffer.from([0, 255, 2]));
});

test('stdio mode loop, favorite, duplicate result and reconnect share the registered core', async t => {
  const p = await aiProfile(t), s = await connect(t, p);
  const saveId = randomUUID();
  const saved = (await s.mutate('save_favorite', { name: 'MCP Normal' }, saveId)).structuredContent;
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const favoriteId = saved.result.favoriteId;
  for (const mode of ['unseal', 'trueform', 'normal']) {
    const plan = (await s.mutate('plan_mode', { mode })).structuredContent;
    assert.equal(plan.ok, true, JSON.stringify(plan));
    const applied = (await s.mutate('apply_plan', { planId: plan.result.planId })).structuredContent;
    assert.equal(applied.ok, true, JSON.stringify(applied));
    assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, mode);
  }
  const restore = (await s.mutate('plan_favorite', { favoriteId })).structuredContent;
  assert.equal((await s.mutate('apply_plan', { planId: restore.result.planId })).structuredContent.ok, true);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  const second = await connect(t, p);
  const retry = (await second.call('save_favorite', { name: 'MCP Normal', connectionId: s.connectionId, requestId: saveId })).structuredContent;
  assert.deepEqual(retry, saved);
  const receipt = (await second.call('operation_status', { requestId: saveId })).structuredContent;
  assert.equal(receipt.result.state, 'completed');
  assert.equal(receipt.result.result.result.favoriteId, favoriteId);
  assert.equal((await listUserFavorites({ workspace: p.workspace })).favorites.length, 1);
  assert.equal((await s.mutate('recover')).structuredContent.ok, true);
});

test('stdio schemas reject arbitrary paths and extra keys before private writes, with safe errors', async t => {
  const p = await aiProfile(t), s = await connect(t, p);
  for (const [name, args] of [
    ['save_favorite', { name: 'bad', workspace: '/PRIVATE_PATH' }],
    ['apply_plan', { planId: 'x', executable: '/PRIVATE_PATH' }],
    ['plan_mode', { mode: 'trueform', selectedIds: ['skill-other'] }],
    ['review_start', { declaration: {}, additionalPaths: ['../../PRIVATE_PATH'] }],
    ['status', { PRIVATE_TEST_SECRET: 'x' }],
    ['__proto__', {}],
  ]) {
    const response = await s.call(name, name === 'status' || name === '__proto__' ? args : { ...args, connectionId: s.connectionId, requestId: randomUUID() });
    assert.equal(response.isError, true);
    assert.equal(response.structuredContent.ok, false);
    assert.equal(response.structuredContent.error.kind, 'invalid-request');
    assert.ok(!JSON.stringify(response).includes('PRIVATE'));
  }
  assert.ok(!(await readdir(p.workspace)).includes('ai-requests'));
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('a stale MCP plan refuses an independent edit and retains deterministic recovery access', async t => {
  const p = await aiProfile(t), s = await connect(t, p);
  const plan = (await s.mutate('plan_mode', { mode: 'trueform' })).structuredContent.result;
  const path = join(p.context.codexHome, 'AGENTS.md'), before = await readFile(path);
  await writeFile(path, Buffer.concat([before, Buffer.from('\nINDEPENDENT_EDIT\n')]));
  const result = await s.mutate('apply_plan', { planId: plan.planId });
  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.error.kind, 'source-conflict');
  assert.match(await readFile(path, 'utf8'), /INDEPENDENT_EDIT/);
  const status = (await s.call('status')).structuredContent.result;
  assert.equal(status.source.conflict.kind, 'source-conflict');
  assert.ok(status.source.recovery.argv.includes('recover'));
});

for (const invalid of ['duplicate-keys', 'oversized-frame', 'invalid-utf8']) test(`${invalid} closes the stdio boundary before any request can mutate`, async t => {
  const p = await aiProfile(t);
  const child = spawn(process.execPath, [resolve('bin/unharness.mjs'), 'mcp', '--workspace', p.workspace], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exit = once(child, 'exit');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  t.after(() => { clearTimeout(timer); if (child.exitCode === null) child.kill('SIGKILL'); });
  let errors = '', output = '';
  child.stderr.on('data', d => { errors += d; });
  child.stdout.on('data', d => { output += d; });
  child.stdin.on('error', () => {});
  child.stdin.write(invalid === 'duplicate-keys' ? '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"status","name":"save_favorite"}}\n'
    : invalid === 'oversized-frame' ? ' '.repeat(256 * 1024 + 1)
      : Buffer.from([0xff, 0xfe, 0x0a]));
  const [code, signal] = await exit;
  assert.equal(signal, null);
  assert.equal(code, 1);
  assert.equal(errors, 'Unharness MCP: invalid protocol input.\n');
  assert.equal(output, '');
  assert.ok(!(await readdir(p.workspace)).includes('ai-requests'));
});

test('MCP negotiation is required for legacy tools and clean EOF releases the local process', async t => {
  const p = await aiProfile(t);
  const child = spawn(process.execPath, [resolve('bin/unharness.mjs'), 'mcp', '--workspace', p.workspace], { stdio: ['pipe', 'pipe', 'pipe'] });
  const exit = once(child, 'exit'), lines = createInterface({ input: child.stdout });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  t.after(() => { clearTimeout(timer); lines.close(); if (child.exitCode === null) child.kill('SIGKILL'); });
  const reply = once(lines, 'line');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'status', arguments: {} } }) + '\n');
  const value = JSON.parse((await reply)[0]);
  assert.equal(value.result.isError, true);
  assert.equal(value.result.structuredContent.error.kind, 'invalid-request');
  child.stdin.end();
  assert.deepEqual(await exit, [0, null]);
  assert.ok(!(await readdir(p.workspace)).includes('ai-requests'));
});

test('CLI help, registered status and offline recovery stay usable without MCP or authoring dependencies', async t => {
  const p = await aiProfile(t);
  const { stdout } = await promisify(execFile)(process.execPath, ['test-support/ai-node-only.mjs', p.workspace], { timeout: 10000 });
  assert.deepEqual(JSON.parse(stdout), { codes: [0, 0, 0, 0], help: true, errors: 0 });
});
