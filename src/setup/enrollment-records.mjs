// Frozen registration expansion and offline readers. No native catalog or
// configuration compiler is imported during validation or cancellation.
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { loadRecord, loadScopeLineage, scopeWorkspace, activeNormalId, loadSnapshot, validateStateSnapshots } from '../sources/records.mjs';
import { equal } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { hash, loadSetup, loadSetupReview } from './records.mjs';

export function validateAdditions(value, schemaVersion = 1) {
  if (![1, 2, 3].includes(schemaVersion)) fail('enrollment-proposal-invalid');
  if (!Array.isArray(value) || !value.length || value.length > 32 || new Set(value.map(v => v?.sourceId)).size !== value.length) fail('enrollment-proposal-invalid');
  for (const a of value) {
    exactKeys(a, ['sourceId', 'origin', 'reason', ...(schemaVersion === 1 ? ['unseal', 'trueform'] : [])], [], 'enrollment-proposal-invalid');
    if (!/^skill-[a-f0-9]{64}$/.test(a.sourceId) || !['self', 'external'].includes(a.origin) ||
        schemaVersion === 1 && (!['automatic', 'manual'].includes(a.unseal) || !['automatic', 'manual'].includes(a.trueform) ||
        a.origin === 'self' && a.trueform !== 'manual')) fail('enrollment-proposal-invalid');
    boundedText(a.reason, 600, true, 'enrollment-proposal-invalid');
  }
  return structuredClone(value);
}
export function expandedProposal(proposal, additions, scopeId, normalId) {
  return { ...structuredClone(proposal), scopeId, normalId,
    roles: [...proposal.roles, ...additions.map(({ sourceId, origin, reason }) => ({ sourceId, origin, reason }))],
    unseal: { ...proposal.unseal, automaticSkillIds: [...proposal.unseal.automaticSkillIds,
      ...additions.filter(a => a.unseal === 'automatic').map(a => a.sourceId)] },
    trueform: { automaticExternalSkillIds: [...proposal.trueform.automaticExternalSkillIds,
      ...additions.filter(a => a.trueform === 'automatic').map(a => a.sourceId)] } };
}
export function enrollmentState(before, p, preparation) {
  return { ...before, scopeId: p.nextScopeId, normalId: p.nextNormalId, snapshotVersion: 2,
    snapshotId: p.nextSnapshotId, setupId: p.setupId, revision: before.revision + 1,
    lastEnrollmentReviewId: p.reviewId, scopePreparationRequired: true,
    lastPlanId: null, lastRetainedPlanId: null, lastObservationId: null, preparation };
}
export function assertEnrollmentCurrent(w, p) {
  if (w.scopeId !== p.scopeId || w.state.revision !== p.revision || w.state.snapshotId !== p.beforeId ||
      activeNormalId(w) !== p.normalId || (w.state.setupId ?? null) !== p.previousSetupId) fail('stale-plan');
}
export async function loadEnrollmentReview(w, reviewId) {
  try {
    const p = await loadRecord(w.workspace, 'input', reviewId);
    exactKeys(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'revision', 'normalId', 'beforeId', 'previousSetupId',
      'discoveryId', 'additions', 'nextScopeId', 'nextNormalId', 'nextSnapshotId', 'setupReviewId', 'setupId'], [], 'enrollment-record-invalid');
    if (p.role !== 'enrollment-review' || ![1, 2, 3].includes(p.schemaVersion) || !Number.isSafeInteger(p.revision) || p.revision < 0 ||
        ['scopeId', 'normalId', 'beforeId', 'previousSetupId', 'discoveryId', 'nextScopeId', 'nextNormalId', 'nextSnapshotId'].some(k => !hash(p[k])) ||
        ['setupReviewId', 'setupId'].some(k => p.schemaVersion >= 2 ? p[k] !== null : !hash(p[k]))) fail('enrollment-record-invalid');
    validateAdditions(p.additions, p.schemaVersion);
    const before = scopeWorkspace(w, p.scopeId);
    const registrations = await loadScopeLineage(w.workspace, w.rootScopeId, p.nextScopeId);
    const reg = registrations[0].reg;
    if (reg.parentScopeId !== p.scopeId || reg.parentNormalId !== p.normalId || reg.normalId !== p.nextNormalId ||
        !equal(reg.skills.slice(before.reg.skills.length).map(s => s.id), p.additions.map(a => a.sourceId))) fail('enrollment-record-invalid');
    const next = { ...w, scopeId: p.nextScopeId, reg, registrations };
    const original = await loadSnapshot(w.workspace, before.reg, p.beforeId);
    const expanded = await loadSnapshot(w.workspace, reg, p.nextSnapshotId, 2);
    const normal = await loadSnapshot(w.workspace, reg, reg.normalId, 2);
    for (const key of Object.keys(expanded))
      if (!equal(expanded[key], Object.hasOwn(original, key) ? original[key] : normal[key])) fail('enrollment-record-invalid');
    const saved = await loadSetup(before, p.previousSetupId);
    if (saved.review.schemaVersion !== p.schemaVersion) fail('enrollment-record-invalid');
    if (p.schemaVersion >= 2) return { ...p, reviewId, before, next };
    const reviewed = await loadSetupReview(next, p.setupReviewId);
    if (reviewed.normalId !== p.nextNormalId || reviewed.beforeId !== p.nextSnapshotId || reviewed.revision !== p.revision + 1 ||
        reviewed.previousSetupId !== p.previousSetupId || !equal(reviewed.proposal,
          expandedProposal(saved.review.proposal, p.additions, p.nextScopeId, p.nextNormalId))) fail('enrollment-record-invalid');
    if ((await loadSetup(next, p.setupId)).review.reviewId !== p.setupReviewId) fail('enrollment-record-invalid');
    return { ...p, reviewId, before, next };
  } catch { fail('enrollment-record-invalid'); }
}
export async function validateEnrollmentStates(w, p, beforeState, afterState) {
  await validateStateSnapshots(w.workspace, p.before.reg, beforeState);
  await validateStateSnapshots(w.workspace, p.next.reg, afterState);
  assertEnrollmentCurrent({ ...p.before, state: beforeState }, p);
  if (p.schemaVersion >= 2 && beforeState.setupSchemaVersion !== p.schemaVersion) fail('journal-invalid');
  if ((beforeState.scopeId ?? w.rootScopeId) !== p.scopeId ||
      !equal(afterState, enrollmentState(beforeState, p, afterState.preparation))) fail('journal-invalid');
}
export const enrollmentSummary = p => ({ reviewId: p.reviewId, schemaVersion: p.schemaVersion, scopeId: p.scopeId, nextScopeId: p.nextScopeId,
  normalId: p.normalId, nextNormalId: p.nextNormalId, revision: p.revision, previousSetupId: p.previousSetupId, setupId: p.setupId,
  setupRequired: p.schemaVersion >= 2,
  additions: p.additions.map(a => ({ ...a, label: p.next.reg.skills.find(s => s.id === a.sourceId).label,
    enabled: p.next.reg.skills.find(s => s.id === a.sourceId).enabled })),
  existingSourcesChanged: 0, sourceFilesChanged: 0, modeChangeRequired: true, addedSourcesUntilPreparation: 'saved-normal' });

// These are previously confirmed roles, not a new choice of automatic Skills.
// Reading them never carries the earlier release sets into the expanded scope.
export async function readEnrollmentContext(w) {
  if (!w.state.lastEnrollmentReviewId) return null;
  const p = await loadEnrollmentReview(w, w.state.lastEnrollmentReviewId);
  if (p.nextScopeId !== w.scopeId) fail('enrollment-record-invalid');
  const previous = await loadSetup(p.before, p.previousSetupId);
  return { reviewId: p.reviewId, previousSetupId: p.previousSetupId,
    roles: [...previous.review.proposal.roles, ...p.additions.map(({ sourceId, origin, reason }) => ({ sourceId, origin, reason }))],
    setupRequired: !w.state.setupId, modeChangeRequired: w.state.scopePreparationRequired === true };
}
