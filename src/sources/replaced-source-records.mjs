// Immutable successor registration for one externally replaced Skill folder.
// Historical scopes, Normal snapshots, favorites and evidence remain intact.
import { dirname } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { equal } from './platform.mjs';
import { hash, pathsFor, validateFiles } from './capture.mjs';
import { loadRecord, loadSnapshot, loadNormal, validateStateSnapshots, scopeWorkspace,
  activeNormalId, workspaceManifestRoot } from './records.mjs';
import { validDirectoryIdentity } from '../platform/directory-identity.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail } from './errors.mjs';
import { recordId } from '../core/local-store.mjs';

const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = () => fail('replaced-source-record-invalid');
const fields = sourceId => ['body', 'policy', 'format'].map(part => sourceId + ':' + part);

export const replacementManifest = p => ({ schemaVersion: Math.max(2, p.beforeManifest.schemaVersion ?? 1), rootScopeId: p.rootScopeId });
export function replacementRegistration(parent, p, reviewId) {
  const index = parent.skills.findIndex(s => s.id === p.sourceId);
  if (index < 0) invalid();
  const skills = [...parent.skills]; skills[index] = p.newSkill;
  return { ...parent, role: 'registration-source-refresh', parentScopeId: p.scopeId,
    parentNormalId: activeNormalId({ reg: parent, state: p.beforeState }), replacedSourceReviewId: reviewId,
    skills, bindings: p.bindings, normalId: p.normalId };
}
export function replacementState(before, p, nextScopeId, preparation) {
  return { ...before, scopeId: nextScopeId, normalId: p.normalId, snapshotVersion: 2,
    snapshotId: p.observedId, revision: before.revision + 1, ownedDirs: p.ownedDirs,
    setupId: null, setupSchemaVersion: replacementManifest(p).schemaVersion,
    scopePreparationRequired: true, lastReplacedSourceReviewId: p.reviewId,
    lastPlanId: null, lastRetainedPlanId: null, lastObservationId: null, preparation };
}

export async function validateReplacementReview(workspace, parent, scopeId, p) {
  try {
    exactKeys(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'rootScopeId', 'beforeState', 'beforeManifest',
      'sourceId', 'newSkill', 'targetFiles', 'normalFiles', 'bodyChanged', 'missingPreparedFiles', 'bindings', 'ownedDirs',
      'normalId', 'observedId', 'reviewedAt'], ['retainedSettings'], 'replaced-source-record-invalid');
    if (p.kind !== 'unharness-user-source' || p.role !== 'replaced-source-review' || p.schemaVersion !== 1
      || p.scopeId !== scopeId || !id(p.rootScopeId) || !id(p.normalId) || !id(p.observedId)
      || workspaceManifestRoot(p.beforeManifest) !== p.rootScopeId
      || (p.beforeState.scopeId ?? p.rootScopeId) !== scopeId
      || !Array.isArray(p.missingPreparedFiles) || p.missingPreparedFiles.some(x => !['policy', 'format'].includes(x))
      || typeof p.bodyChanged !== 'boolean' || typeof p.reviewedAt !== 'string'
      || new Date(p.reviewedAt).toISOString() !== p.reviewedAt) invalid();
    await validateStateSnapshots(workspace, parent, p.beforeState);
    const old = parent.skills.find(s => s.id === p.sourceId);
    if (!old || p.newSkill.path !== old.path || p.newSkill.enabled !== old.enabled
      || !equal(p.newSkill.availability, old.availability) || p.newSkill.pluginId !== old.pluginId
      || p.newSkill.identity?.path !== old.path || p.newSkill.label !== p.newSkill.identity.name) invalid();
    exactKeys(p.targetFiles, ['body', 'policy', 'format'], [], 'replaced-source-record-invalid');
    exactKeys(p.normalFiles, ['body', 'policy', 'format'], [], 'replaced-source-record-invalid');
    const original = await loadNormal(workspace, parent, activeNormalId({ reg: parent, state: p.beforeState }));
    const before = await loadSnapshot(workspace, parent, p.beforeState.snapshotId);
    if (!equal(p.normalFiles, { body: p.targetFiles.body, policy: original[old.id + ':policy'], format: p.targetFiles.format })) invalid();
    const bodyChanged = original[old.id + ':body']?.text !== p.targetFiles.body?.text
      || old.sourceDigest !== p.newSkill.sourceDigest || !equal(old.identity, p.newSkill.identity);
    if (bodyChanged !== p.bodyChanged || !p.targetFiles.body) invalid();
    const missing = ['policy', 'format'].filter(part => before[old.id + ':' + part] !== null && p.targetFiles[part] === null);
    if (!equal(missing, p.missingPreparedFiles)) invalid();
    const digest = applicationFor(parent.context).skillSourceDigest({
      [p.newSkill.id + ':body']: p.normalFiles.body,
      [p.newSkill.id + ':policy']: p.normalFiles.policy,
      [p.newSkill.id + ':format']: p.normalFiles.format,
    }, p.newSkill);
    if (p.newSkill.sourceDigest !== digest || p.newSkill.id !== 'skill-' + hash({ identity: p.newSkill.identity, sourceDigest: digest })) invalid();
    const reg = replacementRegistration(parent, p, p.reviewId ?? '0'.repeat(64));
    if (!equal(Object.keys(p.bindings).sort(), Object.keys(pathsFor(reg)).sort())
      || !fields(old.id).every(key => !Object.hasOwn(p.bindings, key) || old.id === p.newSkill.id)
      || Object.entries(parent.bindings).some(([key, binding]) => !fields(old.id).includes(key) && !equal(p.bindings[key], binding))) invalid();
    const previous = parent.bindings[old.id + ':body'], current = p.bindings[p.newSkill.id + ':body'];
    if (previous.path !== dirname(old.path) || current?.path !== previous.path
      || !validDirectoryIdentity(current) || previous.ino === current.ino
      || previous.volumeUuid && previous.volumeUuid !== current.volumeUuid) invalid();
    if (!equal(p.ownedDirs, p.beforeState.ownedDirs.filter(d => !d.path.startsWith(dirname(old.path) + '/')))) invalid();
    const normal = await loadSnapshot(workspace, reg, p.normalId, 2);
    const observed = await loadSnapshot(workspace, reg, p.observedId, 2);
    for (const [from, to, saved] of [[original, normal, 'normal'], [before, observed, 'observed']]) {
      const excluded = new Set(fields(old.id));
      for (const [key, file] of Object.entries(from)) if (!excluded.has(key) && !equal(to[key], file)) invalid();
      for (const part of ['body', 'policy', 'format'])
        if (!equal(to[p.newSkill.id + ':' + part], (saved === 'normal' ? p.normalFiles : p.targetFiles)[part])) invalid();
      if (saved === 'normal') await loadNormal(workspace, reg);
    }
    if (p.retainedSettings !== undefined) {
      exactKeys(p.retainedSettings, ['config'], [], 'replaced-source-record-invalid');
      if (equal(before.config, p.retainedSettings.config)) invalid();
      validateFiles(reg, { ...observed, config: p.retainedSettings.config });
      const { mergeFrozenRetainedConfig } = await import('../codex/config-reconcile.mjs');
      const currentText = p.retainedSettings.config?.text ?? '';
      const proof = mergeFrozenRetainedConfig({ baseText: before.config?.text ?? '', targetText: before.config?.text ?? '',
        currentText, skillPaths: reg.skills.map(skill => skill.path), pluginIds: (reg.plugins ?? []).map(plugin => plugin.id) });
      if (proof.text !== currentText) invalid();
    }
    validateFiles(reg, normal); validateFiles(reg, observed);
    return p;
  } catch { invalid(); }
}

export async function loadReplacementReview(w, reviewId) {
  if (!id(reviewId)) invalid();
  const p = await loadRecord(w.workspace, 'input', reviewId);
  const before = scopeWorkspace(w, p.scopeId);
  await validateReplacementReview(w.workspace, before.reg, before.scopeId, p);
  if (p.rootScopeId !== w.rootScopeId) invalid();
  return { ...p, reviewId, before };
}

export async function validateReplacementRegistration(workspace, rootScopeId, parentScopeId, parent, child) {
  if (!id(child.replacedSourceReviewId)) invalid();
  const p = await loadRecord(workspace, 'input', child.replacedSourceReviewId);
  if (p.rootScopeId !== rootScopeId) invalid();
  await validateReplacementReview(workspace, parent, parentScopeId, p);
  if (!equal(child, replacementRegistration(parent, p, child.replacedSourceReviewId))) invalid();
  await loadNormal(workspace, child);
}

export const replacementSummary = p => ({ reviewId: p.reviewId, sourceId: p.sourceId,
  nextScopeId: recordId('scope', { kind: 'unharness-user-source', ...replacementRegistration(p.before.reg, p, p.reviewId) }),
  label: p.newSkill.label, bodyChanged: p.bodyChanged, retainedSettingsPending: p.retainedSettings !== undefined,
  ...(p.bodyChanged ? { body: p.targetFiles.body.text } : {}),
  missingPreparedFiles: [...p.missingPreparedFiles],
  details: { path: p.newSkill.path, previousDirectory: p.before.reg.bindings[p.sourceId + ':body'],
    currentDirectory: p.bindings[p.newSkill.id + ':body'], nextSourceId: p.newSkill.id } });
