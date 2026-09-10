import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { openWorkbench, stopWorkbench } from '../src/gui/launch.mjs';
import { createSourceController } from '../src/sources/session.mjs';
import { createRemoteController } from '../src/gui/remote-controller.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

test('MCP requests a local approval link without approval, ticket disclosure or duplicate issuance', async t => {
  const cleanups = [], p = await aiProfile({ after: fn => cleanups.push(fn) }), assetsDirectory = join(p.parent, 'ui');
  t.after(async () => {
    await stopWorkbench({ workspace: p.workspace });
    for (const cleanup of cleanups) await cleanup();
  });
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const started = await openWorkbench({ workspace: p.workspace }, { assetsDirectory });
  const s = await fixtureAiClient(t, p.workspace), status = await s.call('status');
  const args = { connectionId: status.connectionId, requestId: randomUUID() };
  const first = await s.call('request_public_connection', args);
  assert.equal(first.approved, false); assert.equal(first.ticket, undefined); assert.equal(first.token, undefined);
  assert.equal(new URL(first.approvalUrl).origin, started.loopbackOrigin);
  assert.deepEqual(await s.call('request_public_connection', args), first);
  for (const field of ['webOrigin', 'workspace', 'approve']) {
    const response = await s.client.callTool({ name: 'request_public_connection', arguments: { ...args, [field]: 'injected' } });
    assert.equal(response.structuredContent.error.kind, 'invalid-request');
  }
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});

test('MCP uses the public workspace receipt lookup independently of the expired browser connection', async t => {
  const p = await aiProfile(t), controller = await createSourceController(p.context);
  const remote = await createRemoteController({ controller }); t.after(() => remote.close());
  const issued = await remote.issue(); await remote.approve(issued.pairingId);
  const session = await remote.redeem({ ticket: issued.ticket, launchId: issued.launchId, protocolVersion: 2 }, remote.webOrigin);
  const planned = await remote.request('plan', { requestId: randomUUID(), mode: 'normal', expectedRevision: (await controller.state()).source.revision },
    { token: session.token, origin: remote.webOrigin });
  remote.revoke(session.connectionId);
  const s = await fixtureAiClient(t, p.workspace);
  assert.deepEqual(await s.call('public_operation_status', { operationId: planned.requestId }), planned);
  await writeFile(join(p.workspace, 'ai-requests', planned.requestId, 'request.json'), '{"broken":true}');
  const uncertain = await s.client.callTool({ name: 'public_operation_status', arguments: { operationId: planned.requestId } });
  assert.equal(uncertain.structuredContent.error.kind, 'remote-operation-unconfirmed');
});
