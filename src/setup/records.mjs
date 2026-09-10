// Persisted setup records are readable during offline recovery. No native
// catalog, configuration editor or YAML implementation is imported here.
import { exactKeys } from '../comparisons/assessment.mjs';
import { loadRecord, loadNormal, loadSnapshot, activeNormalId } from '../sources/records.mjs';
import { fail } from '../sources/errors.mjs';
import { applicationFor } from '../apps/index.mjs';
import { equal } from '../sources/platform.mjs';
import { validatePresetProposal, compileReleasePreset } from './preset.mjs';
import { validateSetupInventory } from './inventory.mjs';

export const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const shape = (v, keys) => exactKeys(v, keys, [], 'setup-record-invalid');
export const setupScope = (w, normalId = activeNormalId(w)) => ({ scopeId: w.scopeId, normalId,
  application: applicationFor(w.reg.context).id, runtimeVersion: w.reg.version, instructions: w.reg.instructions, skills: w.reg.skills });

export async function loadSetupReview(w, reviewId) {
  try {
    const p = await loadRecord(w.workspace, 'input', reviewId);
    shape(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'normalId', 'revision', 'beforeId', 'previousSetupId', 'proposal', 'presets',
      ...(p.schemaVersion === 2 ? ['inventory'] : [])]);
    if (p.role !== 'setup-review' || ![1, 2].includes(p.schemaVersion) || p.scopeId !== w.scopeId || !hash(p.normalId)
      || !hash(p.beforeId) || !(p.previousSetupId === null || hash(p.previousSetupId))
      || !Number.isSafeInteger(p.revision) || p.revision < 0) fail('setup-record-invalid');
    validatePresetProposal(p.proposal, setupScope(w, p.normalId));
    if (p.proposal.schemaVersion !== p.schemaVersion) fail('setup-record-invalid');
    if (p.proposal.roles.some(r => r.origin === 'unknown')) fail('setup-record-invalid');
    await loadNormal(w.workspace, w.reg, p.normalId);
    await loadSnapshot(w.workspace, w.reg, p.beforeId);
    shape(p.presets, ['unseal', 'trueform']);
    if (p.schemaVersion === 2) {
      validateSetupInventory(p.inventory, setupScope(w, p.normalId));
      for (const mode of ['unseal', 'trueform']) {
        const preset = p.presets[mode], options = compileReleasePreset(p.proposal, mode, setupScope(w, p.normalId), p.inventory);
        shape(preset, [...Object.keys(options), 'snapshotId', 'guide', 'skillStates']);
        if (!hash(preset.snapshotId) || Object.entries(options).some(([key, value]) => !equal(value, preset[key]))) fail('setup-record-invalid');
        const states = p.inventory.skills.filter(s => !s.requiredControl).map(s => ({ id: s.id, enabled: s.enabled,
          manualOnly: s.enabled && !options.automaticSkillIds.includes(s.id) }));
        if (!equal(states, preset.skillStates)) fail('setup-record-invalid');
        await loadSnapshot(w.workspace, w.reg, preset.snapshotId);
      }
      return { ...p, reviewId };
    }
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
    if (p.role !== 'release-setup' || ![1, 2].includes(p.schemaVersion) || p.scopeId !== w.scopeId || !hash(p.reviewId))
      fail('setup-record-invalid');
    const review = await loadSetupReview(w, p.reviewId);
    if (review.schemaVersion !== p.schemaVersion) fail('setup-record-invalid');
    return { setupId, review };
  } catch { fail('setup-record-invalid'); }
}

export const setupReviewSummary = review => ({ reviewId: review.reviewId, scopeId: review.scopeId,
  schemaVersion: review.schemaVersion,
  ...(review.schemaVersion === 2 ? { inventoryId: review.inventory.inventoryId, inheritance: review.presets.trueform.inheritance,
    plugins: review.inventory.plugins } : {}),
  normalId: review.normalId, revision: review.revision, previousSetupId: review.previousSetupId,
  basis: review.proposal.basis, roles: review.proposal.roles,
  presets: Object.fromEntries(Object.entries(review.presets).map(([mode, preset]) => [mode, {
    instructionStyle: preset.instructionStyle, skillRelease: preset.skillRelease,
    ...(review.schemaVersion === 2 ? { automaticSkillIds: preset.automaticSkillIds } : {}),
    selectedIds: preset.selection, skillStates: preset.skillStates, guide: preset.guide,
  }])), sourceFilesChanged: 0, modeChangeRequired: true });

export function assertReviewCurrent(w, p) {
  if (p.revision !== w.state.revision || p.beforeId !== w.state.snapshotId || p.normalId !== activeNormalId(w)
    || p.previousSetupId !== (w.state.setupId ?? null)) fail('stale-plan');
}

export const adoptedState = (before, setupId, schemaVersion = 1) => ({ ...before, setupId,
  ...(schemaVersion === 2 ? { setupSchemaVersion: 2 } : {}), revision: before.revision + 1,
  lastPlanId: null, lastRetainedPlanId: null });
