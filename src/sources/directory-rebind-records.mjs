// Frozen reattestation records. Reading lineage and cancelling an interrupted
// adoption must not load a native catalog, configuration editor or YAML parser.
import { exactKeys } from '../comparisons/assessment.mjs';
import { equal } from './platform.mjs';
import { hasVolumeUuid, validDirectoryIdentity } from '../platform/directory-identity.mjs';
import { loadRecord, loadSnapshot, loadNormal, validateStateSnapshots, workspaceManifestRoot,
  scopeWorkspace, activeNormalId } from './records.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail } from './errors.mjs';

const id = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const invalid = () => fail('directory-rebind-record-invalid');

function replacement(before, after) {
  if (!validDirectoryIdentity(before) || !validDirectoryIdentity(after) || !hasVolumeUuid(after)
    || before.ino !== after.ino) invalid();
  if (hasVolumeUuid(before)) {
    if (!equal(before, after)) invalid();
  } else {
    const { dev, ...rest } = before;
    if (!equal({ ...rest, volumeUuid: after.volumeUuid }, after)) invalid();
  }
}

export function reboundRegistration(reg, p, reviewId) {
  return { ...reg, role: 'registration-rebind', parentScopeId: p.scopeId,
    parentNormalId: reg.normalId, rebindReviewId: reviewId, bindings: p.bindings };
}

export async function validateDirectoryRebindReview(workspace, reg, scopeId, p) {
  try {
    exactKeys(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'rootScopeId', 'beforeState', 'beforeManifest',
      'observedId', 'bindings', 'ownedDirs', 'retainedChangePending', 'reviewedAt', 'historicalVolumeContinuity'], [], 'directory-rebind-record-invalid');
    if (p.kind !== 'unharness-user-source' || p.role !== 'directory-rebind-review' || p.schemaVersion !== 1
      || !id(p.scopeId) || p.scopeId !== scopeId || !id(p.rootScopeId) || !id(p.observedId)
      || workspaceManifestRoot(p.beforeManifest) !== p.rootScopeId
      || (p.beforeState.scopeId ?? p.rootScopeId) !== scopeId
      || p.historicalVolumeContinuity !== 'unverified' || typeof p.retainedChangePending !== 'boolean'
      || typeof p.reviewedAt !== 'string' || new Date(p.reviewedAt).toISOString() !== p.reviewedAt
      || !equal(Object.keys(p.bindings).sort(), Object.keys(reg.bindings).sort())
      || !Array.isArray(p.ownedDirs) || p.ownedDirs.length !== p.beforeState.ownedDirs.length) invalid();
    await validateStateSnapshots(workspace, reg, p.beforeState);
    let legacy = 0;
    for (const [key, before] of Object.entries(reg.bindings)) {
      replacement(before, p.bindings[key]);
      if (!hasVolumeUuid(before)) legacy++;
    }
    for (const [i, before] of p.beforeState.ownedDirs.entries()) {
      const after = p.ownedDirs[i];
      replacement(before.identity, after.identity);
      if (!equal({ ...before, identity: after.identity }, after)) invalid();
      if (!hasVolumeUuid(before.identity)) legacy++;
    }
    if (!legacy) invalid();
    const expected = await loadSnapshot(workspace, reg, p.beforeState.snapshotId);
    const observed = await loadSnapshot(workspace, reg, p.observedId, 2);
    const key = applicationFor(reg.context).retainedKey;
    for (const k of Object.keys(expected)) if (k !== key && !equal(expected[k], observed[k])) invalid();
    if (p.retainedChangePending !== !equal(expected[key], observed[key])) invalid();
    return p;
  } catch { invalid(); }
}

export async function validateReboundRegistration(workspace, rootScopeId, parentScopeId, parent, child) {
  if (!id(child.rebindReviewId)) invalid();
  const p = await loadRecord(workspace, 'input', child.rebindReviewId);
  if (p.rootScopeId !== rootScopeId) invalid();
  await validateDirectoryRebindReview(workspace, parent, parentScopeId, p);
  if (!equal(child, reboundRegistration(parent, p, child.rebindReviewId))) invalid();
  await loadNormal(workspace, child);
}

export async function loadDirectoryRebindReview(w, reviewId) {
  if (!id(reviewId)) invalid();
  const p = await loadRecord(w.workspace, 'input', reviewId);
  const before = scopeWorkspace(w, p.scopeId);
  await validateDirectoryRebindReview(w.workspace, before.reg, before.scopeId, p);
  if (p.rootScopeId !== w.rootScopeId) invalid();
  return { ...p, reviewId, before };
}

export function reboundState(before, p, nextScopeId, preparation) {
  return { ...before, scopeId: nextScopeId, revision: before.revision + 1, ownedDirs: p.ownedDirs,
    setupId: null, setupSchemaVersion: 2, lastRebindReviewId: p.reviewId,
    scopePreparationRequired: true, lastEnrollmentReviewId: null,
    lastPlanId: null, lastRetainedPlanId: null, lastObservationId: null, preparation };
}

export function assertRebindState(w, p) {
  if (w.scopeId !== p.scopeId || !equal(w.state, p.beforeState) || !equal(w.manifest, p.beforeManifest))
    fail('stale-plan');
}

export const directoryRebindSummary = p => ({ reviewId: p.reviewId, scopeId: p.scopeId,
  revision: p.beforeState.revision, normalId: activeNormalId({ state: p.beforeState, reg: p.before.reg }),
  sourceFilesChanged: 0, retainedChangePending: p.retainedChangePending,
  historicalVolumeContinuity: p.historicalVolumeContinuity,
  directories: Object.entries(p.bindings).map(([sourceKey, current]) => ({ sourceKey, path: current.path,
    previous: p.before.reg.bindings[sourceKey], current })),
  ownedDirectories: p.ownedDirs.map((current, i) => ({ path: current.path,
    previous: p.beforeState.ownedDirs[i].identity, current: current.identity })) });
