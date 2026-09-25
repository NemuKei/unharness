import test from 'node:test';
import assert from 'node:assert/strict';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { planUserMode, applyUserPlan, userSourceState } from '../src/sources/service.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { setupScope } from '../src/setup/records.mjs';
import { validatePresetProposal } from '../src/setup/preset.mjs';

test('a user-chosen schema-4 loadout uses the existing review, apply, plan and apply operations without AI provenance',
  { skip: process.platform !== 'darwin' }, async t => {
    const p = await aiProfile(t);
    const read = await readSetup({ workspace: p.workspace, schemaVersion: 4 });
    assert.ok(read.inventory);
    const skillId = read.inventory.skills.find(skill => !skill.requiredControl)?.id;
    assert.equal(read.sourceDescriptions?.[skillId], 'Synthetic optional example');
    assert.deepEqual(read.codexOperations, { read: true, disable: true, enable: true, 'plugin-disable': true });
    const skillStates = read.inventory.skills.filter(s => !s.requiredControl).map(s => ({ sourceId: s.id, state: 'disabled' }));
    const proposal = { schemaVersion: 4, scopeId: read.scopeId, normalId: read.normalId,
      inventoryId: read.inventory.inventoryId,
      basis: { application: 'codex', modelId: null, modelSource: 'local-choice', desktopVersion: null,
        runtimeVersion: null, references: [], rationale: '画面で利用者が装備を選びました。' },
      roles: read.inventory.skills.map(s => ({ sourceId: s.id, origin: 'user-confirmed', reason: '画面で自分の任意Skillとして確認しました。' })),
      trueform: { skillStates, retainedOfficialPluginIds: [] },
      unseal: { instructions: 'minimal', skillElevations: [], additionalPluginIds: [] } };
    const scope = setupScope(await openWorkspace(p.workspace));
    assert.throws(() => validatePresetProposal({ ...proposal, schemaVersion: 3 }, scope), { kind: 'setup-proposal-invalid' });
    assert.throws(() => validatePresetProposal({ ...proposal, basis: { ...proposal.basis, references: [{ url: 'https://openai.com',
      title: 'invented', checkedAt: '2026-09-25T00:00:00Z' }] } }, scope), { kind: 'setup-proposal-invalid' });
    const { AI_TOOLS } = await import('../src/ai/tools.mjs');
    const tool = AI_TOOLS.find(item => item.definition.name === 'review_setup');
    assert.equal(tool.schema.safeParse({ proposal, connectionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      requestId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }).success, true);
    const reviewed = await reviewSetup({ workspace: p.workspace, proposal });
    const saved = await applySetup({ workspace: p.workspace, reviewId: reviewed.reviewId });
    assert.equal(saved.adopted, true);
    const plan = await planUserMode({ workspace: p.workspace, mode: 'trueform' });
    const applied = await applyUserPlan({ workspace: p.workspace, planId: plan.planId });
    assert.equal(applied.readback, 'matched');
    assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'trueform');
  });
