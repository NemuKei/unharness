// Persisted setup records are readable during offline recovery. No native
// catalog, configuration editor or YAML implementation is imported here.
import { exactKeys } from '../comparisons/assessment.mjs';
import { loadRecord, loadNormal, loadSnapshot, activeNormalId } from '../sources/records.mjs';
import { fail } from '../sources/errors.mjs';
import { applicationFor } from '../apps/index.mjs';
import { validatePresetProposal } from './preset.mjs';

export const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const shape = (v, keys) => exactKeys(v, keys, [], 'setup-record-invalid');
export const setupScope = (w, normalId = activeNormalId(w)) => ({ scopeId: w.scopeId, normalId,
  application: applicationFor(w.reg.context).id, instructions: w.reg.instructions, skills: w.reg.skills });

export async function loadSetupReview(w, reviewId) {
  try {
    const p = await loadRecord(w.workspace, 'input', reviewId);
    shape(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'normalId', 'revision', 'beforeId', 'previousSetupId', 'proposal', 'presets']);
    if (p.role !== 'setup-review' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !hash(p.normalId)
      || !hash(p.beforeId) || !(p.previousSetupId === null || hash(p.previousSetupId))
      || !Number.isSafeInteger(p.revision) || p.revision < 0) fail('setup-record-invalid');
    validatePresetProposal(p.proposal, setupScope(w, p.normalId));
    if (p.proposal.roles.some(r => r.origin === 'unknown')) fail('setup-record-invalid');
    await loadNormal(w.workspace, w.reg, p.normalId);
    await loadSnapshot(w.workspace, w.reg, p.beforeId);
    shape(p.presets, ['unseal', 'trueform']);
    for (const mode of ['unseal', 'trueform']) {
      const preset = p.presets[mode];
      shape(preset, ['instructionStyle', 'skillRelease', 'selection', 'snapshotId', 'guide', 'skillStates']);
      const automatic = mode === 'unseal' ? p.proposal.unseal.automaticSkillIds : p.proposal.trueform.automaticExternalSkillIds;
      const manual = w.reg.skills.filter(s => !automatic.includes(s.id));
      const selection = [...(w.reg.instructions ? [w.reg.instructions.id] : []), ...manual.map(s => s.id)];
      if (preset.instructionStyle !== (mode === 'unseal' ? p.proposal.unseal.instructions : 'none')
        || preset.skillRelease !== 'manual-only' || !hash(preset.snapshotId)
        || JSON.stringify(preset.selection) !== JSON.stringify(selection)
        || !Array.isArray(preset.skillStates) || preset.skillStates.length !== manual.length) fail('setup-record-invalid');
      for (const [i, state] of preset.skillStates.entries()) {
        shape(state, ['id', 'enabled', 'manualOnly']);
        if (state.id !== manual[i].id || state.enabled !== manual[i].enabled || state.manualOnly !== manual[i].enabled)
          fail('setup-record-invalid');
      }
      await loadSnapshot(w.workspace, w.reg, preset.snapshotId);
    }
    return { ...p, reviewId };
  } catch { fail('setup-record-invalid'); }
}

export async function loadSetup(w, setupId = w.state.setupId) {
  if (setupId == null) return null;
  try {
    const p = await loadRecord(w.workspace, 'application', setupId);
    shape(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'reviewId']);
    if (p.role !== 'release-setup' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !hash(p.reviewId))
      fail('setup-record-invalid');
    return { setupId, review: await loadSetupReview(w, p.reviewId) };
  } catch { fail('setup-record-invalid'); }
}

export const setupReviewSummary = review => ({ reviewId: review.reviewId, scopeId: review.scopeId,
  normalId: review.normalId, revision: review.revision, previousSetupId: review.previousSetupId,
  basis: review.proposal.basis, roles: review.proposal.roles,
  presets: Object.fromEntries(Object.entries(review.presets).map(([mode, preset]) => [mode, {
    instructionStyle: preset.instructionStyle, skillRelease: preset.skillRelease,
    selectedIds: preset.selection, skillStates: preset.skillStates, guide: preset.guide,
  }])), sourceFilesChanged: 0, modeChangeRequired: true });

export function assertReviewCurrent(w, p) {
  if (p.revision !== w.state.revision || p.beforeId !== w.state.snapshotId || p.normalId !== activeNormalId(w)
    || p.previousSetupId !== (w.state.setupId ?? null)) fail('stale-plan');
}

export const adoptedState = (before, setupId) => ({ ...before, setupId, revision: before.revision + 1,
  lastPlanId: null, lastRetainedPlanId: null });
