// Frozen plugin enrollment and offline lineage validation. No native inventory
// or configuration writer is imported while reopening or cancelling a record.
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { recordId } from '../core/local-store.mjs';
import { loadRecord, loadScopeLineage, scopeWorkspace, activeNormalId, loadNormal, loadSnapshot,
  validateStateSnapshots, workspaceManifestRoot } from '../sources/records.mjs';
import { equal } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { loadSetup } from './records.mjs';
import { validateRegisteredPlugins } from '../codex/plugin-dependency.mjs';

const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = () => fail('plugin-enrollment-record-invalid');
const pluginId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}@openai-curated-remote$/.test(value);

export function validatePluginAdditions(value) {
  if (!Array.isArray(value) || !value.length || value.length > 32
    || new Set(value.map(a => a?.pluginId)).size !== value.length) fail('plugin-enrollment-proposal-invalid');
  for (const a of value) {
    exactKeys(a, ['pluginId', 'origin', 'reason', 'optional'], [], 'plugin-enrollment-proposal-invalid');
    if (!pluginId(a.pluginId) || !['self', 'external'].includes(a.origin) || a.optional !== true)
      fail('plugin-enrollment-proposal-invalid');
    boundedText(a.reason, 600, true, 'plugin-enrollment-proposal-invalid');
  }
  return structuredClone(value);
}

export function pluginEnrollmentRegistration(parent, p, reviewId) {
  const { rebindReviewId, pluginEnrollmentReviewId, ...preserved } = parent;
  return { ...preserved, role: 'registration-controls-v3', controlSchemaVersion: 3,
    parentScopeId: p.scopeId, parentNormalId: p.normalId, pluginEnrollmentReviewId: reviewId,
    normalId: p.nextNormalId, plugins: [...(parent.plugins ?? []), ...p.plugins] };
}

export async function validatePluginEnrollmentReview(workspace, parent, scopeId, p) {
  try {
    exactKeys(p, ['kind', 'role', 'schemaVersion', 'rootScopeId', 'scopeId', 'beforeState', 'beforeManifest',
      'discoveryId', 'normalId', 'nextNormalId', 'nextSnapshotId', 'additions', 'plugins'], [], 'plugin-enrollment-record-invalid');
    if (p.kind !== 'unharness-user-source' || p.role !== 'plugin-enrollment-review' || p.schemaVersion !== 3
      || p.scopeId !== scopeId || ['rootScopeId', 'scopeId', 'discoveryId', 'normalId', 'nextNormalId', 'nextSnapshotId'].some(k => !hash(p[k]))
      || workspaceManifestRoot(p.beforeManifest) !== p.rootScopeId
      || (p.beforeState.scopeId ?? p.rootScopeId) !== scopeId
      || (p.beforeState.setupSchemaVersion ?? 1) > (p.beforeManifest.schemaVersion ?? 1)
      || (parent.context.application && parent.context.application !== 'codex') || parent.version !== '0.153.4'
      || p.normalId !== activeNormalId({ state: p.beforeState, reg: parent })) invalid();
    validatePluginAdditions(p.additions);
    const existing = parent.plugins ?? [];
    if (!Array.isArray(p.plugins) || p.plugins.length !== p.additions.length || existing.length + p.plugins.length > 32
      || p.plugins.some((plugin, i) => plugin.id !== p.additions[i].pluginId || existing.some(s => s.id === plugin.id)
        || !equal(plugin.role, { origin: p.additions[i].origin, reason: p.additions[i].reason, optional: true }))) invalid();
    await validateStateSnapshots(workspace, parent, p.beforeState);
    const before = { workspace, scopeId, rootScopeId: p.rootScopeId, reg: parent, state: p.beforeState };
    await loadSetup(before);
    const candidate = pluginEnrollmentRegistration(parent, p, '0'.repeat(64));
    const originalNormal = await loadNormal(workspace, parent, p.normalId);
    const originalPrepared = await loadSnapshot(workspace, parent, p.beforeState.snapshotId);
    if (!equal(originalNormal, await loadSnapshot(workspace, candidate, p.nextNormalId, 2))
      || !equal(originalPrepared, await loadSnapshot(workspace, candidate, p.nextSnapshotId, 2))) invalid();
    await validateRegisteredPlugins(workspace, candidate);
    return p;
  } catch { invalid(); }
}

export async function validatePluginEnrollmentRegistration(workspace, rootScopeId, parentScopeId, parent, child) {
  if (!hash(child.pluginEnrollmentReviewId)) invalid();
  const p = await loadRecord(workspace, 'input', child.pluginEnrollmentReviewId);
  await validatePluginEnrollmentReview(workspace, parent, parentScopeId, p);
  if (p.rootScopeId !== rootScopeId || !equal(child, pluginEnrollmentRegistration(parent, p, child.pluginEnrollmentReviewId))) invalid();
}

export async function loadPluginEnrollmentReview(w, reviewId) {
  try {
    if (!hash(reviewId)) invalid();
    const p = await loadRecord(w.workspace, 'input', reviewId);
    const before = scopeWorkspace(w, p.scopeId);
    await validatePluginEnrollmentReview(w.workspace, before.reg, before.scopeId, p);
    if (p.rootScopeId !== w.rootScopeId) invalid();
    const reg = pluginEnrollmentRegistration(before.reg, p, reviewId);
    const nextScopeId = recordId('scope', reg);
    const registrations = await loadScopeLineage(w.workspace, w.rootScopeId, nextScopeId);
    if (!equal(registrations[0].reg, reg)) invalid();
    return { ...p, reviewId, nextScopeId, before, next: { ...w, scopeId: nextScopeId, reg, registrations } };
  } catch { invalid(); }
}

export const pluginEnrollmentManifest = p => ({ schemaVersion: 3, rootScopeId: p.rootScopeId });
export function pluginEnrollmentState(before, p, preparation) {
  return { ...before, scopeId: p.nextScopeId, normalId: p.nextNormalId, snapshotVersion: 2,
    snapshotId: p.nextSnapshotId, setupId: null, setupSchemaVersion: 3, revision: before.revision + 1,
    lastPluginEnrollmentReviewId: p.reviewId, lastEnrollmentReviewId: null, scopePreparationRequired: true,
    lastPlanId: null, lastRetainedPlanId: null, lastObservationId: null, preparation };
}
export function assertPluginEnrollmentCurrent(w, p) {
  if (w.scopeId !== p.scopeId || !equal(w.state, p.beforeState) || !equal(w.manifest, p.beforeManifest)) fail('stale-plan');
}
export async function validatePluginEnrollmentStates(w, p, j) {
  if (j.scopeId !== p.scopeId || !equal(j.beforeState, p.beforeState) || !equal(j.beforeManifest, p.beforeManifest)
    || !equal(j.afterManifest, pluginEnrollmentManifest(p))
    || !equal(j.afterState, pluginEnrollmentState(j.beforeState, p, j.afterState.preparation))
    || ![j.beforeState, j.afterState].some(s => equal(s, w.state))
    || ![j.beforeManifest, j.afterManifest].some(m => equal(m, w.manifest))) fail('journal-invalid');
  await validateStateSnapshots(w.workspace, p.before.reg, j.beforeState);
  await validateStateSnapshots(w.workspace, p.next.reg, j.afterState);
}
export const pluginEnrollmentSummary = p => ({ reviewId: p.reviewId, schemaVersion: 3, scopeId: p.scopeId,
  nextScopeId: p.nextScopeId, normalId: p.normalId, nextNormalId: p.nextNormalId, revision: p.beforeState.revision,
  previousSetupId: p.beforeState.setupId ?? null, setupId: null, setupRequired: true,
  additions: p.additions.map((a, i) => ({ ...a, label: p.plugins[i].label, enabled: p.plugins[i].normalEnabled,
    features: p.plugins[i].features })), existingSourcesChanged: 0, sourceFilesChanged: 0,
  modeChangeRequired: true, addedSourcesUntilPreparation: 'saved-normal' });
