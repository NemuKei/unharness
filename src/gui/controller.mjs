import { createStore, readRecord } from '../core/local-store.mjs';
import { isDeepStrictEqual } from 'node:util';

import { captureFixture, validateScope, validateSnapshot } from '../codex/fixture-loadout.mjs';
import { changeDesktopFixture, createDesktopFixture, readDesktopFixture } from '../codex/desktop-fixture.mjs';
import { findCurrentDesktopSession } from '../codex/desktop-record.mjs';
import {
  listCheckpoints,
  listFavorites,
  observeApplication,
  planRestore,
  registerFixture,
  restoreCheckpoint,
  restoreFavorite,
  saveFavorite,
} from '../loadouts/service.mjs';

const HASH = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const DEMO_RECOVERY = Symbol('demo-recovery');
const SAFE_CONFLICTS = new Set([
  'fixture-conflict', 'fixture-changed', 'fixture-locked', 'fixture-link-or-type',
  'fixture-recovery-required', 'fixture-cleanup-required', 'invalid-fixture',
  'loadout-source-unready', 'loadout-incompatible-scope',
]);

function fail(kind) {
  throw Object.assign(new Error(kind), { kind });
}

function exactObject(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function hash(value) {
  if (typeof value !== 'string' || !HASH.test(value)) fail('gui-invalid-request');
  return value;
}

function demoFailure(error, recovery) {
  const failure = new Error('demo-workspace-creation-failed', { cause: error });
  if (typeof error?.kind === 'string') failure.kind = error.kind;
  Object.defineProperty(failure, DEMO_RECOVERY, { value: Object.freeze({ ...recovery }) });
  return failure;
}

export function demoWorkspaceRecovery(error) {
  const recovery = error?.[DEMO_RECOVERY];
  return recovery && typeof recovery === 'object' ? { ...recovery } : null;
}

async function favoriteInScope(store, favoriteId, scopeId) {
  hash(favoriteId);
  let after;
  do {
    const page = await listFavorites({ store, after });
    const favorite = page.favorites.find(item => item.favoriteId === favoriteId);
    if (favorite) {
      if (favorite.scopeId !== scopeId) fail('loadout-incompatible-scope');
      return favorite;
    }
    after = page.nextCursor;
  } while (after !== null);
  fail('loadout-invalid-favorite');
}

async function checkpointInScope(store, checkpointId, scopeId) {
  hash(checkpointId);
  let after;
  do {
    const page = await listCheckpoints({ store, after });
    const checkpoint = page.checkpoints.find(item => item.checkpointId === checkpointId);
    if (checkpoint) {
      if (checkpoint.scopeId !== scopeId) fail('loadout-incompatible-scope');
      return checkpoint;
    }
    after = page.nextCursor;
  } while (after !== null);
  fail('loadout-invalid-checkpoint');
}

export async function createDemoWorkspace({ parent } = {}, {
  createStore: createStoreOperation = createStore,
  createDesktopFixture: createFixtureOperation = createDesktopFixture,
  registerFixture: registerFixtureOperation = registerFixture,
  saveFavorite: saveFavoriteOperation = saveFavorite,
  changeDesktopFixture: changeFixtureOperation = changeDesktopFixture,
} = {}) {
  const recovery = {};
  try {
    const { store } = await createStoreOperation({ parent });
    recovery.store = store;
    const created = await createFixtureOperation({ parent });
    recovery.fixture = created.fixture;
    recovery.project = created.project;
    const { scopeId } = await registerFixtureOperation({ store, fixture: created.fixture });
    recovery.scopeId = scopeId;
    await saveFavoriteOperation({ store, scopeId, name: 'Normal / 通常の確認条件' });
    await changeFixtureOperation(created.fixture, 'manual-only');
    await saveFavoriteOperation({ store, scopeId, name: 'Manual only / Skillを手動のみ' });
    await changeFixtureOperation(created.fixture, 'fixed-only');
    await saveFavoriteOperation({ store, scopeId, name: 'Fixed only / 固定指示のみ' });
    const baseline = await changeFixtureOperation(created.fixture, 'baseline');
    return { store, scopeId, fixture: created.fixture, project: baseline.project };
  } catch (error) {
    throw demoFailure(error, recovery);
  }
}

export async function createGuiController({ store, scopeId, codexHome } = {}) {
  hash(scopeId);
  const scope = validateScope(await readRecord({ store, type: 'scope', id: scopeId }));
  const fixture = scope.binding.root;
  const owned = await readDesktopFixture(fixture);
  const project = owned.project;
  let application = null;
  let applicationSnapshot = null;
  let observation = null;

  async function state() {
    let current = null;
    let conflict = null;
    let snapshotForComparison = null;
    try {
      const snapshot = await captureFixture(fixture);
      snapshotForComparison = snapshot;
      current = {
        case: snapshot.configuration.case,
        revision: snapshot.preparation.revision,
        configurationDigest: snapshot.configurationDigest,
      };
    } catch (error) {
      conflict = SAFE_CONFLICTS.has(error?.kind) ? error.kind : 'gui-state-unavailable';
    }
    const applicationCurrent = application !== null && current !== null
      && applicationSnapshot !== null
      && isDeepStrictEqual(snapshotForComparison, applicationSnapshot);
    return {
      scopeId,
      controlScope: 'owned-fixture-only',
      project,
      fixture,
      store,
      current,
      conflict,
      application,
      applicationCurrent,
      observation,
      runtimeStateVerified: false,
      modeSwitchingVerified: false,
    };
  }

  async function favorites(after) {
    return listFavorites({ store, scopeId, after });
  }

  async function checkpoints(after) {
    const page = await listCheckpoints({ store, after });
    return { ...page, checkpoints: page.checkpoints.filter(item => item.scopeId === scopeId) };
  }

  async function execute(action, body) {
    switch (action) {
      case 'plan': {
        if (!exactObject(body, ['favoriteId'])) fail('gui-invalid-request');
        await favoriteInScope(store, body.favoriteId, scopeId);
        return planRestore({ store, favoriteId: body.favoriteId });
      }
      case 'apply': {
        if (!exactObject(body, ['favoriteId', 'planId'])) fail('gui-invalid-request');
        await favoriteInScope(store, body.favoriteId, scopeId);
        hash(body.planId);
        const applied = await restoreFavorite({ store, favoriteId: body.favoriteId, expectedPlanId: body.planId });
        try {
          const receipt = await readRecord({ store, type: 'application', id: applied.applicationId });
          applicationSnapshot = structuredClone(validateSnapshot(receipt.snapshot));
        } catch (error) {
          error.checkpointId ??= applied.checkpointId;
          throw error;
        }
        application = applied;
        observation = null;
        return application;
      }
      case 'save': {
        if (!(exactObject(body, []) || exactObject(body, ['name']))) fail('gui-invalid-request');
        return saveFavorite({ store, scopeId, name: body.name ?? null });
      }
      case 'restore-checkpoint': {
        if (!exactObject(body, ['checkpointId'])) fail('gui-invalid-request');
        await checkpointInScope(store, body.checkpointId, scopeId);
        const applied = await restoreCheckpoint({ store, checkpointId: body.checkpointId });
        try {
          const receipt = await readRecord({ store, type: 'application', id: applied.applicationId });
          applicationSnapshot = structuredClone(validateSnapshot(receipt.snapshot));
        } catch (error) {
          error.checkpointId ??= applied.checkpointId;
          throw error;
        }
        application = applied;
        observation = null;
        return application;
      }
      case 'observe': {
        if (!exactObject(body, ['applicationId', 'sessionId']) || !HASH.test(body.applicationId)
          || typeof body.sessionId !== 'string' || !UUID.test(body.sessionId)) fail('gui-invalid-request');
        if (application === null || application.applicationId !== body.applicationId) fail('gui-application-not-current');
        const session = await findCurrentDesktopSession({ codexHome, sessionId: body.sessionId });
        observation = await observeApplication({ store, applicationId: body.applicationId, session, expectedSessionId: body.sessionId });
        return observation;
      }
      default:
        fail('gui-invalid-request');
    }
  }

  return { state, favorites, checkpoints, execute };
}
