import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

export async function fixtureAiClient(t, workspace) {
  const client = new Client({ name: 'unharness-ui-test', version: '1.0.0' }, { capabilities: {} });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [resolve('bin/unharness.mjs'), 'mcp', '--workspace', workspace], stderr: 'pipe' });
  transport.stderr.resume();
  t.after(() => client.close());
  await client.connect(transport, { timeout: 5000 });
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args }, { timeout: 15000 });
    const value = response.structuredContent;
    assert.equal(value?.ok, true, JSON.stringify(value));
    return value.result;
  };
  const state = await call('status');
  const mutate = (name, args = {}) => call(name, { ...args, connectionId: state.connectionId, requestId: randomUUID() });
  const mode = async value => {
    const plan = await mutate('plan_mode', { mode: value });
    return mutate('apply_plan', { planId: plan.planId });
  };
  return { client, call, mutate, mode };
}
