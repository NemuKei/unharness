import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace, activeNormalId, loadNormal, loadSnapshot, saveSnapshot, record, writeJson, unlink } from '../sources/records.mjs';
import { acquire, pending, assertCurrent, sourceTransactionHook } from '../sources/transaction.mjs';
import { freshCatalog, targetFile } from '../sources/capture.mjs';
import { equal, assertPlanOwnershipChanges } from '../sources/platform.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { assertControlChanges } from './control-sources.mjs';
import { validatePresetProposal, compileReleasePreset } from './preset.mjs';
import { setupScope, loadSetupReview, loadSetup, setupReviewSummary, assertReviewCurrent, adoptedState } from './records.mjs';

const request = (args, fields) => exactKeys(args, ['workspace', ...fields], [], 'invalid-request');
async function locked(workspace, action) {
  const initial = await openWorkspace(workspace), release = await acquire(initial);
  try {
    const w = await openWorkspace(workspace);
    if (w.scopeId !== initial.scopeId) fail('workspace-invalid');
    if (await pending(workspace)) fail('recovery-required');
    return await action(w);
  } finally { await release(); }
}
async function assertUnchanged(w) {
  const current = await openWorkspace(w.workspace);
  if (current.scopeId !== w.scopeId || !equal(current.reg, w.reg) || !equal(current.state, w.state)) fail('stale-plan');
  await assertCurrent(w, await loadSnapshot(w.workspace, w.reg, w.state.snapshotId));
}

export async function reviewSetup(args) {
  request(args, ['proposal']);
  return locked(args.workspace, async w => {
    // Claude retains its qualified earlier contract until its implementation
    // owner qualifies this separate preset API. Never ignore new options.
    const app = applicationFor(w.reg.context);
    if (!app.supportsReleasePresets) fail('setup-application-unsupported');
    const scope = setupScope(w), proposal = validatePresetProposal(args.proposal, scope);
    if (proposal.basis.runtimeVersion !== null && proposal.basis.runtimeVersion !== w.reg.version) fail('stale-discovery');
    const options = Object.fromEntries(['unseal', 'trueform'].map(mode => [mode, compileReleasePreset(proposal, mode, scope)]));
    await assertUnchanged(w);
    await freshCatalog(w.reg);
    const normal = await loadNormal(w.workspace, w.reg, activeNormalId(w)), presets = {};
    for (const mode of ['unseal', 'trueform']) {
      const result = await app.compile({ reg: w.reg, mode, normal, selection: options[mode].selection,
        releasePreset: options[mode], targetFile: (key, text) => targetFile(w.reg, key, text, normal) });
      assertControlChanges({ sources: w.reg.skills, before: normal, after: result.after });
      assertPlanOwnershipChanges(normal, result.after);
      presets[mode] = { ...options[mode], guide: result.guide, skillStates: result.skillStates,
        snapshotId: await saveSnapshot(w.workspace, w.reg, result.after, w.state.snapshotVersion ?? 1) };
    }
    await sourceTransactionHook('setup-review-compiled');
    await freshCatalog(w.reg);
    await assertUnchanged(w);
    const reviewId = await record(w.workspace, 'input', { role: 'setup-review', schemaVersion: 1,
      scopeId: w.scopeId, normalId: activeNormalId(w), revision: w.state.revision, beforeId: w.state.snapshotId,
      previousSetupId: w.state.setupId ?? null, proposal, presets });
    return { ...setupReviewSummary(await loadSetupReview(w, reviewId)), verification };
  });
}

export async function applySetup(args) {
  request(args, ['reviewId']);
  return locked(args.workspace, async w => {
    const p = await loadSetupReview(w, args.reviewId), existing = await loadSetup(w);
    await assertUnchanged(w);
    if (existing?.review.reviewId === p.reviewId) return result(w, existing.setupId, p, true);
    assertReviewCurrent(w, p);
    if (!applicationFor(w.reg.context).supportsReleasePresets) fail('setup-application-unsupported');
    for (const mode of ['unseal', 'trueform']) {
      compileReleasePreset(p.proposal, mode, setupScope(w));
      assertControlChanges({ sources: w.reg.skills,
        before: await loadNormal(w.workspace, w.reg, p.normalId),
        after: await loadSnapshot(w.workspace, w.reg, p.presets[mode].snapshotId) });
    }
    await freshCatalog(w.reg);
    const setupId = await record(w.workspace, 'application', { role: 'release-setup', schemaVersion: 1,
      scopeId: w.scopeId, reviewId: p.reviewId });
    const afterState = adoptedState(w.state, setupId);
    const journal = { kind: 'unharness-user-source-setup-pending', scopeId: w.scopeId,
      setupId, beforeState: w.state, afterState };
    await writeJson(join(w.workspace, 'pending.json'), journal, true);
    await sourceTransactionHook('setup-journal');
    await assertUnchanged(w);
    await writeJson(join(w.workspace, 'state.json'), afterState);
    await sourceTransactionHook('setup-state');
    await unlink(join(w.workspace, 'pending.json'));
    return result({ ...w, state: afterState }, setupId, p, false);
  });
}
const result = (w, setupId, p, duplicate) => ({ setupId, reviewId: p.reviewId, normalId: activeNormalId(w),
  revision: w.state.revision, preparedMode: w.state.preparedMode, preparedSetupId: w.state.preparedSetupId ?? null,
  adopted: true, duplicate, sourceFilesChanged: 0, modeChangeRequired: true, verification });

export async function readSetup(args) {
  request(args, []);
  const w = await openWorkspace(args.workspace), saved = await loadSetup(w);
  return { scopeId: w.scopeId, normalId: activeNormalId(w), setupId: saved?.setupId ?? null,
    preparedSetupId: w.state.preparedSetupId ?? null,
    review: saved ? setupReviewSummary(saved.review) : null,
    proposal: saved?.review.proposal ?? null, verification };
}

// The caller is already planning a mode within the registered workspace. This
// returns the approved frozen configuration; an old favorite never uses it.
export async function savedPresetForMode(w, mode) {
  const saved = await loadSetup(w);
  if (!saved || !['unseal', 'trueform'].includes(mode)) return null;
  const p = saved.review;
  compileReleasePreset(p.proposal, mode, setupScope(w, p.normalId));
  const { adaptRetainedSnapshot } = await import('../sources/retained-settings.mjs');
  const preset = p.presets[mode];
  const { after, adaptation } = await adaptRetainedSnapshot(w, { normalId: p.normalId, snapshotId: preset.snapshotId }, saved.setupId, 'setup');
  return { after, adaptation, guide: preset.guide, skillStates: preset.skillStates,
    selectedIds: preset.selection, setupId: saved.setupId };
}
