// Plugin enrollment adds a versioned read-only dependency and one permitted
// enabled selector. It never installs plugins or writes a provider package.
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace, activeNormalId, loadNormal, loadSnapshot, saveSnapshot, record, loadRecord,
  readJson, writeJson, unlink, newPreparation } from '../sources/records.mjs';
import { acquire, pending, assertCurrent, sourceTransactionHook } from '../sources/transaction.mjs';
import { freshCatalog } from '../sources/capture.mjs';
import { applicationFor } from '../apps/index.mjs';
import { equal } from '../sources/platform.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { discoverPluginCandidates, capturePluginCandidate, assertPluginDependency } from '../codex/plugin-inventory.mjs';
import { validatePluginAdditions, pluginEnrollmentRegistration, loadPluginEnrollmentReview,
  pluginEnrollmentState, pluginEnrollmentManifest, assertPluginEnrollmentCurrent, pluginEnrollmentSummary } from './plugin-enrollment-records.mjs';

const request = (args, fields) => exactKeys(args, ['workspace', ...fields], [], 'invalid-request');
function supported(w) {
  if (applicationFor(w.reg.context).id !== 'codex' || w.reg.version !== '0.153.4') fail('plugin-enrollment-unsupported');
}
async function locked(workspace, action) {
  const initial = await openWorkspace(workspace), release = await acquire(initial);
  try {
    const w = await openWorkspace(workspace);
    if (w.scopeId !== initial.scopeId) fail('stale-plan');
    if (await pending(workspace)) fail('recovery-required');
    supported(w);
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
async function dependencies(w, plugins) {
  for (const plugin of plugins) {
    const { kind, role, ...dependency } = await loadRecord(w.workspace, 'input', plugin.dependencyId);
    if (role !== 'plugin-dependency') fail('plugin-enrollment-record-invalid');
    await assertPluginDependency(w.reg.context, dependency);
  }
}
async function fresh(w, p) {
  await current(w);
  await freshCatalog(w.reg);
  await dependencies(w, p.next.reg.plugins);
  if ((await discoverPluginCandidates(w.reg.context)).discoveryId !== p.discoveryId) fail('stale-discovery');
}

export async function inspectPluginEnrollment(args) {
  request(args, []);
  const w = await openWorkspace(args.workspace);
  supported(w);
  const d = await discoverPluginCandidates(w.reg.context), plugins = w.reg.plugins ?? [];
  return { scopeId: w.scopeId, normalId: activeNormalId(w), revision: w.state.revision, discoveryId: d.discoveryId,
    registeredCount: plugins.length, limit: 32, setupRequired: true, enrollmentSchemaVersion: 3,
    candidates: d.plugins.filter(p => !plugins.some(s => s.id === p.id)), verification };
}

export async function reviewPluginEnrollment(args) {
  request(args, ['discoveryId', 'additions']);
  const additions = validatePluginAdditions(args.additions);
  return locked(args.workspace, async w => {
    if ((w.reg.plugins?.length ?? 0) + additions.length > 32) fail('plugin-enrollment-source-limit');
    await current(w);
    await idle(w);
    await freshCatalog(w.reg);
    const d = await discoverPluginCandidates(w.reg.context);
    if (d.discoveryId !== args.discoveryId || d.version !== w.reg.version) fail('stale-discovery');
    if (additions.some(a => !(d.plugins.some(p => p.id === a.pluginId && p.available))
      || w.reg.plugins?.some(p => p.id === a.pluginId))) fail('unsupported-source');
    const plugins = [];
    for (const a of additions) {
      const { candidate, dependency } = await capturePluginCandidate(w.reg.context, a.pluginId);
      const dependencyId = await record(w.workspace, 'input', { role: 'plugin-dependency', ...dependency });
      plugins.push({ ...candidate, dependencyId, role: { origin: a.origin, reason: a.reason, optional: true } });
    }
    const nextNormalId = await saveSnapshot(w.workspace, w.reg, await loadNormal(w.workspace, w.reg, activeNormalId(w)), 2);
    const nextSnapshotId = await saveSnapshot(w.workspace, w.reg, await loadSnapshot(w.workspace, w.reg, w.state.snapshotId), 2);
    await sourceTransactionHook('plugin-enrollment-review-compiled');
    await current(w);
    await freshCatalog(w.reg);
    await dependencies(w, [...(w.reg.plugins ?? []), ...plugins]);
    if ((await discoverPluginCandidates(w.reg.context)).discoveryId !== d.discoveryId) fail('stale-discovery');
    const payload = { role: 'plugin-enrollment-review', schemaVersion: 3, rootScopeId: w.rootScopeId,
      scopeId: w.scopeId, beforeState: w.state, beforeManifest: w.manifest, discoveryId: d.discoveryId,
      normalId: activeNormalId(w), nextNormalId, nextSnapshotId, additions, plugins };
    const reviewId = await record(w.workspace, 'input', payload);
    await record(w.workspace, 'scope', pluginEnrollmentRegistration(w.reg, payload, reviewId));
    return { ...pluginEnrollmentSummary(await loadPluginEnrollmentReview(w, reviewId)), verification };
  });
}
const result = (w, p, duplicate) => ({ ...pluginEnrollmentSummary(p), revision: w.state.revision,
  setupRequired: !w.state.setupId, modeChangeRequired: w.state.scopePreparationRequired === true,
  adopted: true, duplicate, verification });

export async function adoptPluginEnrollment(args) {
  request(args, ['reviewId']);
  if (process.platform !== 'darwin') fail('unsupported-platform');
  return locked(args.workspace, async w => {
    const p = await loadPluginEnrollmentReview(w, args.reviewId);
    await current(w);
    if (w.state.lastPluginEnrollmentReviewId === p.reviewId && w.scopeId === p.nextScopeId) return result(w, p, true);
    assertPluginEnrollmentCurrent(w, p);
    await idle(w);
    await fresh(w, p);
    const afterState = pluginEnrollmentState(w.state, p, newPreparation()), afterManifest = pluginEnrollmentManifest(p);
    const journal = { kind: 'unharness-user-source-plugin-enrollment-pending', schemaVersion: 3,
      scopeId: w.scopeId, reviewId: p.reviewId, beforeState: w.state, afterState, beforeManifest: w.manifest, afterManifest };
    const path = join(w.workspace, 'pending.json');
    await writeJson(path, journal, true);
    await sourceTransactionHook('plugin-enrollment-journal');
    await fresh(w, p);
    if (!equal(await readJson(path), journal)) fail('journal-invalid');
    await writeJson(join(w.workspace, 'registration.json'), afterManifest);
    await sourceTransactionHook('plugin-enrollment-manifest');
    await fresh({ ...w, manifest: afterManifest }, p);
    if (!equal(await readJson(path), journal)) fail('journal-invalid');
    await writeJson(join(w.workspace, 'state.json'), afterState);
    await sourceTransactionHook('plugin-enrollment-state');
    const published = await openWorkspace(w.workspace);
    if (!equal(published.state, afterState) || !equal(published.manifest, afterManifest)
      || !equal(await readJson(path), journal)) fail('journal-invalid');
    await current(published);
    await unlink(path);
    return result(published, p, false);
  });
}
