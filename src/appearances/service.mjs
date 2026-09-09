import { randomBytes } from 'node:crypto';
import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { acquire, pending, sourceTransactionHook } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';
import { initializeAppearance, discoverPrepared, selectOwned, beginOriginal, adoptOriginal } from './lifecycle.mjs';
import { readAppearanceStore, appearanceStoreSummary, publishAppearanceState, recoverAppearanceStore } from './store.mjs';
import { resolveAppearanceEvidence, assertAppearanceEvidenceCurrent } from './evidence.mjs';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const request = (args, required = [], optional = []) => exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
async function locked(workspace, action, recovery = false) {
  const initial = await openWorkspace(workspace), release = await acquire(initial, recovery);
  try {
    if (await pending(workspace)) fail('recovery-required');
    const w = await openWorkspace(workspace);
    if (w.scopeId !== initial.scopeId) fail('workspace-invalid');
    return await action(w);
  } finally { await release(); }
}
export async function readUserAppearance(args) {
  request(args);
  const w = await openWorkspace(args.workspace);
  return appearanceStoreSummary(w, await readAppearanceStore(w));
}
export async function discoverUserAppearance(args) {
  request(args, [], ['expectedStateId']);
  if (args.expectedStateId !== undefined && !hash(args.expectedStateId)) fail('invalid-request');
  return locked(args.workspace, async w => {
    const before = await readAppearanceStore(w);
    if (before.journal) fail('appearance-recovery-required');
    if (args.expectedStateId === undefined && before.state) return appearanceStoreSummary(w, before);
    if (args.expectedStateId !== undefined && args.expectedStateId !== before.stateId) fail('appearance-state-conflict');
    const seed = randomBytes(32).toString('hex');
    const next = before.state ? discoverPrepared(before.state, seed) : initializeAppearance(w.scopeId, seed);
    return appearanceStoreSummary(w, await publishAppearanceState(w, before, next));
  });
}
export async function selectUserAppearance(args) {
  request(args, ['itemId', 'expectedStateId']);
  if (!hash(args.itemId) || !hash(args.expectedStateId)) fail('invalid-request');
  return locked(args.workspace, async w => {
    const before = await readAppearanceStore(w);
    if (before.journal) fail('appearance-recovery-required');
    if (!before.state || args.expectedStateId !== before.stateId) fail('appearance-state-conflict');
    const next = selectOwned(before.state, args.itemId);
    if (next.revision === before.state.revision) return appearanceStoreSummary(w, before);
    return appearanceStoreSummary(w, await publishAppearanceState(w, before, next));
  });
}
export async function recoverUserAppearance(args) {
  request(args);
  return locked(args.workspace, async w => appearanceStoreSummary(w, await recoverAppearanceStore(w)), true);
}

export async function createUserOriginalAppearance(args) {
  request(args, ['startId', 'achievementId', 'expectedStateId']);
  if (![args.startId, args.achievementId, args.expectedStateId].every(hash)) fail('invalid-request');
  return locked(args.workspace, async w => {
    const before = await readAppearanceStore(w);
    if (before.journal) fail('appearance-recovery-required');
    if (!before.state) fail('appearance-state-conflict');
    const evidence = await resolveAppearanceEvidence(w, args.startId);
    if (!evidence.eligible || evidence.achievementId !== args.achievementId) fail('appearance-ineligible');
    await assertAppearanceEvidenceCurrent(w, evidence);
    if (before.state.achievements.some(a => a.achievementId === evidence.achievementId)) return appearanceStoreSummary(w, before);
    if (before.stateId !== args.expectedStateId) fail('appearance-state-conflict');
    await sourceTransactionHook('appearance-evidence-checked');
    await assertAppearanceEvidenceCurrent(w, evidence);
    const { achievementId, context, resultIds } = evidence;
    const next = beginOriginal(before.state, { achievementId, context, resultIds, eligible: true }, randomBytes(32).toString('hex'));
    return appearanceStoreSummary(w, await publishAppearanceState(w, before, next));
  });
}

export async function adoptUserOriginalAppearance(args) {
  request(args, ['achievementId', 'candidateId', 'expectedStateId']);
  if (![args.achievementId, args.candidateId, args.expectedStateId].every(hash)) fail('invalid-request');
  return locked(args.workspace, async w => {
    const before = await readAppearanceStore(w);
    if (before.journal) fail('appearance-recovery-required');
    if (!before.state) fail('appearance-state-conflict');
    const existing = before.state.achievements.find(a => a.achievementId === args.achievementId);
    if (existing?.adoptedCandidateId === args.candidateId) return appearanceStoreSummary(w, before);
    if (before.stateId !== args.expectedStateId) fail('appearance-state-conflict');
    const next = adoptOriginal(before.state, args.achievementId, args.candidateId);
    return appearanceStoreSummary(w, await publishAppearanceState(w, before, next));
  });
}
