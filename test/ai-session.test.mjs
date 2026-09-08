import test from 'node:test';
import assert from 'node:assert/strict';
import { rename, mkdir, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { createSourceController } from '../src/sources/session.mjs';
import { createSourceController as guiController } from '../src/gui/sources.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';

test('AI and GUI share one controller while AI remains bound to the selected registration', async t => {
  const p = await aiProfile(t);
  assert.equal(guiController, createSourceController);
  const ai = await createSourceController(p.context, { workspace: p.workspace });
  const gui = await guiController(p.context);
  const { launchId, contextId } = await ai.metadata();
  const metadata = { launchId, contextId };
  const plan = await ai.execute('plan', { ...metadata, mode: 'unseal' });
  await ai.execute('apply', { ...metadata, planId: plan.planId });
  const a = await ai.state(), b = await gui.state();
  assert.deepEqual(a.source, b.source);
  assert.equal(a.source.preparedMode, 'unseal');
  assert.equal(a.source.verification.runtimeStateVerified, false);
  await assert.rejects(createSourceController(p.context, { workspace: join(p.parent, 'wrong') }), { kind: 'source-session-changed' });
  await assert.rejects(ai.execute('save', { ...metadata, workspace: p.parent, name: 'blocked' }), { kind: 'gui-invalid-request' });
});

test('a replaced private workspace cannot reuse an existing bound AI session', async t => {
  const p = await aiProfile(t);
  const ai = await createSourceController(p.context, { workspace: p.workspace });
  await rename(p.workspace, p.workspace + '-original');
  await cp(p.workspace + '-original', p.workspace, { recursive: true });
  await assert.rejects(ai.state(), { kind: 'gui-source-context-changed' });
});

test('a replaced registered root cannot be used through an existing AI connection', async t => {
  const p = await aiProfile(t);
  const ai = await createSourceController(p.context, { workspace: p.workspace });
  const { launchId, contextId } = await ai.metadata();
  const metadata = { launchId, contextId };
  await rename(p.context.project, p.context.project + '-original');
  await mkdir(p.context.project);
  await assert.rejects(ai.execute('save', { ...metadata, name: 'blocked' }), { kind: 'gui-source-context-changed' });
});
