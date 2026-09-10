import { currentObservation } from './observation-record.mjs';
import { join } from 'node:path';
import { lstat } from 'node:fs/promises';
import { listRecordPage } from '../core/local-store.mjs';
import {
  discoveryCapture,
  discoverySummary,
  captureRegistered,
  retained,
  freshCatalog,
  targetFile
} from './capture.mjs';
import {
  initializeWorkspace,
  openWorkspace,
  scopeWorkspace,
  activeNormalId,
  loadNormal,
  saveSnapshot,
  loadSnapshot,
  loadRecord,
  record,
  readJson,
  ownerPath
} from './records.mjs';
import {
  acquire,
  pending,
  assertCurrent,
  loadPlan,
  transact,
  recoverTransaction
} from './transaction.mjs';
import { canonical, equal, assertPlanOwnershipChanges } from './platform.mjs';
import { applicationFor } from '../apps/index.mjs';
import { requiredControlSources, assertControlPreserved, assertControlChanges } from '../setup/control-sources.mjs';
import {
  fail,
  privateCall,
  verification,
  USER_SOURCE_ERROR_KINDS
} from './errors.mjs';
export { USER_SOURCE_ERROR_KINDS };
const wrap = (fn) => (args) => privateCall(() => fn(args ?? {}));
const recoveryArgv = (workspace) => [
  'node',
  'bin/unharness.mjs',
  'sources',
  'recover',
  '--json',
  JSON.stringify({ workspace })
];
function targets(reg) {
  return [...(reg.instructions ? [reg.instructions] : []), ...reg.skills];
}
export const discoverUserSources = wrap(async (context) =>
  discoverySummary(await discoveryCapture(context))
);
export const registerUserSources = wrap(
  async ({
    context,
    discoveryId,
    instructionsOptional = false,
    selectedSkillIds = [],
    userAddedOptional = false
  }) => {
    if (
      !Array.isArray(selectedSkillIds) ||
      selectedSkillIds.length > 32 ||
      new Set(selectedSkillIds).size !== selectedSkillIds.length ||
      typeof instructionsOptional !== 'boolean'
    )
      fail('invalid-request');
    if (
      userAddedOptional !== true ||
      (!instructionsOptional && !selectedSkillIds.length)
    )
      fail('optional-role-required');
    const d = await discoveryCapture(context);
    if (d.discoveryId !== discoveryId) fail('stale-discovery');
    assertControlPreserved({ selectedIds: selectedSkillIds, control: requiredControlSources(d.skills) });
    if (
      d.unavailableSources.length ||
      (instructionsOptional && !d.instructions.eligible) ||
      selectedSkillIds.some(
        (id) => !d.skills.some((s) => s.id === id && s.eligible)
      )
    )
      fail('unsupported-source');
    const { workspace, scopeId, reg } = await initializeWorkspace(
      d,
      selectedSkillIds,
      instructionsOptional
    );
    return {
      workspace,
      scopeId,
      normalId: reg.normalId,
      sources: targets(reg),
      recoveryArgv: recoveryArgv(workspace),
      verification
    };
  }
);
export const userSourceState = wrap(async ({ workspace }) => {
  const w = await openWorkspace(workspace);
  let conflict = null;
  try {
    await assertCurrent(
      w,
      await loadSnapshot(workspace, w.reg, w.state.snapshotId)
    );
  } catch (e) {
    conflict = { kind: e.kind ?? 'source-conflict' };
  }
  const recoveryPending = await pending(workspace);
  const observed = await currentObservation(w, loadRecord, { conflict, pending: recoveryPending });
  return {
    ...observed,
    context: w.reg.context,
    registration: {
      scopeId: w.scopeId,
      rootScopeId: w.rootScopeId,
      previousScopeIds: w.registrations.slice(1).map(s => s.scopeId),
      modeChangeRequired: w.state.scopePreparationRequired === true,
      normalId: w.reg.normalId,
      activeNormalId: activeNormalId(w),
      sources: targets(w.reg)
    },
    preparedMode: w.state.preparedMode,
    setup: { setupId: w.state.setupId ?? null, preparedSetupId: w.state.preparedSetupId ?? null,
      schemaVersion: w.state.setupSchemaVersion ?? (w.state.setupId ? 1 : null),
      setupRequired: w.manifestVersion === 2 && !w.state.setupId },
    revision: w.state.revision,
    conflict,
    recovery: {
      pending: recoveryPending,
      lastCheckpointId: w.state.lastCheckpointId,
      argv: recoveryArgv(workspace)
    },
    verification
  };
});
function planSummary(plan, planId) {
  return {
    planId,
    scopeId: plan.scopeId,
    mode: plan.mode,
    preparedMode: plan.preparedMode,
    revision: plan.revision,
    selectedIds: plan.selectedIds,
    changedFiles: plan.changedFiles,
    skillStates: plan.skillStates,
    guide: plan.guide,
    adaptation: plan.adaptation ?? null,
    setupId: plan.setupId ?? null,
    retained,
    verification
  };
}
async function buildPlan(
  w,
  {
    mode,
    preparedMode = mode,
    selectedIds,
    after,
    guide = null,
    skillStates = [],
    adaptation = null,
    setupId = null,
    restoreSourceId = null
  }
) {
  if (await pending(w.workspace)) fail('recovery-required');
  if (['unseal', 'trueform'].includes(mode)) await freshCatalog(w.reg);
  const before = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
  await assertCurrent(w, before);
  assertControlChanges({ sources: w.reg.skills, before, after });
  assertPlanOwnershipChanges(before, after);
  const afterId = await saveSnapshot(w.workspace, w.reg, after, w.state.snapshotVersion ?? 1);
  const plan = {
    role: 'plan',
    normalId: activeNormalId(w),
    snapshotVersion: w.state.snapshotVersion ?? 1,
    adaptation,
    setupId,
    ...(restoreSourceId === null ? {} : { restoreSourceId }),
    scopeId: w.scopeId,
    revision: w.state.revision,
    mode,
    preparedMode,
    selectedIds,
    beforeId: w.state.snapshotId,
    afterId,
    guide,
    skillStates,
    changedFiles: Object.keys(before)
      .filter((k) => !equal(before[k], after[k]))
      .map((id) => ({
        id,
        label: applicationFor(w.reg.context).changedFileLabel(id)
      }))
  };
  return planSummary(plan, await record(w.workspace, 'application', plan));
}
export const planUserMode = wrap(async ({ workspace, mode, selectedIds }) => {
  if (!['normal', 'unseal', 'trueform'].includes(mode)) fail('invalid-request');
  const w = await openWorkspace(workspace),
    all = targets(w.reg);
  if (w.manifestVersion === 2 && mode !== 'normal' && selectedIds !== undefined) fail('setup-proposal-invalid');
  if (w.manifestVersion === 2 && mode !== 'normal' && !w.state.setupId) fail('setup-required');
  if (selectedIds === undefined && mode !== 'normal' && w.state.setupId) {
    const { savedPresetForMode } = await import('../setup/service.mjs');
    return buildPlan(w, { mode, ...await savedPresetForMode(w, mode) });
  }
  const selection =
    selectedIds ??
    (mode === 'normal'
      ? []
      : all.filter((t) => t.availability[mode]).map((t) => t.id));
  if (
    !Array.isArray(selection) ||
    new Set(selection).size !== selection.length ||
    selection.some((id) => !all.some((t) => t.id === id))
  )
    fail('invalid-request');
  if (mode === 'normal' && selection.length) fail('invalid-request');
  assertControlPreserved({ selectedIds: selection, control: requiredControlSources(w.reg.skills) });
  if (selection.some((id) => !all.find((t) => t.id === id).availability[mode]))
    fail('unsupported-source');
  const normal = await loadNormal(workspace, w.reg, activeNormalId(w));
  const { after, guide, skillStates } = await applicationFor(
    w.reg.context
  ).compile({
    reg: w.reg,
    mode,
    selection,
    normal,
    targetFile: (key, text) => targetFile(w.reg, key, text, normal)
  });
  return buildPlan(w, {
    mode,
    selectedIds: selection,
    after,
    guide,
    skillStates
  });
});
export const applyUserPlan = wrap(async ({ workspace, planId }) => {
  const w = await openWorkspace(workspace),
    release = await acquire(w);
  try {
    // Re-read after acquiring: other completed callers may have advanced state.
    const current = await openWorkspace(workspace);
    if (current.state.lastPlanId === planId && !(await pending(workspace))) {
      await assertCurrent(
        current,
        await loadSnapshot(workspace, current.reg, current.state.snapshotId)
      );
      return {
        planId,
        checkpointId: current.state.lastCheckpointId,
        preparedMode: current.state.preparedMode,
        revision: current.state.revision,
        readback: 'matched',
        duplicate: true,
        verification
      };
    }
    const plan = await loadPlan(current, planId);
    if (
      plan.revision !== current.state.revision ||
      plan.beforeId !== current.state.snapshotId
    )
      fail('stale-plan');
    await assertCurrent(
      current,
      await loadSnapshot(workspace, current.reg, plan.beforeId)
    );
    if (['unseal', 'trueform'].includes(plan.mode))
      await freshCatalog(current.reg);
    if (current.manifestVersion === 2) {
      const { assertV2ApplicationPlan } = await import('../setup/apply-plan.mjs');
      await assertV2ApplicationPlan(current, plan);
    }
    return await transact(current, plan, planId);
  } finally {
    await release();
  }
});
export const saveUserFavorite = wrap(async ({ workspace, name }) => {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 120 ||
    /[\u0000-\u001f]/.test(name)
  )
    fail('invalid-request');
  let w = await openWorkspace(workspace);
  const release = await acquire(w);
  try {
    w = await openWorkspace(workspace);
    if (await pending(workspace)) fail('recovery-required');
    if (w.state.scopePreparationRequired) fail('source-preparation-required');

    const files = await loadSnapshot(workspace, w.reg, w.state.snapshotId);
    await assertCurrent(w, files);
    const favoriteId = await record(workspace, 'favorite', {
      role: 'favorite',
      normalId: activeNormalId(w),
      scopeId: w.scopeId,
      name,
      snapshotId: w.state.snapshotId,
      preparedMode: w.state.preparedMode,
      preparedSetupId: w.state.preparedSetupId ?? null,
      revision: w.state.revision
    });
    return {
      favoriteId,
      name,
      snapshotId: w.state.snapshotId,
      preparedMode: w.state.preparedMode,
      verification
    };
  } finally {
    await release();
  }
});
export const listUserFavorites = wrap(async ({ workspace, after, limit }) => {
  const w = await openWorkspace(workspace),
    page = await listRecordPage({ store: workspace, type: 'favorite', after, limit });
  const favorites = [];
  for (const { id, payload: p } of page.records) {
    if (
      p.kind !== 'unharness-user-source' ||
      p.role !== 'favorite'
    )
      fail('record-invalid');
    const historical = scopeWorkspace(w, p.scopeId);
    await loadSnapshot(workspace, historical.reg, p.snapshotId);
    await loadNormal(workspace, historical.reg, p.normalId ?? historical.reg.normalId);
    if (p.comparisonRunId !== undefined && (typeof p.comparisonRunId !== 'string' || !/^[0-9a-f]{64}$/.test(p.comparisonRunId))) fail('record-invalid');
    favorites.push({
      favoriteId: id,
      snapshotId: p.snapshotId,
      ...(p.comparisonRunId === undefined ? {} : { comparisonRunId: p.comparisonRunId }),
      normalId: p.normalId ?? historical.reg.normalId,
      needsAdaptation: p.scopeId !== w.scopeId || (p.normalId ?? historical.reg.normalId) !== activeNormalId(w),
      ...(p.scopeId === w.scopeId ? {} : { scopeId: p.scopeId,
        addedSourceIds: w.reg.skills.filter(s => !historical.reg.skills.some(h => h.id === s.id)).map(s => s.id) }),
      name: p.name,
      preparedMode: p.preparedMode,
      revision: p.revision
    });
  }
  return { favorites, nextCursor: page.nextCursor };
});
async function restorePlan({ workspace, id, type }) {
  const w = await openWorkspace(workspace),
    r = await loadRecord(workspace, type, id);
  if (r.role !== type) fail('record-invalid');
  scopeWorkspace(w, r.scopeId);
  const { adaptRetainedSnapshot } = await import('./retained-settings.mjs');
  const { after, adaptation } = await adaptRetainedSnapshot(w, r, id, type);
  return buildPlan(w, {
    mode: type,
    restoreSourceId: id,
    adaptation,
    setupId: r.preparedSetupId ?? null,
    preparedMode: r.preparedMode,
    selectedIds: targets(w.reg).map((s) => s.id),
    after
  });
}
export const planUserFavorite = wrap(({ workspace, favoriteId }) =>
  restorePlan({ workspace, id: favoriteId, type: 'favorite' })
);
export const planUserCheckpoint = wrap(({ workspace, checkpointId }) =>
  restorePlan({ workspace, id: checkpointId, type: 'checkpoint' })
);
export const recoverUserSources = wrap(async ({ workspace }) => {
  const w = await openWorkspace(workspace),
    release = await acquire(w, true);
  try {
    return await recoverTransaction(await openWorkspace(workspace));
  } finally {
    await release();
  }
});
export const reviewUserSource = wrap(async ({ workspace, sourceId }) => {
  const w = await openWorkspace(workspace),
    normal = await loadSnapshot(workspace, w.reg, w.reg.normalId);
  if (w.reg.instructions?.id === sourceId)
    return { sourceId, text: normal[w.reg.instructions.effective]?.text ?? '' };
  const skill = w.reg.skills.find((s) => s.id === sourceId);
  if (!skill) fail('invalid-request');
  return { sourceId, text: normal[skill.id + ':body'].text };
});

export const reviewDiscoveredUserSource = wrap(
  async ({ context, discoveryId, sourceId }) => {
    const d = await discoveryCapture(context);
    if (d.discoveryId !== discoveryId) fail('stale-discovery');
    if (d.instructions.id === sourceId && d.instructions.eligible)
      return { sourceId, text: d.files[d.instructions.effective].text };
    const s = d.skills.find((s) => s.id === sourceId && s.eligible);
    if (!s) fail('invalid-request');
    return { sourceId, text: s.body.text };
  }
);

// Resolve only an existing reservation. This never invokes Codex, creates a
// workspace, refreshes source contents, or captures a new Normal record.
export const locateUserSources = wrap(async ({ context }) => {
  const { contextOf } = await import('./catalog.mjs');
  const bound = await contextOf(context);
  const owner = ownerPath(applicationFor(bound).home(bound));
  try {
    await lstat(owner);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    fail('workspace-invalid');
  }
  try {
    await canonical(owner);
    const reservation = await readJson(join(owner, 'reservation.json'));
    const w = await openWorkspace(reservation.workspace);
    if (!equal(w.reg.context, bound) || w.owner !== owner)
      fail('workspace-invalid');
    return {
      workspace: w.workspace,
      scopeId: w.scopeId,
      rootScopeId: w.rootScopeId,
      normalId: w.reg.normalId,
      context: w.reg.context,
      recoveryArgv: recoveryArgv(w.workspace)
    };
  } catch {
    fail('workspace-invalid');
  }
});

export const observeUserTask = wrap(async args => {
  const { observe } = await import('./observation.mjs');
  return observe(args);
});

export const planUserRetainedSettings = wrap(async args => {
  const { planRetainedSettings } = await import('./retained-settings.mjs');
  return planRetainedSettings(args);
});
export const acceptUserRetainedSettings = wrap(async args => {
  const { acceptRetainedSettings } = await import('./retained-settings.mjs');
  return acceptRetainedSettings(args);
});

export const reviewUserRun = wrap(async args => (await import('../comparisons/service.mjs')).reviewUserRun(args));
export const saveUserRun = wrap(async args => (await import('../comparisons/service.mjs')).saveUserRun(args));
export const readUserRun = wrap(async args => (await import('../comparisons/service.mjs')).readUserRun(args));
export const readUserRunOutput = wrap(async args => (await import('../comparisons/service.mjs')).readUserRunOutput(args));
export const listUserRuns = wrap(async args => (await import('../comparisons/service.mjs')).listUserRuns(args));
export const compareUserRuns = wrap(async args => (await import('../comparisons/service.mjs')).compareUserRuns(args));
export const saveUserRunFavorite = wrap(async args => (await import('../comparisons/service.mjs')).saveUserRunFavorite(args));

export const reviewUserStart = wrap(async args => (await import('../experiments/service.mjs')).reviewUserStart(args));
export const saveUserStart = wrap(async args => (await import('../experiments/service.mjs')).saveUserStart(args));
export const readUserStart = wrap(async args => (await import('../experiments/service.mjs')).readUserStart(args));
export const listUserStarts = wrap(async args => (await import('../experiments/service.mjs')).listUserStarts(args));

export const reviewUserReplay = wrap(async args => (await import('../experiments/replay-service.mjs')).reviewUserReplay(args));
export const prepareUserReplay = wrap(async args => (await import('../experiments/replay-service.mjs')).prepareUserReplay(args));
export const handoffUserReplay = wrap(async args => (await import('../experiments/replay-service.mjs')).handoffUserReplay(args));
export const readUserReplay = wrap(async args => (await import('../experiments/replay-service.mjs')).readUserReplay(args));
export const listUserReplays = wrap(async args => (await import('../experiments/replay-service.mjs')).listUserReplays(args));
export const cancelUserReplay = wrap(async args => (await import('../experiments/replay-service.mjs')).cancelUserReplay(args));
export const observeUserReplay = wrap(async args => (await import('../experiments/replay-results.mjs')).observeUserReplay(args));
export const saveUserReplayResult = wrap(async args => (await import('../experiments/replay-results.mjs')).saveUserReplayResult(args));
export const readUserReplayResult = wrap(async args => (await import('../experiments/replay-results.mjs')).readUserReplayResult(args));
export const openUserReplay = wrap(async args => (await import('../experiments/replay-service.mjs')).openUserReplay(args));
export const compareUserReplayResults = wrap(async args => (await import('../experiments/replay-results.mjs')).compareUserReplayResults(args));
export const saveUserReplayFavorite = wrap(async args => (await import('../experiments/replay-results.mjs')).saveUserReplayFavorite(args));

export const readUserSetup = wrap(async args => (await import('../setup/service.mjs')).readSetup(args));
export const reviewUserSetup = wrap(async args => (await import('../setup/service.mjs')).reviewSetup(args));
export const applyUserSetup = wrap(async args => (await import('../setup/service.mjs')).applySetup(args));
export const SETUP_OPERATIONS = Object.freeze({ setup: readUserSetup, 'review-setup': reviewUserSetup, 'apply-setup': applyUserSetup });

export const inspectUserEnrollment = wrap(async args => (await import('../setup/enrollment.mjs')).inspectEnrollment(args));
export const reviewUserEnrollmentCandidate = wrap(async args => (await import('../setup/enrollment.mjs')).reviewEnrollmentCandidate(args));
export const reviewUserEnrollment = wrap(async args => (await import('../setup/enrollment.mjs')).reviewEnrollment(args));
export const applyUserEnrollment = wrap(async args => (await import('../setup/enrollment.mjs')).applyEnrollment(args));
export const ENROLLMENT_OPERATIONS = Object.freeze({ 'enrollment-inventory': inspectUserEnrollment,
  'review-candidate': reviewUserEnrollmentCandidate, 'review-enrollment': reviewUserEnrollment, 'apply-enrollment': applyUserEnrollment });

const appearanceRead = method => wrap(async args => (await import('../appearances/service.mjs'))[method](args));
const appearanceMutation = method => wrap(async args => {
  const result = await (await import('../appearances/service.mjs'))[method](args);
  return { scopeId: result.scopeId, stateId: result.stateId, selectedItemId: result.state?.selectedItemId ?? null,
    collectionRevision: result.state?.revision ?? 0,
    recoveryRequired: result.recoveryRequired, pendingStateId: result.pendingStateId,
    evidenceStartId: result.state?.evidenceStartId ?? null,
    ...(result.savedItemId ? { savedItemId: result.savedItemId, reviewId: result.reviewId } : {}) };
});
export const readUserAppearance = appearanceRead('readUserAppearanceView');
export const readUserArtwork = appearanceRead('readUserArtworkView');
export const readUserArtworkItem = appearanceRead('readUserArtworkItem');
export const discoverUserAppearance = appearanceMutation('discoverUserAppearance');
export const selectUserAppearance = appearanceMutation('selectUserAppearance');
export const renameUserAppearance = appearanceMutation('renameUserAppearance');
export const setUserAppearanceEvidence = appearanceMutation('setUserAppearanceEvidence');
export const createUserOriginalAppearance = appearanceMutation('createUserOriginalAppearance');
export const adoptUserOriginalAppearance = appearanceMutation('adoptUserOriginalAppearance');
export const recoverUserAppearance = appearanceMutation('recoverUserAppearance');
export const readUserOriginalCandidates = appearanceRead('readUserOriginalCandidates');
export const readUserAppearanceItem = appearanceRead('readUserAppearanceItem');
export const reviewUserAppearanceUpload = appearanceRead('reviewUserAppearanceUpload');
export const readUserAppearanceImportReview = appearanceRead('readUserAppearanceImportReview');
export const saveUserAppearanceImport = appearanceMutation('saveUserAppearanceImport');
export const readUserAppearanceImage = appearanceRead('readUserAppearanceImage');
const authoringCall = method => wrap(async args => (await import('../appearances/authoring.mjs'))[method](args));
export const prepareUserAppearanceAuthoring = authoringCall('prepareAppearanceAuthoring');
export const readUserAppearanceAuthoring = authoringCall('readAppearanceAuthoring');
export const reviewUserAuthoredAppearance = authoringCall('reviewAuthoredAppearance');
export const evaluateUserAppearance = wrap(async args => (await import('../appearances/evidence.mjs')).evaluateUserAppearance(args));
export const APPEARANCE_OPERATIONS = Object.freeze({
  artwork: readUserArtwork, 'artwork-item': readUserArtworkItem,
  appearance: readUserAppearance, 'discover-appearance': discoverUserAppearance, 'select-appearance': selectUserAppearance,
  'name-appearance': renameUserAppearance, 'use-appearance-evidence': setUserAppearanceEvidence,
  'evaluate-appearance': evaluateUserAppearance, 'original-candidates': readUserOriginalCandidates,
  'recover-appearance': recoverUserAppearance,
  'appearance-item': readUserAppearanceItem, 'review-appearance-import': reviewUserAppearanceUpload,
  'read-appearance-import': readUserAppearanceImportReview, 'save-appearance-import': saveUserAppearanceImport,
  'prepare-appearance-authoring': prepareUserAppearanceAuthoring, 'read-appearance-authoring': readUserAppearanceAuthoring,
  'review-authored-appearance': reviewUserAuthoredAppearance,
});
