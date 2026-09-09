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
      normalId: w.reg.normalId,
      activeNormalId: activeNormalId(w),
      sources: targets(w.reg)
    },
    preparedMode: w.state.preparedMode,
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
    adaptation = null
  }
) {
  if (await pending(w.workspace)) fail('recovery-required');
  if (['unseal', 'trueform'].includes(mode)) await freshCatalog(w.reg);
  const before = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
  await assertCurrent(w, before);
  assertPlanOwnershipChanges(before, after);
  const afterId = await saveSnapshot(w.workspace, w.reg, after, w.state.snapshotVersion ?? 1);
  const plan = {
    role: 'plan',
    normalId: activeNormalId(w),
    snapshotVersion: w.state.snapshotVersion ?? 1,
    adaptation,
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

    const files = await loadSnapshot(workspace, w.reg, w.state.snapshotId);
    await assertCurrent(w, files);
    const favoriteId = await record(workspace, 'favorite', {
      role: 'favorite',
      normalId: activeNormalId(w),
      scopeId: w.scopeId,
      name,
      snapshotId: w.state.snapshotId,
      preparedMode: w.state.preparedMode,
      revision: w.state.revision
    });
    return {
      favoriteId,
      name,
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
      p.role !== 'favorite' ||
      p.scopeId !== w.scopeId
    )
      fail('record-invalid');
    await loadSnapshot(workspace, w.reg, p.snapshotId);
    await loadNormal(workspace, w.reg, p.normalId ?? w.reg.normalId);
    if (p.comparisonRunId !== undefined && (typeof p.comparisonRunId !== 'string' || !/^[0-9a-f]{64}$/.test(p.comparisonRunId))) fail('record-invalid');
    favorites.push({
      favoriteId: id,
      ...(p.comparisonRunId === undefined ? {} : { comparisonRunId: p.comparisonRunId }),
      normalId: p.normalId ?? w.reg.normalId,
      needsAdaptation: (p.normalId ?? w.reg.normalId) !== activeNormalId(w),
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
  if (r.role !== type || r.scopeId !== w.scopeId) fail('record-invalid');
  const { adaptRetainedSnapshot } = await import('./retained-settings.mjs');
  const { after, adaptation } = await adaptRetainedSnapshot(w, r, id, type);
  return buildPlan(w, {
    mode: type,
    adaptation,
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
