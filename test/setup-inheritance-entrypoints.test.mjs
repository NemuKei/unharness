import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
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
  const client = new Client({ name: 'unharness-inheritance-test', version: '1.0.0' },
    { capabilities: {}, versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [resolve('bin/unharness.mjs'), 'mcp', '--workspace', p.workspace], stderr: 'pipe' }), { timeout: 5000 });
  t.after(() => client.close());
  const call = async (name, args = {}) => (await client.callTool({ name, arguments: args }, { timeout: 10000 })).structuredContent;
  const { result: status } = await call('status');
  const mutate = (name, args, requestId = randomUUID()) => call(name, { ...args, connectionId: status.connectionId, requestId });
  const assetsDirectory = join(p.parent, 'assets'); await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
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
  const inventory = (await call('read_setup')).result.inventory;
  const proposal = { schemaVersion: 2, scopeId: p.scopeId, normalId: p.normalId, inventoryId: inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Official reference',
        checkedAt: '2026-09-10T00:00:00Z' }], rationale: 'Reviewed synthetic condition' },
    roles: inventory.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Explicitly reviewed synthetic role' })),
    trueform: { retainedOfficialPluginIds: [] }, unseal: { instructions: 'minimal', additionalAutomaticSkillIds: inventory.skills.map(s => s.id) } };
  return { ...p, proposal, inventory, call, mutate, http, cli };
}

test('MCP, CLI and authenticated HTTP freeze the same v2 review; adoption and lost-response readback preserve source files', async t => {
  const p = await entries(t);
  assert.deepEqual((await p.cli('setup')).result.inventory, p.inventory);
  assert.deepEqual((await p.http('setup')).result.inventory, p.inventory);
  const cli = await p.cli('review-setup', { proposal: p.proposal }); assert.equal(cli.code, 0);
  const http = await p.http('review-setup', { proposal: p.proposal }); assert.equal(http.ok, true, JSON.stringify(http));
  const mcp = await p.mutate('review_setup', { proposal: p.proposal }); assert.equal(mcp.ok, true, JSON.stringify(mcp));
  assert.equal(mcp.result.reviewId, cli.result.reviewId); assert.equal(http.result.reviewId, cli.result.reviewId);
  assert.deepEqual(mcp.result.inheritance, cli.result.inheritance);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  const requestId = randomUUID(), args = { reviewId: mcp.result.reviewId };
  const adopted = await p.mutate('apply_setup', args, requestId); assert.equal(adopted.ok, true, JSON.stringify(adopted));
  assert.deepEqual(await p.mutate('apply_setup', args, requestId), adopted);
  const receipt = await p.call('operation_status', { requestId });
  assert.equal(receipt.result.state, 'completed');
  assert.equal(receipt.result.result.result.setupId, adopted.result.setupId);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  const plan = await p.http('plan', { mode: 'trueform' }); assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.equal(plan.result.setupId, adopted.result.setupId);
  assert.equal((await p.http('apply', { planId: plan.result.planId })).ok, true);
  assert.equal((await p.call('read_setup')).result.preparedSetupId, adopted.result.setupId);
  assert.match((await readSourceProfileFiles(p.context)).policy.text, /allow_implicit_invocation: false/);
  const normal = await p.mutate('plan_mode', { mode: 'normal' });
  assert.equal((await p.mutate('apply_plan', { planId: normal.result.planId })).ok, true);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.ok(!JSON.stringify([mcp, adopted]).includes('PRIVATE_TEST'));
  assert.ok(!JSON.stringify([mcp, adopted]).includes(p.context.codexHome));
});

test('all entry points refuse stale inventories, invented plugins and claimed official evidence', async t => {
  const p = await entries(t);
  for (const [proposal, coreKind, mcpKind = coreKind] of [
    [{ ...p.proposal, inventoryId: 'f'.repeat(64) }, 'stale-discovery'],
    [{ ...p.proposal, trueform: { retainedOfficialPluginIds: ['invented-official@openai-curated-remote'] } }, 'mode-inheritance-invalid'],
    [{ ...p.proposal, evidence: { official: true, body: 'PRIVATE_TEST' } }, 'setup-proposal-invalid', 'invalid-request'],
    [{ ...p.proposal, trueform: { automaticExternalSkillIds: [] } }, 'setup-proposal-invalid', 'invalid-request'],
    [{ ...p.proposal, unseal: { instructions: 'none', automaticSkillIds: [] } }, 'setup-proposal-invalid', 'invalid-request'],
  ]) {
    const cli = await p.cli('review-setup', { proposal }); assert.equal(cli.code, 1); assert.equal(cli.result.error.kind, coreKind);
    const http = await p.http('review-setup', { proposal }); assert.equal(http.ok, false); assert.equal(http.error.kind, coreKind);
    const mcp = await p.mutate('review_setup', { proposal }); assert.equal(mcp.ok, false); assert.equal(mcp.error.kind, mcpKind);
    assert.ok(!JSON.stringify([cli, http, mcp]).includes('PRIVATE_TEST'));
  }
  assert.equal((await p.call('read_setup')).result.setupId, null);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('the published MCP proposal schema names inheritance inputs without accepting paths or caller-supplied provenance', () => {
  const schema = AI_TOOLS.find(t => t.definition.name === 'review_setup').definition.inputSchema;
  const text = JSON.stringify(schema);
  assert.match(text, /retainedOfficialPluginIds/); assert.match(text, /additionalAutomaticSkillIds/); assert.match(text, /inventoryId/);
  assert.equal(schema.additionalProperties, false);
});
