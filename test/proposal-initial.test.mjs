import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { readSetup, reviewSetup } from '../src/setup/service.mjs';
import { createProposal, decideProposal } from '../src/proposals/service.mjs';
import { userSourceState } from '../src/sources/service.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';

async function fixture(t) {
  const s = await aiProfile(t);
  const current = await readSetup({ workspace: s.workspace, schemaVersion: 3 });
  const ids = current.inventory.skills.map(skill => skill.id);
  const definition = { schemaVersion: 3, scopeId: s.scopeId, normalId: s.normalId,
    inventoryId: current.inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified',
      desktopVersion: null, runtimeVersion: '0.153.4',
      references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Synthetic reference', checkedAt: '2026-09-24T00:00:00Z' }],
      rationale: 'Synthetic initial proposal.' },
    roles: ids.map(sourceId => ({ sourceId, origin: 'self', reason: 'Synthetic optional Skill' })),
    trueform: { skillStates: ids.map(sourceId => ({ sourceId, state: 'manual' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: 'minimal', skillElevations: ids.map(sourceId => ({ sourceId, state: 'automatic' })), additionalPluginIds: [] } };
  return { ...s, definition, sourceId: ids[0] };
}

test('initial proposal is only valid after local registration and with a reviewed TRUEFORM setup', async t => {
  const s = await fixture(t);
  const args = { workspace: s.workspace, kind: 'initial', mode: 'trueform', items: [{ sourceId: s.sourceId, reason: '手順を毎回強制するため、外して試せます。' }] };
  await assert.rejects(createProposal(args), { kind: 'proposal-invalid' });
  const review = await reviewSetup({ workspace: s.workspace, proposal: s.definition });
  await assert.rejects(createProposal({ ...args, mode: 'unseal', setupReviewId: review.reviewId }), { kind: 'proposal-invalid' });
  const before = await readSourceProfileFiles(s.context), stateBefore = await userSourceState({ workspace: s.workspace });
  const proposal = await createProposal({ ...args, setupReviewId: review.reviewId });
  assert.equal(proposal.status, 'pending');
  assert.equal(proposal.setupReviewId, review.reviewId);
  assert.equal((await userSourceState({ workspace: s.workspace })).preparedMode, 'normal');
  assert.deepEqual(await readSourceProfileFiles(s.context), before);
  const applied = await decideProposal({ workspace: s.workspace, proposalId: proposal.proposalId, decision: 'approve' });
  const state = await userSourceState({ workspace: s.workspace });
  assert.equal(applied.status, 'applied');
  assert.equal(state.preparedMode, 'trueform');
  assert.ok(state.setup.setupId);
  assert.equal(state.registration.normalId, stateBefore.registration.normalId);
});

test('the initial proposal card asks only to make TRUEFORM after Normal was saved', async t => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } });
  t.after(() => vite.close());
  const { ProposalCard } = await vite.ssrLoadModule('/src/workbench/ProposalCard.tsx');
  const html = renderToStaticMarkup(createElement(ProposalCard, { proposal: {
    proposalId: 'a'.repeat(64), kind: 'initial', mode: 'trueform', status: 'pending', items: [] },
    onApprove() {}, onDismiss() {}, busy: false }));
  assert.match(html, />零式にする<\/button>/);
  assert.doesNotMatch(html, /いつもの構成を保存して零式にする/);
});
