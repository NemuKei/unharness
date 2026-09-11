import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace, activeNormalId, loadNormal, loadSnapshot, saveSnapshot, record, registeredSkill,
  loadScopeLineage, readJson, writeJson, unlink, newPreparation } from '../sources/records.mjs';
import { discoveryCapture, discoverySummary, freshCatalog, assertRegistrationOwnership } from '../sources/capture.mjs';
import { acquire, pending, assertCurrent, sourceTransactionHook } from '../sources/transaction.mjs';
import { equal } from '../sources/platform.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { loadSetup } from './records.mjs';
import { freezePresets } from './service.mjs';
import { validateAdditions, expandedProposal, enrollmentState, assertEnrollmentCurrent,
  loadEnrollmentReview, enrollmentSummary } from './enrollment-records.mjs';

const request = (args, fields) => exactKeys(args, ['workspace', ...fields], [], 'invalid-request');
async function locked(workspace, action) {
  const initial = await openWorkspace(workspace), release = await acquire(initial);
  try {
    const w = await openWorkspace(workspace);
    if (w.scopeId !== initial.scopeId) fail('stale-plan');
    if (await pending(workspace)) fail('recovery-required');
    return await action(w);
  } finally { await release(); }
}
async function current(w) {
  const reopened = await openWorkspace(w.workspace);
  if (reopened.scopeId !== w.scopeId || !equal(reopened.reg, w.reg) || !equal(reopened.state, w.state)
      || !equal(reopened.manifest, w.manifest)) fail('stale-plan');
  await assertCurrent(w, await loadSnapshot(w.workspace, w.reg, w.state.snapshotId));
}
async function idle(w) {
  const { loadReplayIndex } = await import('../experiments/replay-index.mjs');
  if ((await loadReplayIndex(w)).data.activeAttemptId !== null) fail('replay-active-attempt');
  const { readAppearanceStore } = await import('../appearances/store.mjs');
  if ((await readAppearanceStore({ ...w, scopeId: w.rootScopeId })).journal !== null) fail('appearance-recovery-required');
}

export async function inspectEnrollment(args) {
  request(args, []);
  const w = await openWorkspace(args.workspace), d = await discoveryCapture(w.reg.context);
  const summary = discoverySummary(d);
  return { scopeId: w.scopeId, normalId: activeNormalId(w), revision: w.state.revision, discoveryId: d.discoveryId,
    registeredCount: w.reg.skills.length, limit: 32, setupRequired: !w.state.setupId,
    enrollmentSchemaVersion: w.manifestVersion === 2 ? 2 : 1,
    candidates: summary.skills.filter(s => !w.reg.skills.some(r => r.path === s.path)),
    unavailableSources: summary.unavailableSources, notices: summary.notices, retained: summary.retained, verification };
}
export async function reviewEnrollmentCandidate(args) {
  request(args, ['discoveryId', 'sourceId']);
  const w = await openWorkspace(args.workspace), d = await discoveryCapture(w.reg.context);
  if (args.discoveryId !== d.discoveryId) fail('stale-discovery');
  const s = d.skills.find(s => s.id === args.sourceId && s.eligible && !w.reg.skills.some(r => r.path === s.path));
  if (!s) fail('unsupported-source');
  return { sourceId: s.id, text: s.body.text, contentRole: 'data' };
}
export async function reviewEnrollment(args) {
  request(args, ['discoveryId', 'additions']);
  return locked(args.workspace, async w => {
    const saved = await loadSetup(w);
    if (!saved) fail('setup-required');
    const schemaVersion = saved.review.schemaVersion;
    if (w.manifestVersion === 2 && schemaVersion !== 2) fail('setup-upgrade-required');
    const additions = validateAdditions(args.additions, schemaVersion);
    if (w.reg.skills.length + additions.length > 32) fail('enrollment-source-limit');
    const app = applicationFor(w.reg.context);
    if (!app.supportsReleasePresets) fail('setup-application-unsupported');
    await current(w);
    await idle(w);
    await freshCatalog(w.reg);
    const d = await discoveryCapture(w.reg.context);
    if (d.discoveryId !== args.discoveryId || d.version !== w.reg.version) fail('stale-discovery');
    const selected = additions.map(a => d.skills.find(s => s.id === a.sourceId));
    if (d.unavailableSources.length || selected.some(s => !s?.eligible || w.reg.skills.some(r => r.path === s.path))) fail('unsupported-source');
    assertRegistrationOwnership(d, additions.map(a => a.sourceId), false);
    const { rebindReviewId: previousRebindReviewId, ...previousRegistration } = w.reg;
    const reg = { ...previousRegistration, role: 'registration', parentScopeId: w.scopeId, parentNormalId: activeNormalId(w),
      skills: [...w.reg.skills, ...selected.map(s => registeredSkill(app, s))], bindings: { ...w.reg.bindings }, normalId: null };
    const normal = await loadNormal(w.workspace, w.reg, activeNormalId(w));
    const before = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
    for (const s of selected) for (const [key, { file, binding }] of Object.entries(app.skillFiles(s))) {
      normal[key] = file; before[key] = file; reg.bindings[key] = binding;
    }
    reg.normalId = await saveSnapshot(w.workspace, reg, normal, 2);
    const nextScopeId = await record(w.workspace, 'scope', reg);
    const nextSnapshotId = await saveSnapshot(w.workspace, reg, before, 2);
    const next = { ...w, scopeId: nextScopeId, reg, registrations: await loadScopeLineage(w.workspace, w.rootScopeId, nextScopeId),
      state: { ...w.state, scopeId: nextScopeId, normalId: reg.normalId, snapshotId: nextSnapshotId, snapshotVersion: 2, revision: w.state.revision + 1 } };
    let setupReviewId = null, setupId = null;
    if (schemaVersion === 1) {
      const proposal = expandedProposal(saved.review.proposal, additions, nextScopeId, reg.normalId);
      const presets = await freezePresets(next, proposal);
      setupReviewId = await record(w.workspace, 'input', { role: 'setup-review', schemaVersion: 1,
        scopeId: nextScopeId, normalId: reg.normalId, revision: next.state.revision, beforeId: nextSnapshotId,
        previousSetupId: saved.setupId, proposal, presets });
      setupId = await record(w.workspace, 'application', { role: 'release-setup', schemaVersion: 1, scopeId: nextScopeId, reviewId: setupReviewId });
    }
    await sourceTransactionHook('enrollment-review-compiled');
    await current(w);
    if ((await discoveryCapture(w.reg.context)).discoveryId !== d.discoveryId) fail('stale-discovery');
    const reviewId = await record(w.workspace, 'input', { role: 'enrollment-review', schemaVersion, scopeId: w.scopeId,
      revision: w.state.revision, normalId: activeNormalId(w), beforeId: w.state.snapshotId, previousSetupId: saved.setupId,
      discoveryId: d.discoveryId, additions, nextScopeId, nextNormalId: reg.normalId, nextSnapshotId, setupReviewId, setupId });
    return { ...enrollmentSummary(await loadEnrollmentReview(w, reviewId)), verification };
  });
}
const result = (w, p, duplicate) => ({ ...enrollmentSummary(p), revision: w.state.revision,
  setupRequired: !w.state.setupId,
  modeChangeRequired: w.state.scopePreparationRequired === true, adopted: true, duplicate, verification });
export async function applyEnrollment(args) {
  request(args, ['reviewId']);
  if (process.platform !== 'darwin') fail('unsupported-platform');
  return locked(args.workspace, async w => {
    const p = await loadEnrollmentReview(w, args.reviewId);
    if (w.manifestVersion === 2 && p.schemaVersion !== 2) fail('setup-upgrade-required');
    await current(w);
    if (w.state.lastEnrollmentReviewId === p.reviewId && w.scopeId === p.nextScopeId) return result(w, p, true);
    assertEnrollmentCurrent(w, p);
    await idle(w);
    if ((await discoveryCapture(w.reg.context)).discoveryId !== p.discoveryId) fail('stale-discovery');
    await freshCatalog(p.next.reg);
    await assertCurrent({ ...p.next, state: w.state }, await loadSnapshot(w.workspace, p.next.reg, p.nextSnapshotId));
    // Legacy enrollment included mode choices. V2 requires a separate setup
    // review against the new inventory, so this operation compiles no preset.
    if (p.schemaVersion === 1) {
      const { compileReleasePreset } = await import('./preset.mjs');
      const { setupScope, loadSetupReview } = await import('./records.mjs');
      const { assertControlChanges } = await import('./control-sources.mjs');
      const setupReview = await loadSetupReview(p.next, p.setupReviewId);
      for (const mode of ['unseal', 'trueform']) {
        compileReleasePreset(setupReview.proposal, mode, setupScope(p.next, p.nextNormalId));
        assertControlChanges({ sources: p.next.reg.skills, before: await loadNormal(w.workspace, p.next.reg),
          after: await loadSnapshot(w.workspace, p.next.reg, setupReview.presets[mode].snapshotId) });
      }
    }
    const afterState = enrollmentState(w.state, p, newPreparation());
    const journal = { kind: 'unharness-user-source-enrollment-pending',
      scopeId: w.scopeId, reviewId: p.reviewId, beforeState: w.state, afterState };
    await writeJson(join(w.workspace, 'pending.json'), journal, true);
    await sourceTransactionHook('enrollment-journal');
    await current(w);
    await assertCurrent({ ...p.next, state: w.state }, await loadSnapshot(w.workspace, p.next.reg, p.nextSnapshotId));
    if ((await discoveryCapture(w.reg.context)).discoveryId !== p.discoveryId) fail('stale-discovery');
    if (!equal(await readJson(join(w.workspace, 'pending.json')), journal)) fail('journal-invalid');
    await writeJson(join(w.workspace, 'state.json'), afterState);
    await sourceTransactionHook('enrollment-state');
    const published = await openWorkspace(w.workspace);
    if (!equal(published.state, afterState) || !equal(published.manifest, w.manifest)
        || !equal(await readJson(join(w.workspace, 'pending.json')), journal)) fail('journal-invalid');
    await unlink(join(w.workspace, 'pending.json'));
    return result({ ...w, state: afterState }, p, false);
  });
}
