import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { aiProfile } from '../test-support/ai-profile.mjs';
import * as service from '../src/sources/service.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { createSourceController } from '../src/sources/session.mjs';

const task = (context, extra = {}) => ({ id: randomUUID(), name: 'Synthetic completed work',
  cwd: context.project, createdAt: 1789000000, updatedAt: 1789000100,
  source: 'vscode', parentThreadId: null, ephemeral: false, turns: [],
  preview: 'PRIVATE full prompt', path: '/PRIVATE/rollout.jsonl', ...extra });
const writeFixture = (p, response, initialization) => writeFile(join(p.context.codexHome, 'recent-tasks-fixture.json'), JSON.stringify({ response, initialization }));

test('recent task selection lists only scoped interactive metadata without previews, paths or transcript reads', async t => {
  const p = await aiProfile(t), first = task(p.context), unnamed = task(p.context, { name: null });
  await writeFixture(p, { data: [first, task(p.context, { cwd: '/another/project', name: 'PRIVATE foreign work' }),
    task(p.context, { parentThreadId: randomUUID(), name: 'PRIVATE child' }), task(p.context, { source: { subAgent: 'review' } }),
    task(p.context, { ephemeral: true }), task(p.context, { turns: [{ text: 'PRIVATE unexpected body' }] }), unnamed], nextCursor: 'cursor:next' });
  assert.equal(typeof service.listRecentUserTasks, 'function');
  const before = await readSourceProfileFiles(p.context);
  const result = await service.listRecentUserTasks({ workspace: p.workspace });
  assert.deepEqual(result.tasks, [
    { taskId: first.id, title: first.name, createdAt: first.createdAt, updatedAt: first.updatedAt },
    { taskId: unnamed.id, title: null, createdAt: unnamed.createdAt, updatedAt: unnamed.updatedAt }
  ]);
  assert.equal(result.nextCursor, 'cursor:next');
  assert.equal(result.available, true);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.deepEqual(JSON.parse(await readFile(join(p.context.codexHome, 'recent-tasks-request.json'), 'utf8')), {
    cwd: p.context.project, limit: 20, sortKey: 'updated_at', sortDirection: 'desc', archived: false,
    sourceKinds: ['appServer', 'vscode', 'cli', 'exec'], useStateDbOnly: true
  });
  assert.deepEqual(await readSourceProfileFiles(p.context), before);
});

test('recent task reads bind pagination to the selected context and reject native identity/version drift', async t => {
  const p = await aiProfile(t);
  await writeFixture(p, { data: [], nextCursor: null });
  assert.equal(typeof service.listRecentUserTasks, 'function');
  const controller = await createSourceController(p.context), meta = await controller.metadata();
  const context = { launchId: meta.launchId, contextId: meta.contextId };
  await controller.execute('recent-tasks', { ...context, taskCursor: 'opaque-page' });
  const request = JSON.parse(await readFile(join(p.context.codexHome, 'recent-tasks-request.json'), 'utf8'));
  assert.equal(request.cursor, 'opaque-page'); assert.equal(request.cwd, p.context.project);
  await assert.rejects(controller.execute('recent-tasks', { ...context, cwd: '/foreign' }), { kind: 'gui-invalid-request' });
  await assert.rejects(controller.execute('recent-tasks', { ...context, contextId: '0'.repeat(64) }), { kind: 'gui-source-context-changed' });
  await assert.rejects(service.listRecentUserTasks({ workspace: p.workspace, taskCursor: '\ninvalid' }), { kind: 'invalid-request' });
  for (const initialization of [{ codexHome: '/foreign' }, { userAgent: 'Codex/0.999.0 synthetic' }]) {
    await writeFixture(p, { data: [task(p.context)], nextCursor: null }, initialization);
    await assert.rejects(service.listRecentUserTasks({ workspace: p.workspace }), { kind: 'comparison-tasks-unavailable' });
  }
});

test('recent task metadata admits the inspected Desktop prerelease exactly, without qualifying other versions', async t => {
  const p = await aiProfile(t), item = task(p.context);
  await writeFixture(p, { data: [item], nextCursor: null }, {
    userAgent: 'Codex Desktop/0.155.0-alpha.9.2 (Mac OS; arm64) synthetic'
  });
  assert.equal((await service.listRecentUserTasks({ workspace: p.workspace })).tasks[0].taskId, item.id);
  for (const version of ['0.155.0', '0.155.0-alpha.9.3', '0.153.4-alpha.1']) {
    await writeFixture(p, { data: [item], nextCursor: null }, { userAgent: `Codex/${version} synthetic` });
    await assert.rejects(service.listRecentUserTasks({ workspace: p.workspace }), { kind: 'comparison-tasks-unavailable' });
  }
});
