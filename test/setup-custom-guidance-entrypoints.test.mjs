import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { sourcesMain } from '../src/sources/cli.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { AI_TOOLS } from '../src/ai/tools.mjs';

async function entries(t) {
  const p = await aiProfile(t);
  const client = new Client({ name: 'unharness-custom-guide-test', version: '1.0.0' },
    { capabilities: {}, versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [resolve('bin/unharness.mjs'), 'mcp', '--workspace', p.workspace], stderr: 'pipe' }), { timeout: 5000 });
  t.after(() => client.close());
  const call = async (name, args = {}) => (await client.callTool({ name, arguments: args }, { timeout: 10000 })).structuredContent;
  const status = (await call('status')).result;
  const mutate = (name, args, requestId = randomUUID()) => call(name, { ...args, connectionId: status.connectionId, requestId });
  const assetsDirectory = join(p.parent, 'assets'); await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory }); t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  headers['X-Unharness-Token'] = (await (await fetch(gui.url + '/api/bootstrap', { headers })).json()).token;
  const meta = await (await fetch(gui.url + '/api/sources/metadata', { headers })).json();
  const http = async (action, args = {}) => {
    const response = await fetch(gui.url + '/api/sources/' + action, { method: 'POST', headers,
      body: JSON.stringify({ ...args, requestId: randomUUID(), launchId: meta.launchId, contextId: meta.contextId }) });
    return { ok: response.ok, ...await response.json() };
  };
  const cli = async (action, args = {}) => {
    let stdout = '', stderr = '';
    const code = await sourcesMain(['sources', action, '--json', JSON.stringify({ workspace: p.workspace, ...args })],
      { stdout: { write: text => { stdout += text; } }, stderr: { write: text => { stderr += text; } } });
    return { code, result: JSON.parse(stdout || stderr) };
  };
  return { ...p, call, mutate, http, cli };
}
const customText = '# Reviewed extra instructions\n\nOnly use requested workflow skills.\n';
function proposal(p, inventory) {
  return { schemaVersion: 4, scopeId: p.scopeId, normalId: p.normalId, inventoryId: inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model',
        title: 'Fixture reference', checkedAt: '2026-09-20T00:00:00.000Z' }], rationale: 'Explicit custom fixture.' },
    roles: inventory.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Owned optional source' })),
    trueform: { skillStates: inventory.skills.map(s => ({ sourceId: s.id, state: 'manual' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: 'custom', customInstructions: customText, skillElevations: [], additionalPluginIds: [] } };
}

test('v4 custom guidance uses the same reviewed content through MCP, CLI and authenticated HTTP', async t => {
  const p = await entries(t), setup = await p.call('read_setup', { schemaVersion: 4 });
  assert.equal(setup.ok, true, JSON.stringify(setup));
  const input = proposal(p, setup.result.inventory);
  assert.equal(AI_TOOLS.find(t => t.definition.name === 'review_setup').schema.safeParse({
    proposal: input, connectionId: randomUUID(), requestId: randomUUID() }).success, true);
  const cli = await p.cli('review-setup', { proposal: input }); assert.equal(cli.code, 0);
  const http = await p.http('review-setup', { proposal: input }); assert.equal(http.ok, true);
  const mcp = await p.mutate('review_setup', { proposal: input }); assert.equal(mcp.ok, true);
  assert.equal(mcp.result.reviewId, cli.result.reviewId);
  assert.equal(http.result.reviewId, cli.result.reviewId);
  assert.equal(mcp.result.presets.unseal.customInstructions, customText);
  assert.equal(Object.hasOwn(mcp.result.presets.trueform, 'customInstructions'), false);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  const requestId = randomUUID(), args = { reviewId: mcp.result.reviewId };
  const adopted = await p.mutate('apply_setup', args, requestId); assert.equal(adopted.ok, true);
  assert.deepEqual(await p.mutate('apply_setup', args, requestId), adopted);
  assert.equal((await p.call('operation_status', { requestId })).result.state, 'completed');
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  const unseal = await p.http('plan', { mode: 'unseal' }); assert.equal(unseal.ok, true);
  assert.equal((await p.http('apply', { planId: unseal.result.planId })).ok, true);
  assert.equal((await readSourceProfileFiles(p.context)).override.text, customText);
  const zero = await p.mutate('plan_mode', { mode: 'trueform' }); assert.equal(zero.ok, true);
  assert.equal((await p.mutate('apply_plan', { planId: zero.result.planId })).ok, true);
  assert.equal((await readSourceProfileFiles(p.context)).override.text, '<!-- -->\n');
  const normal = await p.cli('plan', { mode: 'normal' }); assert.equal(normal.code, 0);
  assert.equal((await p.cli('apply', { planId: normal.result.planId })).code, 0);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('v4 entrypoints reject oversized Unicode or path-shaped custom content without echoing the body', async t => {
  const p = await entries(t), setup = await p.cli('setup', { schemaVersion: 4 }), input = proposal(p, setup.result.inventory);
  for (const customInstructions of ['あ'.repeat(2731), { path: 'PRIVATE_PATH' }]) {
    const value = { ...input, unseal: { ...input.unseal, customInstructions } };
    const cli = await p.cli('review-setup', { proposal: value }); assert.equal(cli.code, 1);
    assert.equal(cli.result.error.kind, 'setup-proposal-invalid');
    const mcp = await p.mutate('review_setup', { proposal: value }); assert.equal(mcp.ok, false);
    assert.ok(['invalid-request', 'setup-proposal-invalid'].includes(mcp.error.kind));
    assert.ok(!JSON.stringify([cli, mcp]).includes('PRIVATE_PATH'));
  }
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});
