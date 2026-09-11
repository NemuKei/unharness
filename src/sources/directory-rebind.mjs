// Explicit local maintenance: reattest current locations, never source content.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { captureDirectoryIdentity, hasVolumeUuid, matchesDirectoryIdentity } from '../platform/directory-identity.mjs';
import { openWorkspace, loadSnapshot, loadNormal, activeNormalId, saveSnapshot, record, readJson,
  writeJson, unlink, newPreparation } from './records.mjs';
import { captureRegistered, freshCatalog } from './capture.mjs';
import { canonical, equal, assertWritableOwnership } from './platform.mjs';
import { acquire, pending, assertCurrent, sourceTransactionHook } from './transaction.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail, verification } from './errors.mjs';
import { reboundRegistration, reboundState, reboundManifest, assertRebindState, loadDirectoryRebindReview,
  directoryRebindSummary } from './directory-rebind-records.mjs';

const request = (args, fields) => exactKeys(args, ['workspace', ...fields], [], 'invalid-request');
async function locked(workspace, work) {
  if (process.platform !== 'darwin') fail('unsupported-platform');
  const initial = await openWorkspace(workspace), release = await acquire(initial);
  try {
    const w = await openWorkspace(workspace);
    if (w.scopeId !== initial.scopeId) fail('stale-plan');
    if (applicationFor(w.reg.context).id !== 'codex') fail('directory-rebind-unavailable');
    if (await pending(workspace)) fail('recovery-required');
    return await work(w);
  } finally { await release(); }
}
async function idle(w) {
  const { loadReplayIndex } = await import('../experiments/replay-index.mjs');
  if ((await loadReplayIndex(w)).data.activeAttemptId !== null) fail('replay-active-attempt');
  const { readAppearanceStore } = await import('../appearances/store.mjs');
  if ((await readAppearanceStore({ ...w, scopeId: w.rootScopeId })).journal !== null) fail('appearance-recovery-required');
}

async function currentLocations(w) {
  const identities = new Map();
  async function current(path, previous) {
    await canonical(path);
    let value = identities.get(path);
    if (!value) {
      const stat = await lstat(path);
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail('source-redirection');
      value = await captureDirectoryIdentity(path, stat);
      identities.set(path, value);
    }
    if (!hasVolumeUuid(value) || value.ino !== previous.ino
      || hasVolumeUuid(previous) && !matchesDirectoryIdentity(value, previous)) fail('source-redirection');
    return value;
  }
  let legacy = 0;
  const bindings = {};
  for (const [key, before] of Object.entries(w.reg.bindings)) {
    const value = await current(before.path, before);
    if (!hasVolumeUuid(before)) legacy++;
    const { dev, ...rest } = before;
    bindings[key] = { ...rest, ...value };
  }
  const ownedDirs = [];
  for (const before of w.state.ownedDirs) {
    const value = await current(before.path, before.identity);
    if (!hasVolumeUuid(before.identity)) legacy++;
    ownedDirs.push({ ...before, identity: value });
  }
  if (!legacy) fail('directory-rebind-unavailable');
  const next = { ...w, reg: { ...w.reg, bindings }, state: { ...w.state, ownedDirs } };
  const files = await captureRegistered(next.reg);
  // In particular, a formerly missing parent must be in the old ownedDirs.
  await assertCurrent(next, files);
  return { bindings, ownedDirs, files, next };
}

async function unchanged(w, candidate) {
  const reopened = await openWorkspace(w.workspace);
  if (reopened.scopeId !== w.scopeId || !equal(reopened.reg, w.reg) || !equal(reopened.state, w.state)
    || !equal(reopened.manifest, w.manifest)) fail('stale-plan');
  await assertCurrent(candidate.next, candidate.files);
}

export async function reviewDirectoryRebind(args) {
  request(args, []);
  return locked(args.workspace, async w => {
    await idle(w);
    const c = await currentLocations(w);
    const expected = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
    const app = applicationFor(w.reg.context), key = app.retainedKey;
    for (const k of Object.keys(expected)) if (k !== key && !equal(expected[k], c.files[k])) fail('source-conflict');
    const retainedChangePending = !equal(expected[key], c.files[key]);
    if (retainedChangePending) {
      assertWritableOwnership(c.files[key]);
      const normal = await loadNormal(w.workspace, w.reg, activeNormalId(w));
      const result = await app.mergeRetained({ reg: w.reg, baseText: expected[key]?.text ?? '',
        targetText: normal[key]?.text ?? '', currentText: c.files[key]?.text ?? '' });
      if (result.version !== w.reg.version) fail('stale-discovery');
    }
    await freshCatalog(w.reg);
    await unchanged(w, c);
    const observedId = await saveSnapshot(w.workspace, w.reg, c.files, 2);
    const reviewId = await record(w.workspace, 'input', { role: 'directory-rebind-review', schemaVersion: 1,
      scopeId: w.scopeId, rootScopeId: w.rootScopeId, beforeState: w.state, beforeManifest: w.manifest,
      observedId, bindings: c.bindings, ownedDirs: c.ownedDirs, retainedChangePending,
      reviewedAt: new Date().toISOString(), historicalVolumeContinuity: 'unverified' });
    await unchanged(w, c);
    return { ...directoryRebindSummary(await loadDirectoryRebindReview(w, reviewId)), verification };
  });
}

export async function applyDirectoryRebind(args) {
  request(args, ['reviewId', 'confirmedCurrentLocations']);
  if (args.confirmedCurrentLocations !== true) fail('directory-rebind-confirmation-required');
  return locked(args.workspace, async w => {
    const p = await loadDirectoryRebindReview(w, args.reviewId);
    const reg = reboundRegistration(p.before.reg, p, p.reviewId);
    const nextScopeId = await record(w.workspace, 'scope', reg);
    const afterManifest = reboundManifest(p);
    const files = await loadSnapshot(w.workspace, reg, p.observedId, 2);
    const result = duplicate => ({ ...directoryRebindSummary(p), scopeId: nextScopeId,
      previousScopeId: p.scopeId, revision: p.beforeState.revision + 1,
      adopted: true, duplicate, modeChangeRequired: true, verification });
    if (w.state.lastRebindReviewId === p.reviewId && w.scopeId === nextScopeId) {
      if (!equal(w.state, reboundState(p.beforeState, p, nextScopeId, w.state.preparation))
        || !equal(w.manifest, afterManifest)) fail('stale-plan');
      await assertCurrent(w, files);
      return result(true);
    }
    assertRebindState(w, p);
    await idle(w);
    const afterState = reboundState(w.state, p, nextScopeId, newPreparation());
    const c = { files, next: { ...w, reg, scopeId: nextScopeId, state: afterState } };
    await unchanged(w, c);
    const journal = { kind: 'unharness-user-source-directory-rebind-pending', reviewId: p.reviewId,
      scopeId: w.scopeId, nextScopeId, beforeState: w.state, afterState,
      beforeManifest: w.manifest, afterManifest };
    const journalPath = join(w.workspace, 'pending.json');
    await writeJson(journalPath, journal, true);
    await sourceTransactionHook('directory-rebind-journal');
    await unchanged(w, c);
    if (!equal(await readJson(journalPath), journal)) fail('journal-invalid');
    await writeJson(join(w.workspace, 'registration.json'), afterManifest);
    await sourceTransactionHook('directory-rebind-manifest');
    await assertCurrent(c.next, files);
    if (!equal(await readJson(join(w.workspace, 'state.json')), w.state)
      || !equal(await readJson(join(w.workspace, 'registration.json')), afterManifest)
      || !equal(await readJson(journalPath), journal)) fail('journal-invalid');
    await writeJson(join(w.workspace, 'state.json'), afterState);
    await sourceTransactionHook('directory-rebind-state');
    const published = await openWorkspace(w.workspace);
    if (!equal(published.reg, reg) || !equal(published.state, afterState) || !equal(published.manifest, afterManifest)
      || !equal(await readJson(journalPath), journal)) fail('journal-invalid');
    await assertCurrent(published, files);
    await unlink(journalPath);
    return result(false);
  });
}
