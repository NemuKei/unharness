import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { captureRegistered, pathsFor } from '../src/sources/capture.mjs';
import { captureFile, writeComplete } from '../src/sources/platform.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

async function connect(t, workspace, interrupted = false) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: interrupted ? [resolve('test-support/ai-source-interrupt.mjs'), workspace]
      : [resolve('bin/unharness.mjs'), 'mcp', '--workspace', workspace], stderr: 'pipe' });
  const lines = createInterface({ input: transport.stderr });
  let paused;
  const pause = new Promise(resolve => { paused = resolve; });
  lines.on('line', line => { if (line === 'UNHARNESS_TEST_SOURCE_PAUSED') paused(); });
  const client = new Client({ name: 'unharness-recovery-test', version: '1.0.0' }, { capabilities: {} });
  t.after(async () => { lines.close(); await client.close(); });
  await client.connect(transport, { timeout: 5000 });
  const call = async (name, args = {}) => (await client.callTool({ name, arguments: args }, { timeout: 10000 })).structuredContent;
  const status = await call('status'); assert.equal(status.ok, true);
  const identity = { connectionId: status.result.connectionId };
  const mutate = (name, args = {}) => call(name, { ...identity, requestId: randomUUID(), ...args });
  return { transport, call, mutate, identity, pause };
}

test('a killed source mutation stays unconfirmed and a reconnected MCP recovery preserves independent edits', { timeout: 20000 }, async t => {
  const p = await aiProfile(t), s = await connect(t, p.workspace, true);
  const original = await captureRegistered((await openWorkspace(p.workspace)).reg);
  const plan = await s.mutate('plan_mode', { mode: 'trueform' }); assert.equal(plan.ok, true);
  const args = { ...s.identity, requestId: randomUUID(), planId: plan.result.planId };
  const pending = s.call('apply_plan', args).then(value => value, error => error);
  await s.pause;
  assert.ok(s.transport.pid > 0);
  process.kill(s.transport.pid, 'SIGKILL');
  assert.ok(await pending instanceof Error);
  assert.notDeepEqual(await readSourceProfileFiles(p.context), p.originalFiles);

  const resumed = await connect(t, p.workspace);
  const status = await resumed.call('status');
  assert.equal(status.result.source.recovery.pending, true);
  assert.equal((await resumed.call('operation_status', { requestId: args.requestId })).result.state, 'unconfirmed');
  assert.equal((await resumed.call('apply_plan', args)).error.kind, 'ai-operation-unconfirmed');

  const w = await openWorkspace(p.workspace);
  const journal = JSON.parse(await readFile(join(p.workspace, 'pending.json'), 'utf8'));
  const path = pathsFor(w.reg)[journal.keys[0]], partial = await captureFile(path);
  await writeFile(path, (partial?.text ?? '') + '\nINDEPENDENT_EDIT\n');
  const blocked = await resumed.mutate('recover');
  assert.equal(blocked.ok, false); assert.equal(blocked.error.kind, 'source-conflict');
  assert.match(await readFile(path, 'utf8'), /INDEPENDENT_EDIT/);
  assert.equal((await resumed.call('status')).result.source.recovery.pending, true);

  // Remove only this test's injected conflict, then explicitly request a new
  // recovery. Never repeat the interrupted apply or overwrite an unknown edit.
  await rm(path); if (partial !== null) await writeComplete(path, partial);
  const recovery = await resumed.mutate('recover');
  assert.equal(recovery.ok, true); assert.equal(recovery.result.status, 'restored');
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.deepEqual(await captureRegistered(w.reg), original);
  const final = (await resumed.call('status')).result.source;
  assert.equal(final.preparedMode, 'normal'); assert.equal(final.conflict, null); assert.equal(final.recovery.pending, false);
  assert.equal((await resumed.call('operation_status', { requestId: args.requestId })).result.state, 'unconfirmed');
});
