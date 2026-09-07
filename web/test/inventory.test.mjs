import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

test('inventory display keeps unavailable queries distinct from a reported zero', async () => {
  const { sourceRows } = await import('../src/inventory.ts');
  const unknown = { status: 'not-run' };
  const report = {
    instructions: { status: 'partial', files: [] },
    probe: { queries: { config: unknown, skills: unknown, hooks: { status: 'error', error: { kind: 'timeout' } }, requirements: unknown } },
  };
  let rows = sourceRows(report);
  for (const row of rows) assert.equal(row.count, null, row.id);
  for (const row of rows) assert.equal(row.status, 'unknown', row.id);
  report.probe.queries.skills = { status: 'ok', summary: { total: 0, enabled: 0, disabled: 0, unknownEnabled: 0, errors: 0 } };
  report.probe.queries.hooks = { status: 'ok', summary: { total: 0, warnings: 0, errors: 0 } };
  rows = sourceRows(report);
  assert.equal(rows.find(row => row.id === 'skills').count, 0);
  assert.equal(rows.find(row => row.id === 'skills').status, 'read');
  assert.equal(rows.find(row => row.id === 'hooks').count, 0);
  assert.equal(rows.find(row => row.id === 'hooks').status, 'read');
  assert.equal(rows.find(row => row.id === 'memories').count, null);
});

test('partial discoveries and disabled configuration layers do not become active-source claims', async () => {
  const { sourceRows } = await import('../src/inventory.ts');
  const report = {
    instructions: { status: 'partial', files: [{ state: 'present' }, { state: 'link' }] },
    probe: { queries: {
      config: { status: 'ok', summary: { layers: { status: 'known', items: [
        { sourceType: 'user', disabled: true, presence: { memories: true, plugins: true } },
        { sourceType: 'system', disabled: false, presence: { memories: false, plugins: false } },
      ] } } },
      skills: { status: 'ok', summary: { total: 2, enabled: 1, disabled: 0, unknownEnabled: 1, errors: 1 } },
      hooks: { status: 'ok', summary: { total: 1, warnings: 1, errors: 0 } },
      requirements: { status: 'ok', summary: { present: false } },
    } },
  };
  const rows = sourceRows(report);
  assert.equal(rows.find(row => row.id === 'instructions').count, 1);
  assert.equal(rows.find(row => row.id === 'instructions').status, 'partial');
  assert.equal(rows.find(row => row.id === 'skills').status, 'partial');
  assert.equal(rows.find(row => row.id === 'hooks').status, 'partial');
  assert.equal(rows.find(row => row.id === 'memories').count, 0);
  assert.equal(rows.find(row => row.id === 'connections').count, 0);
});

test('reconnection displays current inventory metadata before any read under a new launch or target', async t => {
  const { Api } = await import('../src/api.ts');
  const { readSourceInventory } = await import('../src/inventory-operations.ts');
  let token = 'launch-one';
  let metadata = { launchId: 'first-view', enabled: true, cwd: '/selected-one', report: null };
  let metadataFailure = false;
  let inspections = 0;
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/api/bootstrap') return response.end(JSON.stringify({ token }));
    assert.equal(request.headers['x-unharness-token'], token);
    if (request.method === 'GET' && request.url === '/api/inventory') {
      if (metadataFailure) return request.destroy();
      return response.end(JSON.stringify(metadata));
    }
    if (request.method === 'POST' && request.url === '/api/inspect') {
      inspections += 1;
      return response.end(JSON.stringify({ result: metadata }));
    }
    response.writeHead(404); response.end('{}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  const initial = await readSourceInventory(api, null, false);
  assert.equal(initial.status, 'metadata');
  assert.equal(inspections, 0);
  assert.equal((await readSourceInventory(api, initial.inventory, true)).status, 'inspected');
  assert.equal(inspections, 1);

  // Even the same cwd may belong to a new executable/profile after restart.
  token = 'launch-two';
  metadata = { ...metadata, launchId: 'second-view' };
  const sameTargetRestart = await readSourceInventory(api, initial.inventory, true);
  assert.equal(sameTargetRestart.status, 'context-updated');
  assert.equal(inspections, 1);

  token = 'failed-metadata-launch';
  metadata = { ...metadata, launchId: 'third-view' };
  metadataFailure = true;
  await assert.rejects(readSourceInventory(api, sameTargetRestart.inventory, true), { kind: 'connection-lost' });
  metadataFailure = false;
  const retry = await readSourceInventory(api, sameTargetRestart.inventory, true);
  assert.equal(retry.status, 'context-updated');
  assert.equal(inspections, 1, 'a failed metadata request must not consume the new-launch check');

  token = 'launch-three';
  metadata = { launchId: 'fourth-view', enabled: true, cwd: '/selected-two', report: null };
  const changed = await readSourceInventory(api, retry.inventory, true);
  assert.equal(changed.status, 'context-updated');
  assert.equal(changed.inventory.cwd, '/selected-two');
  assert.equal(inspections, 1, 'the old button must not start a scan in the newly selected cwd');
  assert.equal((await readSourceInventory(api, changed.inventory, true)).status, 'inspected');
  assert.equal(inspections, 2);

  token = 'launch-four';
  metadata = { launchId: 'fifth-view', enabled: false, cwd: null, report: null };
  const disabled = await readSourceInventory(api, changed.inventory, true);
  assert.equal(disabled.inventory.enabled, false);
  assert.equal(inspections, 2);
  metadata = { launchId: 'sixth-view', enabled: true, cwd: '/selected-three', report: null };
  const enabled = await readSourceInventory(api, disabled.inventory, false);
  assert.equal(enabled.inventory.cwd, '/selected-three');
  assert.equal(inspections, 2, 'refreshing disabled metadata must remain read-only');
});
