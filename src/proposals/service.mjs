import { openWorkspace } from '../sources/records.mjs';
import { userSourceState, planUserMode, applyUserPlan, SETUP_OPERATIONS } from '../sources/service.mjs';
import { requiredControlSources } from '../setup/control-sources.mjs';
import { loadSetupReview, assertReviewCurrent } from '../setup/records.mjs';
import { captureInventoryForSetup } from '../setup/inventory-capture.mjs';
import { equal } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { withProposalLock, createStoredProposal, listStoredProposals, readStoredProposal, transitionStoredProposal } from './store.mjs';

const ID = /^[a-f0-9]{64}$/;
const SOURCE_ID = /^(instructions|skill)-[a-f0-9]{64}$/;
const REASON = /^[^\u0000-\u001f\u007f-\u009f]*$/;
const exact = (value, required, optional = []) => value && typeof value === 'object' && !Array.isArray(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => [...required, ...optional].includes(key));
async function checkedWorkspace(workspace) {
  try { return await openWorkspace(workspace); }
  catch (error) { if (error?.code === 'ENOENT') fail('workspace-invalid'); throw error; }
}

function validateCreate(args) {
  if (!exact(args, ['workspace', 'kind', 'mode', 'items'], ['setupReviewId'])
    || !['initial', 'add', 'remove', 'restore'].includes(args.kind)
    || !['normal', 'unseal', 'trueform'].includes(args.mode)
    || !Array.isArray(args.items) || args.items.length > 32
    || args.items.some(item => !exact(item, ['sourceId', 'reason'])
      || typeof item.sourceId !== 'string' || !SOURCE_ID.test(item.sourceId)
      || typeof item.reason !== 'string' || item.reason.length < 1 || item.reason.length > 200
      || !item.reason.trim() || !REASON.test(item.reason))
    || new Set(args.items.map(item => item.sourceId)).size !== args.items.length
    || args.setupReviewId !== undefined && (typeof args.setupReviewId !== 'string' || !ID.test(args.setupReviewId))
    || args.kind === 'initial' && (args.mode !== 'trueform' || args.setupReviewId === undefined)) fail('proposal-invalid');
}
async function currentBasis(workspace) {
  const state = await userSourceState({ workspace });
  if (state.conflict || state.recovery.pending) fail('source-conflict');
  const w = await checkedWorkspace(workspace);
  return { w, basis: { revision: w.state.revision, snapshotId: w.state.snapshotId } };
}
async function validReview(w, reviewId) {
  try {
    const review = await loadSetupReview(w, reviewId);
    assertReviewCurrent(w, review);
    if (review.schemaVersion < w.manifestVersion) fail('setup-upgrade-required');
    if (review.schemaVersion >= 2 && !equal(await captureInventoryForSetup(w, review.schemaVersion), review.inventory)) fail('stale-discovery');
    return review;
  } catch { fail('proposal-invalid'); }
}
export async function createProposal(args) {
  validateCreate(args);
  await checkedWorkspace(args.workspace);
  return withProposalLock(args.workspace, async () => {
    const { w, basis } = await currentBasis(args.workspace);
    const all = [...(w.reg.instructions ? [w.reg.instructions] : []), ...w.reg.skills];
    const protectedIds = new Set(requiredControlSources(w.reg.skills).sourceIds);
    if (args.items.some(item => protectedIds.has(item.sourceId)
      || args.mode === 'normal'
      || !all.some(source => source.id === item.sourceId && source.availability?.[args.mode]))) fail('proposal-invalid');
    if (args.setupReviewId !== undefined) await validReview(w, args.setupReviewId);
    const after = await currentBasis(args.workspace);
    if (!equal(after.basis, basis)) fail('proposal-invalid');
    return createStoredProposal(args.workspace, { kind: args.kind, mode: args.mode, items: args.items,
      setupReviewId: args.setupReviewId ?? null, basis, createdAt: new Date().toISOString() });
  });
}
export async function listProposals({ workspace }) {
  await checkedWorkspace(workspace);
  try { return await withProposalLock(workspace, async () => {
    await settleInterrupted(workspace);
    return listStoredProposals(workspace);
  }); }
  catch (error) { if (error?.kind === 'proposal-busy') return listStoredProposals(workspace); throw error; }
}
async function settleInterrupted(workspace, proposalId) {
  const rows = proposalId ? [await readStoredProposal(workspace, proposalId)] : await listStoredProposals(workspace);
  for (const proposal of rows.filter(row => row.status === 'applying')) {
    let basis;
    try { ({ basis } = await currentBasis(workspace)); }
    catch (error) { if (error?.kind !== 'source-conflict') throw error; }
    await transitionStoredProposal(workspace, proposal.proposalId,
      basis && equal(basis, proposal.basis) ? 'pending' : 'stale');
  }
}
export async function decideProposal({ workspace, proposalId, decision }) {
  if (typeof proposalId !== 'string' || !ID.test(proposalId) || !['approve', 'dismiss'].includes(decision)) fail('proposal-invalid');
  await checkedWorkspace(workspace);
  return withProposalLock(workspace, async () => {
    await checkedWorkspace(workspace);
    await settleInterrupted(workspace, proposalId);
    let proposal = await readStoredProposal(workspace, proposalId);
    if (decision === 'dismiss') {
      if (proposal.status !== 'pending') fail('proposal-invalid');
      return transitionStoredProposal(workspace, proposalId, 'dismissed');
    }
    if (proposal.status === 'applied') return proposal;
    if (proposal.status === 'applying') fail('proposal-busy');
    if (proposal.status !== 'pending') fail('proposal-stale');
    let basis;
    try { ({ basis } = await currentBasis(workspace)); }
    catch (error) { if (error?.kind !== 'source-conflict') throw error; }
    if (!basis || !equal(basis, proposal.basis)) {
      await transitionStoredProposal(workspace, proposalId, 'stale');
      fail('proposal-stale');
    }
    proposal = await transitionStoredProposal(workspace, proposalId, 'applying');
    try {
      if (proposal.setupReviewId) await SETUP_OPERATIONS['apply-setup']({ workspace, reviewId: proposal.setupReviewId });
      const plan = await planUserMode({ workspace, mode: proposal.mode });
      const applied = await applyUserPlan({ workspace, planId: plan.planId });
      return transitionStoredProposal(workspace, proposalId, 'applied', {
        planId: plan.planId, preparedMode: applied.preparedMode, revision: applied.revision, readback: applied.readback });
    } catch (error) {
      await transitionStoredProposal(workspace, proposalId, 'stale');
      throw error;
    }
  });
}
