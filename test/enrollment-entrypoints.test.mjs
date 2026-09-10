import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setupProfile, addSetupSkill } from '../test-support/setup-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { createSourceController } from '../src/sources/session.mjs';
import { sourcesMain } from '../src/sources/cli.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

test('MCP enrollment keeps duplicate receipts across the scope change and reconnect; stale context requires status', async t => {
  const p = await setupProfile(t), n = await addSetupSkill(p), ai = await fixtureAiClient(t, p.workspace);
  const controller = await createSourceController(p.context, { workspace: p.workspace }), metadata = await controller.metadata();
  const inventory = await ai.call('enrollment_inventory'), candidate = inventory.candidates.find(s => s.label === 'new-example');
  const body = await ai.call('review_candidate', { discoveryId: inventory.discoveryId, sourceId: candidate.id });
  assert.equal(body.text, n.bytes.toString()); assert.equal(body.contentRole, 'data');
  const reviewed = await ai.mutate('review_enrollment', { discoveryId: inventory.discoveryId,
    additions: [{ sourceId: candidate.id, origin: 'self', reason: 'Confirmed fixture.', unseal: 'automatic', trueform: 'manual' }] });
  const before = await readSourceProfileFiles(p.context), requestId = randomUUID(), state = await ai.call('status');
  const args = { reviewId: reviewed.reviewId, requestId, connectionId: state.connectionId };
  const first = (await ai.client.callTool({ name: 'apply_enrollment', arguments: args })).structuredContent;
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.operation.state, 'completed');
  const duplicate = (await ai.client.callTool({ name: 'apply_enrollment', arguments: args })).structuredContent;
  assert.deepEqual(duplicate, first);
  assert.deepEqual(await readSourceProfileFiles(p.context), before);
  assert.deepEqual(await readFile(n.path), n.bytes);
  const stale = (await ai.client.callTool({ name: 'plan_mode', arguments: { connectionId: state.connectionId, requestId: randomUUID(), mode: 'trueform' } })).structuredContent;
  assert.equal(stale.error.kind, 'source-session-changed');
  await assert.rejects(controller.execute('plan', { ...metadata, mode: 'trueform' }), { kind: 'gui-invalid-request' });
  await assert.rejects(controller.execute('plan', { launchId: metadata.launchId, contextId: metadata.contextId, mode: 'trueform' }), { kind: 'gui-source-context-changed' });
  const next = await ai.call('status');
  assert.equal(next.scopeId, reviewed.nextScopeId);
  assert.equal(next.source.registration.rootScopeId, p.scopeId);
  assert.equal(next.source.registration.modeChangeRequired, true);
  const plan = await ai.mutate('plan_mode', { mode: 'trueform' });
  assert.equal(plan.setupId, reviewed.setupId);
  await ai.mutate('apply_plan', { planId: plan.planId });
  assert.match(await readFile(join(n.path, '..', 'agents', 'openai.yaml'), 'utf8'), /allow_implicit_invocation: false/);
  const reconnected = await fixtureAiClient(t, p.workspace);
  const receipt = await reconnected.call('operation_status', { requestId });
  assert.equal(receipt.state, 'completed'); assert.deepEqual(receipt.result.result, first.result);
  assert.equal((await reconnected.call('read_setup')).setupId, reviewed.setupId);
  assert.equal((await reconnected.call('enrollment_inventory')).candidates.length, 0);
});

test('enrollment CLI and HTTP refuse duplicate keys, arbitrary contexts and oversized requests before adoption', async t => {
  const p = await setupProfile(t), n = await addSetupSkill(p);
  async function cli(action, text) {
    let stdout = '', stderr = '';
    const code = await sourcesMain(['sources', action, '--json', text], { stdout: { write: t => { stdout += t; } }, stderr: { write: t => { stderr += t; } } });
    return { code, stdout, stderr };
  }
  const read = await cli('enrollment-inventory', JSON.stringify({ workspace: p.workspace }));
  assert.equal(read.code, 0); assert.equal(JSON.parse(read.stdout).candidates.length, 1);
  const duplicated = await cli('enrollment-inventory', `{"workspace":${JSON.stringify(p.workspace)},"workspace":${JSON.stringify(p.workspace)}}`);
  assert.equal(duplicated.code, 1); assert.equal(duplicated.stdout, ''); assert.ok(!duplicated.stderr.includes(p.workspace));
  const assetsDirectory = join(p.parent, 'assets'); await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory }); t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  headers['X-Unharness-Token'] = (await (await fetch(gui.url + '/api/bootstrap', { headers })).json()).token;
  const metadata = await (await fetch(gui.url + '/api/sources/metadata', { headers })).json();
  const fields = { requestId: randomUUID(), launchId: metadata.launchId, contextId: metadata.contextId };
  const before = await readFile(join(p.workspace, 'state.json'));
  const post = (action, body, extra = {}) => fetch(gui.url + '/api/sources/' + action, { method: 'POST', headers: { ...headers, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  assert.equal((await post('enrollment-inventory', fields)).status, 200);
  assert.equal((await post('enrollment-inventory', { ...fields, requestId: randomUUID(), workspace: p.parent })).status, 400);
  assert.equal((await post('enrollment-inventory', fields, { Origin: 'https://example.invalid' })).status, 403);
  const malformed = JSON.stringify({ ...fields, requestId: randomUUID() }).replace('}', ',"additions":[],"additions":[]}');
  assert.equal((await post('review-enrollment', malformed)).status, 400);
  assert.equal((await post('review-enrollment', { ...fields, requestId: randomUUID(), additions: ['x'.repeat(16 * 1024)] })).status, 413);
  assert.deepEqual(await readFile(join(p.workspace, 'state.json')), before);
  assert.deepEqual(await readFile(n.path), n.bytes);
  assert.equal((await openWorkspace(p.workspace)).reg.skills.length, 1);
});
