import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setupProfile } from '../test-support/setup-profile.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { createSourceController } from '../src/sources/session.mjs';

const unchanged = async p => ({ files: await readSourceProfileFiles(p.context), state: await readFile(join(p.workspace, 'state.json'), 'utf8'), entries: await readdir(p.workspace) });
test('saved mode contents are readable through a live conflict, omit bodies, and do not prepare a mode', async t => {
  const p = await setupProfile(t), w = await openWorkspace(p.workspace);
  await writeFile(join(p.context.codexHome, 'AGENTS.md'), 'INDEPENDENT_PRIVATE_EDIT');
  const before = await unchanged(p);
  assert.equal(typeof sources.readUserModeContents, 'function');
  const result = await sources.readUserModeContents({ workspace: p.workspace });
  assert.equal(result.scopeId, p.scopeId);
  assert.equal(result.modes.normal.instructions.style, 'saved');
  assert.equal(result.modes.trueform.instructions.style, 'none');
  assert.equal(result.modes.unseal.instructions.style, 'minimal');
  assert.equal(result.modes.normal.skills[0].state, 'automatic');
  assert.equal(result.modes.trueform.skills[0].state, 'manual', 'legacy saved choices stay manual, not guessed from the mode name');
  assert.ok(!JSON.stringify(result).includes('PRIVATE_TEST'));
  assert.ok(!JSON.stringify(result).includes('INDEPENDENT_PRIVATE_EDIT'));
  assert.ok(!JSON.stringify(result).includes(p.context.codexHome));
  const normal = await sources.readUserModeSource({workspace:p.workspace,mode:'normal',snapshotId:result.modes.normal.snapshotId,sourceId:w.reg.instructions.id});
  assert.match(normal.text, /PRIVATE_TEST/); assert.ok(!normal.text.includes('INDEPENDENT_PRIVATE_EDIT'));
  const minimal = await sources.readUserModeSource({workspace:p.workspace,mode:'unseal',snapshotId:result.modes.unseal.snapshotId,sourceId:w.reg.instructions.id});
  assert.match(minimal.text, /Minimal working guide/);
  await assert.rejects(sources.readUserModeSource({workspace:p.workspace,mode:'trueform',snapshotId:result.modes.trueform.snapshotId,sourceId:w.reg.instructions.id}), {kind:'invalid-request'});
  const skill = await sources.readUserModeSource({workspace:p.workspace,mode:'trueform',snapshotId:result.modes.trueform.snapshotId,sourceId:w.reg.skills[0].id});
  assert.match(skill.text, /PRIVATE_TEST/);
  await assert.rejects(sources.readUserModeSource({workspace:p.workspace,mode:'unseal',snapshotId:result.modes.normal.snapshotId,sourceId:w.reg.instructions.id}), {kind:'stale-plan'});
  assert.deepEqual(await unchanged(p), before);
});

test('missing presets are unavailable rather than invented, and controller reads reject foreign paths and contexts', async t => {
  const p=await aiProfile(t), c=await createSourceController(p.context), meta=await c.metadata();
  const context={launchId:meta.launchId,contextId:meta.contextId};
  const result=await c.execute('mode-contents',context);
  assert.equal(result.modes.normal.available,true); assert.equal(result.modes.trueform.available,false);
  assert.equal(result.modes.trueform.reason,'setup-required');
  await assert.rejects(c.execute('mode-contents',{...context,path:'/foreign'}),{kind:'gui-invalid-request'});
  await assert.rejects(c.execute('mode-contents',{...context,contextId:'0'.repeat(64)}),{kind:'gui-source-context-changed'});
  await assert.rejects(sources.readUserModeContents({workspace:p.workspace,path:'/foreign'}),{kind:'invalid-request'});
});

test('v3 mode summaries reflect the saved per-Skill states and instruction choice before preparation', async t => {
  const p = await aiProfile(t), w = await openWorkspace(p.workspace);
  const { readSetup, reviewSetup, applySetup } = await import('../src/setup/service.mjs');
  const inventory = (await readSetup({ workspace: p.workspace, schemaVersion: 3 })).inventory;
  const proposal = { schemaVersion: 3, scopeId: p.scopeId, normalId: p.normalId, inventoryId: inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null, runtimeVersion: '0.153.4',
      references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Fixture reference', checkedAt: '2026-09-20T00:00:00Z' }], rationale: 'Owned fixture only.' },
    roles: w.reg.skills.map(s => ({ sourceId: s.id, origin: 'self', reason: 'Owned fixture.' })),
    trueform: { skillStates: w.reg.skills.map(s => ({ sourceId: s.id, state: 'disabled' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: 'none', skillElevations: w.reg.skills.map(s => ({ sourceId: s.id, state: 'manual' })), additionalPluginIds: [] } };
  await applySetup({ workspace: p.workspace, reviewId: (await reviewSetup({ workspace: p.workspace, proposal })).reviewId });
  const result = await sources.readUserModeContents({ workspace: p.workspace });
  assert.equal(result.modes.trueform.skills[0].state, 'disabled');
  assert.equal(result.modes.unseal.skills[0].state, 'manual');
  assert.equal(result.modes.unseal.instructions.style, 'none');
  assert.notEqual(result.preparedSetupId, result.setupId);
  const c = await createSourceController(p.context), meta = await c.metadata();
  const text = await c.execute('mode-source', { launchId: meta.launchId, contextId: meta.contextId,
    mode: 'normal', snapshotId: result.modes.normal.snapshotId, sourceId: w.reg.skills[0].id });
  assert.match(text.text, /PRIVATE_TEST/);
});
