import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, realpath, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { AI_TOOLS } from '../src/ai/tools.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadRecord } from '../src/sources/records.mjs';
import { listRecords } from '../src/core/local-store.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import * as sources from '../src/sources/service.mjs';

const proposals = await import('../src/proposals/service.mjs').catch(() => ({}));
const { createProposal, listProposals, decideProposal } = proposals;
const reason = 'この作業では、まず一つだけ試して戻せます。';
const item = sourceId => ({ sourceId, reason });

async function fixture(t, { adopt = true } = {}) {
  const s = await aiProfile(t);
  const current = await readSetup({ workspace: s.workspace, schemaVersion: 3 });
  const ids = current.inventory.skills.map(skill => skill.id);
  const setup = { schemaVersion: 3, scopeId: s.scopeId, normalId: s.normalId, inventoryId: current.inventory.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Synthetic reference', checkedAt: '2026-09-23T00:00:00Z' }],
      rationale: 'Synthetic proposal test.' },
    roles: ids.map(sourceId => ({ sourceId, origin: 'self', reason: 'Synthetic optional Skill.' })),
    trueform: { skillStates: ids.map(sourceId => ({ sourceId, state: 'disabled' })), retainedOfficialPluginIds: [] },
    unseal: { instructions: 'minimal', skillElevations: ids.map(sourceId => ({ sourceId, state: 'automatic' })), additionalPluginIds: [] } };
  if (adopt) await applySetup({ workspace: s.workspace, reviewId: (await reviewSetup({ workspace: s.workspace, proposal: setup })).reviewId });
  t.after(() => setSourceTransactionTestHook(null));
  return { ...s, setup, sourceId: ids[0] };
}
const create = (s, options = {}) => createProposal({ workspace: s.workspace, kind: 'add', mode: 'unseal',
  items: [item(s.sourceId)], ...options });

test('1. creation stores current basis and valid setup review without changing configuration', async t => {
  const s = await fixture(t, { adopt: false });
  const review = await reviewSetup({ workspace: s.workspace, proposal: s.setup });
  const before = await openWorkspace(s.workspace), files = await readSourceProfileFiles(s.context);
  const p = await create(s, { setupReviewId: review.reviewId });
  assert.match(p.proposalId, /^[a-f0-9]{64}$/);
  assert.deepEqual(p.basis, { revision: before.state.revision, snapshotId: before.state.snapshotId });
  assert.equal(p.setupReviewId, review.reviewId);
  assert.equal(p.status, 'pending');
  assert.equal('planId' in p, false);
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
  assert.deepEqual(await readSourceProfileFiles(s.context), files);
  await assert.rejects(create(s, { setupReviewId: '0'.repeat(64) }), { kind: 'proposal-invalid' });
});

test('2. approval applies reviewed setup, then plans and applies the chosen mode', async t => {
  const s = await fixture(t, { adopt: false });
  const review = await reviewSetup({ workspace: s.workspace, proposal: s.setup });
  const p = await create(s, { setupReviewId: review.reviewId });
  const approved = await decideProposal({ workspace: s.workspace, proposalId: p.proposalId, decision: 'approve' });
  const state = await sources.userSourceState({ workspace: s.workspace });
  assert.equal(approved.status, 'applied');
  assert.match(approved.result.planId, /^[a-f0-9]{64}$/);
  assert.equal(approved.result.preparedMode, 'unseal');
  assert.equal(approved.result.readback, 'matched');
  assert.equal(approved.result.revision, state.revision);
  assert.equal(state.setup.setupRequired, false);
  assert.equal(state.preparedMode, 'unseal');
  assert.equal((await loadRecord(s.workspace, 'application', approved.result.planId)).role, 'plan');
});

test('3. changed revision or source makes approval stale without overwriting the edit', async t => {
  const s = await fixture(t);
  const first = await create(s);
  const plan = await sources.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await sources.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const after = await readSourceProfileFiles(s.context);
  await assert.rejects(decideProposal({ workspace: s.workspace, proposalId: first.proposalId, decision: 'approve' }), { kind: 'proposal-stale' });
  assert.equal((await listProposals({ workspace: s.workspace })).find(p => p.proposalId === first.proposalId).status, 'stale');
  assert.deepEqual(await readSourceProfileFiles(s.context), after);
  const second = await create(s);
  const path = join(s.context.codexHome, 'AGENTS.md');
  await writeFile(path, '# Independent user edit\n');
  await assert.rejects(decideProposal({ workspace: s.workspace, proposalId: second.proposalId, decision: 'approve' }), { kind: 'proposal-stale' });
  assert.equal(await readFile(path, 'utf8'), '# Independent user edit\n');
  assert.equal((await listProposals({ workspace: s.workspace })).find(p => p.proposalId === second.proposalId).status, 'stale');
});

test('4. a completed approval returns the same result without another application', async t => {
  const s = await fixture(t), p = await create(s);
  const first = await decideProposal({ workspace: s.workspace, proposalId: p.proposalId, decision: 'approve' });
  const before = await openWorkspace(s.workspace);
  const second = await decideProposal({ workspace: s.workspace, proposalId: p.proposalId, decision: 'approve' });
  assert.deepEqual(second, first);
  assert.deepEqual((await openWorkspace(s.workspace)).state, before.state);
});

test('4. concurrent approval reports proposal-busy while the first is applying', async t => {
  const s = await fixture(t, { adopt: false });
  const review = await reviewSetup({ workspace: s.workspace, proposal: s.setup });
  const p = await create(s, { setupReviewId: review.reviewId });
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { release = resolve; });
  setSourceTransactionTestHook(async phase => { if (phase === 'setup-journal') { entered(); await waiting; } });
  t.after(() => release());
  const first = decideProposal({ workspace: s.workspace, proposalId: p.proposalId, decision: 'approve' });
  await started;
  assert.equal((await listProposals({ workspace: s.workspace })).find(row => row.proposalId === p.proposalId).status, 'applying');
  await assert.rejects(decideProposal({ workspace: s.workspace, proposalId: p.proposalId, decision: 'approve' }), { kind: 'proposal-busy' });
  release();
  assert.equal((await first).status, 'applied');
});

test('4b. a newer proposal makes the older pending proposal stale for the same mode', async t => {
  const s = await fixture(t), first = await create(s), second = await create(s, { kind: 'remove' });
  const rows = await listProposals({ workspace: s.workspace });
  assert.equal(rows[0].proposalId, second.proposalId);
  assert.equal(rows.find(p => p.proposalId === first.proposalId).status, 'stale');
  assert.equal(rows.find(p => p.proposalId === second.proposalId).status, 'pending');
});

test('5. unknown or unavailable sources and empty reasons cannot be proposed', async t => {
  const s = await fixture(t);
  await assert.rejects(create(s, { items: [item('skill-' + '0'.repeat(64))] }), { kind: 'proposal-invalid' });
  await assert.rejects(create(s, { mode: 'normal' }), { kind: 'proposal-invalid' });
  await assert.rejects(create(s, { items: [{ sourceId: s.sourceId, reason: '' }] }), { kind: 'proposal-invalid' });
});

test('6. immutable proposal records survive transitions and listing stays bounded', async t => {
  const s = await fixture(t), p = await create(s);
  const original = await loadRecord(s.workspace, 'input', p.proposalId);
  await decideProposal({ workspace: s.workspace, proposalId: p.proposalId, decision: 'dismiss' });
  assert.deepEqual(await loadRecord(s.workspace, 'input', p.proposalId), original);
  assert.equal((await listProposals({ workspace: s.workspace })).find(row => row.proposalId === p.proposalId).status, 'dismissed');
  for (let n = 0; n < 21; n++) await create(s, { items: [{ sourceId: s.sourceId, reason: `試す理由 ${n}` }] });
  assert.equal((await listProposals({ workspace: s.workspace })).length, 20);
  const saved = await listRecords({ store: s.workspace, type: 'input' });
  assert.ok(saved.some(row => row.id === p.proposalId && row.payload.role === 'proposal'));
});

test('invalid workspace paths cannot receive a proposal lock file', async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-proposal-boundary-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await assert.rejects(createProposal({ workspace: parent, kind: 'restore', mode: 'normal', items: [] }), { kind: 'workspace-invalid' });
  await assert.rejects(decideProposal({ workspace: parent, proposalId: '0'.repeat(64), decision: 'approve' }), { kind: 'workspace-invalid' });
  await assert.rejects(access(join(parent, 'proposals.lock')), { code: 'ENOENT' });
});

test('MCP proposal tools keep strict inputs and share the stored decision', async t => {
  const s = await fixture(t), ai = await fixtureAiClient(t, s.workspace);
  for (const name of ['propose_change', 'read_proposals', 'decide_proposal']) {
    const tool = AI_TOOLS.find(row => row.definition.name === name);
    assert.ok(tool, name);
    assert.equal(tool.definition.inputSchema.additionalProperties, false);
  }
  const created = await ai.mutate('propose_change', { kind: 'add', mode: 'unseal', items: [item(s.sourceId)] });
  assert.equal(created.status, 'pending');
  assert.equal((await ai.call('read_proposals')).proposals[0].proposalId, created.proposalId);
  const applied = await ai.mutate('decide_proposal', { proposalId: created.proposalId, decision: 'approve' });
  assert.equal(applied.status, 'applied');
  assert.deepEqual((await ai.mutate('decide_proposal', { proposalId: created.proposalId, decision: 'approve' })).result, applied.result);
});

test('authenticated HTTP proposals GET and decide route use the selected synthetic workspace', async t => {
  const s = await fixture(t);
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-proposal-http-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const assetsDirectory = join(parent, 'dist');
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: s.context, assetsDirectory });
  t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1' };
  const request = async (path, body) => {
    const response = await fetch(gui.url + '/api/sources/' + path, { method: body ? 'POST' : 'GET',
      headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, value: await response.json() };
  };
  const boot = await fetch(gui.url + '/api/bootstrap', { headers });
  headers['X-Unharness-Token'] = (await boot.json()).token;
  const metadata = (await request('metadata')).value;
  const body = { requestId: randomUUID(), launchId: metadata.launchId, contextId: metadata.contextId };
  const proposed = await request('propose', { ...body, kind: 'add', mode: 'unseal', items: [item(s.sourceId)] });
  assert.equal(proposed.status, 200, JSON.stringify(proposed));
  const id = proposed.value.result.proposalId;
  const listed = await request('proposals');
  assert.equal(listed.status, 200);
  assert.equal(listed.value.proposals[0].proposalId, id);
  const decided = await request('decide-proposal', { ...body, requestId: randomUUID(), proposalId: id, decision: 'approve' });
  assert.equal(decided.status, 200, JSON.stringify(decided));
  assert.equal(decided.value.status, 'applied');
  const forbidden = await fetch(gui.url + '/api/sources/proposals', { headers: { Origin: gui.url, 'X-Unharness-Client': '1' } });
  assert.equal(forbidden.status, 403);
});
