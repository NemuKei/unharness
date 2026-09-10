import { randomBytes } from 'node:crypto';
import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { sourceTransactionHook } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';
import { initializeAppearance, discoverPrepared, selectOwned, beginOriginal, adoptOriginal, renameAppearance, useAppearanceEvidence } from './lifecycle.mjs';
import { readAppearanceStore, appearanceStoreSummary, publishAppearanceState, recoverAppearanceStore } from './store.mjs';
import { resolveAppearanceEvidence, assertAppearanceEvidenceCurrent } from './evidence.mjs';
import { appearanceView, artworkView, artworkItem } from './view.mjs';
import { withAppearanceWorkspace as locked } from './workspace.mjs';
export { reviewAppearanceUpload as reviewUserAppearanceUpload, readAppearanceImportReview as readUserAppearanceImportReview,
  saveAppearanceImport as saveUserAppearanceImport, readAppearanceReferencedImage as readUserAppearanceImage } from './import.mjs';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const request = (args, required = [], optional = []) => exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
export async function readUserAppearance(args) {
  request(args);
  const w = await openWorkspace(args.workspace);
  return appearanceStoreSummary(w, await readAppearanceStore(w));
}
export async function readUserAppearanceView(args) {
  request(args, [], ['after']);
  if (args.after !== undefined && !hash(args.after)) fail('invalid-request');
  const w = await openWorkspace(args.workspace);
  return appearanceView(w, await readAppearanceStore(w), args.after);
}
export async function readUserAppearanceItem(args) {
  request(args, ['itemId']);
  if (!hash(args.itemId)) fail('invalid-request');
  const w = await openWorkspace(args.workspace), stored = await readAppearanceStore(w);
  const item = stored.state?.items.find(item => item.id === args.itemId);
  if (!item) fail('appearance-not-owned');
  return { scopeId: w.scopeId, collectionScopeId: w.rootScopeId ?? w.scopeId, stateId: stored.stateId, item };
}
export async function readUserArtworkView(args) {
  request(args, [], ['after']);
  if (args.after !== undefined && !hash(args.after)) fail('invalid-request');
  const w = await openWorkspace(args.workspace);
  return artworkView(w, await readAppearanceStore(w), args.after);
}
export async function readUserArtworkItem(args) {
  const result = await readUserAppearanceItem(args);
  return { ...result, item: artworkItem(result.item) };
}
export async function readUserOriginalCandidates(args) {
  request(args, ['achievementId']);
  if (!hash(args.achievementId)) fail('invalid-request');
  const w = await openWorkspace(args.workspace), stored = await readAppearanceStore(w);
  const achievement = stored.state?.achievements.find(a => a.achievementId === args.achievementId);
  if (!achievement) fail('appearance-candidate-unavailable');
  return { scopeId: w.scopeId, collectionScopeId: w.rootScopeId ?? w.scopeId, stateId: stored.stateId, recoveryRequired: stored.journal !== null,
    achievement, evidenceTiming: 'at-creation' };
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
    const next = before.state ? discoverPrepared(before.state, seed) : initializeAppearance(w.rootScopeId ?? w.scopeId, seed);
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
async function editAppearance(args, edit) {
  return locked(args.workspace, async w => {
    const before = await readAppearanceStore(w);
    if (before.journal) fail('appearance-recovery-required');
    if (!before.state || args.expectedStateId !== before.stateId) fail('appearance-state-conflict');
    const next = await edit(w, before.state);
    if (next.revision === before.state.revision) return appearanceStoreSummary(w, before);
    return appearanceStoreSummary(w, await publishAppearanceState(w, before, next));
  });
}
export async function renameUserAppearance(args) {
  request(args, ['itemId', 'expectedStateId', 'name']);
  if (!hash(args.itemId) || !hash(args.expectedStateId)) fail('invalid-request');
  return editAppearance(args, (_w, state) => renameAppearance(state, args.itemId, args.name));
}
export async function setUserAppearanceEvidence(args) {
  request(args, ['startId', 'expectedStateId']);
  if (!hash(args.startId) || !hash(args.expectedStateId)) fail('invalid-request');
  return editAppearance(args, async (w, state) => {
    await resolveAppearanceEvidence(w, args.startId);
    return useAppearanceEvidence(state, args.startId);
  });
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
