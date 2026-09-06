import { isDeepStrictEqual } from 'node:util';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { listRecordPage, putRecord, readRecord, recordId } from '../core/local-store.mjs';
import { assertScopeMatches, captureFixture, expectedFixtureMarkers, restoreFixture,
  loadoutFromSnapshot, scopeFromSnapshot, validateLoadout, validateScope, validateSnapshot } from '../codex/fixture-loadout.mjs';
import { collectDesktopRecord } from '../codex/desktop-record.mjs';

const HASH = /^[a-f0-9]{64}$/;
const fail = kind => { throw Object.assign(new Error(kind), { kind }); };
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
function id(value) { if (typeof value !== 'string' || !HASH.test(value)) fail('loadout-invalid-reference'); return value; }
function validName(value) { return value === null || (typeof value === 'string' && value.length <= 120 && !/[\u0000-\u001f]/.test(value)); }

function favoritePayload(value) {
  if (!exactKeys(value, ['schemaVersion', 'familyId', 'scopeId', 'name', 'snapshot']) || value.schemaVersion !== 1
    || !validName(value.name)) fail('loadout-invalid-favorite');
  id(value.familyId); id(value.scopeId); validateLoadout(value.snapshot);
  return value;
}
function checkpointPayload(value) {
  if (!exactKeys(value, ['schemaVersion', 'scopeId', 'snapshot']) || value.schemaVersion !== 1) fail('loadout-invalid-checkpoint');
  id(value.scopeId); validateSnapshot(value.snapshot);
  return value;
}
function applicationPayload(value) {
  if (!exactKeys(value, ['schemaVersion', 'scopeId', 'target', 'checkpointId', 'snapshot', 'taskBoundary']) || value.schemaVersion !== 1
    || !exactKeys(value.target, ['type', 'id']) || !['favorite', 'checkpoint'].includes(value.target.type)
    || typeof value.taskBoundary !== 'string' || !Number.isFinite(Date.parse(value.taskBoundary))) fail('loadout-invalid-application');
  id(value.scopeId); id(value.target.id); id(value.checkpointId); validateSnapshot(value.snapshot);
  return value;
}

function favoriteSummary(favoriteId, payload) {
  return { favoriteId, familyId: payload.familyId, scopeId: payload.scopeId, name: payload.name,
    case: payload.snapshot.configuration.case, configurationDigest: payload.snapshot.configurationDigest,
    sourceCount: payload.snapshot.configuration.files.length, savedState: 'prepared-settings',
    availability: 'not-checked', runtimeStateVerified: false, modeSwitchingVerified: false };
}

async function registeredScope(store, scopeId) {
  return validateScope(await readRecord({ store, type: 'scope', id: id(scopeId) }));
}
async function targetRecord(store, type, targetId) {
  if (!['favorite', 'checkpoint'].includes(type)) fail('loadout-invalid-reference');
  const value = await readRecord({ store, type, id: id(targetId) });
  return type === 'favorite' ? favoritePayload(value) : checkpointPayload(value);
}

export async function registerFixture({ store, fixture }) {
  const snapshot = await captureFixture(fixture);
  // Keeping storage below a managed fixture would create an independent tree
  // edit and could make subsequent recovery unusable.
  const fromFixture = relative(snapshot.binding.root, resolve(store));
  if (fromFixture === '' || (!isAbsolute(fromFixture) && fromFixture !== '..' && !fromFixture.startsWith(`..${sep}`))) fail('loadout-store-inside-fixture');
  const payload = scopeFromSnapshot(snapshot);
  const { id: scopeId } = await putRecord({ store, type: 'scope', payload });
  return { schemaVersion: 1, scopeId, adapter: payload.adapter,
    sources: payload.sources.map(({ id, kind, role }) => ({ id, kind, role })),
    controlScope: 'owned-fixture-only', completeSourceCoverage: false };
}

export async function saveFavorite({ store, scopeId, familyId, name = null }) {
  if (!validName(name)) fail('loadout-invalid-name');
  const scope = await registeredScope(store, scopeId);
  const snapshot = await captureFixture(scope.binding.root);
  assertScopeMatches(scope, snapshot);
  const defaultFamily = recordId('favorite', { familySeed: { scopeId, name } });
  const selectedFamily = familyId === undefined ? defaultFamily : id(familyId);
  if (familyId !== undefined) {
    let found = false, after;
    do {
      const page = await listRecordPage({ store, type: 'favorite', after });
      for (const record of page.records) {
        const payload = favoritePayload(record.payload);
        if (payload.familyId !== selectedFamily) continue;
        found = true;
        if (payload.scopeId !== scopeId) fail('loadout-incompatible-scope');
      }
      after = page.nextCursor;
    } while (after !== null);
    if (!found && selectedFamily !== defaultFamily) fail('loadout-family-not-found');
  }
  const payload = { schemaVersion: 1, familyId: selectedFamily, scopeId, name, snapshot: loadoutFromSnapshot(snapshot) };
  const { id: favoriteId, created } = await putRecord({ store, type: 'favorite', payload });
  return { ...favoriteSummary(favoriteId, payload), created };
}

export async function listFavorites({ store, scopeId, after }) {
  if (scopeId !== undefined) id(scopeId);
  const { records, nextCursor } = await listRecordPage({ store, type: 'favorite', after });
  return { schemaVersion: 1, favorites: records.map(record => {
    const payload = favoritePayload(record.payload);
    return favoriteSummary(record.id, payload);
  }).filter(favorite => scopeId === undefined || favorite.scopeId === scopeId), nextCursor };
}

export async function listCheckpoints({ store, after }) {
  const { records, nextCursor } = await listRecordPage({ store, type: 'checkpoint', after });
  return { schemaVersion: 1, checkpoints: records.map(record => {
    const value = checkpointPayload(record.payload);
    return { checkpointId: record.id, scopeId: value.scopeId, case: value.snapshot.configuration.case,
      configurationDigest: value.snapshot.configurationDigest, capturedPreparation: value.snapshot.preparation.revision };
  }), nextCursor };
}

async function buildPlan({ store, type, targetId }) {
  const target = await targetRecord(store, type, targetId);
  const scope = await registeredScope(store, target.scopeId);
  assertScopeMatches(scope, target.snapshot);
  const current = await captureFixture(scope.binding.root);
  assertScopeMatches(scope, current);
  const targetRef = { type, id: targetId };
  const planId = recordId('application', { scopeId: target.scopeId, target: targetRef,
    expectedStateDigest: current.preparation.stateDigest });
  const changedSources = target.snapshot.configuration.files.filter((file, index) =>
    file.content !== current.configuration.files[index].content).map(file => file.id);
  return { scope, target, current, targetRef, summary: { schemaVersion: 1, planId,
    scopeId: target.scopeId, target: targetRef, case: target.snapshot.configuration.case, changedSources,
    controlScope: 'owned-fixture-only', exactPayloadPreflight: 'required-at-restore',
    runtimeStateVerified: false, modeSwitchingVerified: false, nextTask: 'required' } };
}

export async function planRestore({ store, favoriteId }) {
  return (await buildPlan({ store, type: 'favorite', targetId: favoriteId })).summary;
}

async function applyTarget({ store, type, targetId, expectedPlanId }) {
  const plan = await buildPlan({ store, type, targetId });
  if (expectedPlanId !== undefined && id(expectedPlanId) !== plan.summary.planId) fail('loadout-stale-plan');
  const { id: checkpointId } = await putRecord({ store, type: 'checkpoint', payload: {
    schemaVersion: 1, scopeId: plan.target.scopeId, snapshot: plan.current,
  } });
  try {
    const result = await restoreFixture({ scope: plan.scope, target: plan.target.snapshot, expected: plan.current });
    const payload = { schemaVersion: 1, scopeId: plan.target.scopeId, target: plan.targetRef,
      checkpointId, snapshot: result.snapshot, taskBoundary: new Date().toISOString() };
    const { id: applicationId } = await putRecord({ store, type: 'application', payload });
    return { schemaVersion: 1, applicationId, checkpointId, scopeId: plan.target.scopeId,
      favoriteId: type === 'favorite' ? targetId : null, target: plan.targetRef,
      case: result.snapshot.configuration.case, configurationReadback: 'matched', nextTask: 'required',
      taskBoundary: payload.taskBoundary,
      fixturePreparation: { revision: result.snapshot.preparation.revision, preparedAt: result.snapshot.preparation.preparedAt },
      runtimeStateVerified: false, modeSwitchingVerified: false };
  } catch (error) {
    // The immutable pre-change checkpoint remains usable even if fixture
    // mutation or application-receipt publication was interrupted.
    error.checkpointId = checkpointId;
    throw error;
  }
}

export async function restoreFavorite({ store, favoriteId, expectedPlanId }) {
  return applyTarget({ store, type: 'favorite', targetId: favoriteId, expectedPlanId });
}
export async function restoreCheckpoint({ store, checkpointId }) {
  return applyTarget({ store, type: 'checkpoint', targetId: checkpointId });
}

export async function observeApplication({ store, applicationId, session, expectedSessionId }) {
  const application = applicationPayload(await readRecord({ store, type: 'application', id: id(applicationId) }));
  const target = await targetRecord(store, application.target.type, application.target.id);
  const scope = await registeredScope(store, application.scopeId);
  const checkpoint = checkpointPayload(await readRecord({ store, type: 'checkpoint', id: application.checkpointId }));
  if (checkpoint.scopeId !== application.scopeId) fail('loadout-invalid-application');
  assertScopeMatches(scope, checkpoint.snapshot);
  assertScopeMatches(scope, application.snapshot);
  assertScopeMatches(scope, target.snapshot);
  if (target.scopeId !== application.scopeId || !isDeepStrictEqual(target.snapshot.configuration, application.snapshot.configuration)) fail('loadout-invalid-application');
  const before = await captureFixture(scope.binding.root);
  assertScopeMatches(scope, before);
  if (!isDeepStrictEqual(before, application.snapshot)) fail('loadout-stale-application');
  const report = await collectDesktopRecord({ session, fixture: scope.binding.root, expectedSessionId, notBefore: application.taskBoundary });
  const after = await captureFixture(scope.binding.root);
  if (!isDeepStrictEqual(after, before)) fail('loadout-stale-application');
  const qualified = report.provenance.freshFixtureTaskCandidate;
  const fixtureMarkerCheck = !qualified ? 'unqualified-record'
    : isDeepStrictEqual(report.initialInput.markers, expectedFixtureMarkers(target.snapshot)) ? 'matched-record' : 'not-matched-record';
  const payload = { schemaVersion: 1, applicationId, fixtureMarkerCheck, report };
  const { id: observationId } = await putRecord({ store, type: 'observation', payload });
  return { schemaVersion: 1, observationId, applicationId,
    favoriteId: application.target.type === 'favorite' ? application.target.id : null,
    fixtureMarkerCheck, recordedStartRoute: report.provenance.recordedStartRoute,
    runtimeStateVerified: false, modeSwitchingVerified: false };
}
