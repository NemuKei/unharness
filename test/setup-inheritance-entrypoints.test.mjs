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
import { addSetupSkill } from '../test-support/setup-profile.mjs';
import { openWorkspace } from '../src/sources/records.mjs';

async function entries(t) {
  const p = await aiProfile(t);
  const client = new Client({ name: 'unharness-inheritance-test', version: '1.0.0' },
    { capabilities: {}, versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [resolve('bin/unharness.mjs'), 'mcp', '--workspace', p.workspace], stderr: 'pipe' }), { timeout: 5000 });
  t.after(() => client.close());
  const call = async (name, args = {}) => (await client.callTool({ name, arguments: args }, { timeout: 10000 })).structuredContent;
  let { result: status } = await call('status');
  const mutate = (name, args, requestId = randomUUID()) => call(name, { ...args, connectionId: status.connectionId, requestId });
  const assetsDirectory = join(p.parent, 'assets'); await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory }); t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  headers['X-Unharness-Token'] = (await (await fetch(gui.url + '/api/bootstrap', { headers })).json()).token;
  let meta = await (await fetch(gui.url + '/api/sources/metadata', { headers })).json();
  const refresh = async () => {
    status = (await call('status')).result;
    meta = await (await fetch(gui.url + '/api/sources/metadata', { headers })).json();
    return status;
  };
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
  return { ...p, proposal, inventory, call, mutate, http, cli, refresh };
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

test('v2 registration reviews match across all entries and require refreshed context plus separate setup after adoption', async t => {
  const p = await entries(t);
  const setup = await p.mutate('review_setup', { proposal: p.proposal });
  assert.equal((await p.mutate('apply_setup', { reviewId: setup.result.reviewId })).ok, true);
  const n = await addSetupSkill(p), inventory = (await p.call('enrollment_inventory')).result;
  assert.equal(inventory.enrollmentSchemaVersion, 2);
  const addition = { sourceId: inventory.candidates[0].id, origin: 'self', reason: 'Confirmed optional fixture source.' };
  const args = { discoveryId: inventory.discoveryId, additions: [addition] };
  const cli = await p.cli('review-enrollment', args); assert.equal(cli.code, 0);
  const http = await p.http('review-enrollment', args); assert.equal(http.ok, true);
  const mcp = await p.mutate('review_enrollment', args); assert.equal(mcp.ok, true, JSON.stringify(mcp));
  assert.deepEqual(mcp.result, cli.result); assert.deepEqual(http.result, cli.result);
  assert.equal(mcp.result.setupId, null); assert.equal(mcp.result.sourceFilesChanged, 0);
  const requestId = randomUUID(), adoptArgs = { reviewId: mcp.result.reviewId };
  const adopted = await p.mutate('apply_enrollment', adoptArgs, requestId); assert.equal(adopted.ok, true);
  assert.deepEqual(await p.mutate('apply_enrollment', adoptArgs, requestId), adopted);
  const stale = await p.mutate('plan_mode', { mode: 'trueform' }); assert.equal(stale.error.kind, 'source-session-changed');
  const status = await p.refresh(); assert.equal(status.source.registration.modeChangeRequired, true);
  assert.equal((await p.mutate('plan_mode', { mode: 'trueform' })).error.kind, 'setup-required');
  assert.equal((await p.http('plan', { mode: 'unseal' })).error.kind, 'setup-required');
  assert.equal((await p.cli('plan', { mode: 'trueform' })).result.error.kind, 'setup-required');
  const saved = (await p.call('read_setup')).result;
  assert.equal(saved.setupId, null);
  assert.deepEqual(saved.enrollment.roles, [...p.proposal.roles, addition]);
  assert.deepEqual((await p.cli('setup')).result, saved);
  assert.deepEqual((await p.http('setup')).result, saved);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.deepEqual(await readFile(n.path), n.bytes);
  const proposal = { ...p.proposal, scopeId: saved.scopeId, normalId: saved.normalId, inventoryId: saved.inventory.inventoryId,
    roles: saved.enrollment.roles };
  const reviewed = await p.mutate('review_setup', { proposal }); assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  assert.equal((await p.http('apply-setup', { reviewId: reviewed.result.reviewId })).ok, true);
  assert.equal((await openWorkspace(p.workspace)).state.scopePreparationRequired, true);
  const plan = await p.mutate('plan_mode', { mode: 'trueform' }); assert.equal(plan.ok, true);
  assert.equal((await p.mutate('apply_plan', { planId: plan.result.planId })).ok, true);
  assert.equal((await openWorkspace(p.workspace)).state.scopePreparationRequired, false);
  assert.match(await readFile(join(n.path, '..', 'agents/openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  const receipt = (await p.call('operation_status', { requestId })).result;
  assert.equal(receipt.state, 'completed'); assert.equal(receipt.result.result.nextScopeId, adopted.result.nextScopeId);
  assert.ok(!JSON.stringify([mcp, adopted, saved]).includes('PRIVATE_TEST'));
});

test('v2 enrollment entry points reject legacy choices, arbitrary paths and claimed official origin', async t => {
  const p = await entries(t);
  const setup = await p.mutate('review_setup', { proposal: p.proposal });
  assert.equal((await p.mutate('apply_setup', { reviewId: setup.result.reviewId })).ok, true);
  const n = await addSetupSkill(p), inventory = (await p.call('enrollment_inventory')).result;
  const base = { sourceId: inventory.candidates[0].id, origin: 'self', reason: 'Confirmed fixture.' };
  for (const [extra, mcpKind] of [[{ unseal: 'automatic', trueform: 'manual' }, 'enrollment-proposal-invalid'],
    [{ path: n.path }, 'invalid-request'], [{ eligibility: 'official-confirmed' }, 'invalid-request']]) {
    const args = { discoveryId: inventory.discoveryId, additions: [{ ...base, ...extra }] };
    const cli = await p.cli('review-enrollment', args); assert.equal(cli.code, 1); assert.equal(cli.result.error.kind, 'enrollment-proposal-invalid');
    const http = await p.http('review-enrollment', args); assert.equal(http.ok, false); assert.equal(http.error.kind, 'enrollment-proposal-invalid');
    const mcp = await p.mutate('review_enrollment', args); assert.equal(mcp.ok, false); assert.equal(mcp.error.kind, mcpKind);
  }
  assert.equal((await openWorkspace(p.workspace)).reg.skills.length, 1);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
  assert.deepEqual(await readFile(n.path), n.bytes);
});
