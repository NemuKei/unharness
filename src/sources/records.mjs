import { randomBytes } from 'node:crypto';
import {
  open,
  readFile,
  lstat,
  realpath,
  mkdir,
  unlink,
  rename
} from 'node:fs/promises';
import { join, dirname, isAbsolute, relative, resolve } from 'node:path';
import { createStore, putRecord, readRecord } from '../core/local-store.mjs';
import { canonical, captureFile, equal } from './platform.mjs';
import { applicationFor } from '../apps/index.mjs';
import {
  pathsFor,
  validateFiles,
  hash,
  captureRegistered,
  assertRegistrationOwnership
} from './capture.mjs';
import { fail } from './errors.mjs';
import { validDirectoryIdentity } from '../platform/directory-identity.mjs';
export const newPreparation = () => ({ id: randomBytes(16).toString('hex'), preparedAt: new Date().toISOString() });
export const ownerPath = (home) => join(home, '.unharness-user-sources');
export async function readJson(path) {
  const s = await lstat(path);
  if (
    !s.isFile() ||
    s.isSymbolicLink() ||
    s.nlink !== 1 ||
    s.size > 1024 * 1024
  )
    fail('workspace-invalid');
  return JSON.parse(await readFile(path, 'utf8'));
}
export async function writeJson(path, data, exclusive = false) {
  const target = exclusive ? path : path + '.next';
  const h = await open(target, 'wx', 0o600);
  try {
    await h.writeFile(JSON.stringify(data));
    await h.sync();
  } finally {
    await h.close();
  }
  if (!exclusive) await rename(target, path);
}
export async function record(workspace, type, payload) {
  return (
    await putRecord({
      store: workspace,
      type,
      payload: { kind: 'unharness-user-source', ...payload }
    })
  ).id;
}
export async function loadRecord(workspace, type, id) {
  const r = await readRecord({ store: workspace, type, id });
  if (r?.kind !== 'unharness-user-source') fail('record-invalid');
  return r;
}
export async function saveSnapshot(workspace, reg, files, version = 1) {
  validateFiles(reg, files);
  if (![1, 2].includes(version)) fail('record-invalid');
  return record(workspace, 'observation', { role: version === 2 ? 'snapshot-v2' : 'snapshot', files });
}
export async function loadSnapshot(workspace, reg, id, version) {
  const p = await loadRecord(workspace, 'observation', id);
  if (!['snapshot', 'snapshot-v2'].includes(p.role) ||
      (version !== undefined && p.role !== (version === 2 ? 'snapshot-v2' : 'snapshot'))) fail('record-invalid');
  return validateFiles(reg, p.files);
}
export const activeNormalId = (w) => w.state.normalId ?? w.reg.normalId;
export async function loadNormal(workspace, reg, id = reg.normalId) {
  const normal = await loadSnapshot(workspace, reg, id);
  if (id !== reg.normalId) {
    // Only the one file that mixes managed and retained settings may differ
    // between Normal versions; that key is application specific.
    const skip = applicationFor(reg.context).retainedKey;
    const baseline = await loadSnapshot(workspace, reg, reg.normalId);
    for (const key of Object.keys(baseline))
      if (key !== skip && !equal(normal[key], baseline[key])) fail('record-invalid');
  }
  return normal;
}
export async function validateStateSnapshots(workspace, reg, state) {
  validateState(reg, state);
  await loadNormal(workspace, reg, state.normalId ?? reg.normalId);
  await loadSnapshot(workspace, reg, state.snapshotId, state.snapshotVersion ?? 1);
}
export function validateState(reg, state) {
  if (
    !state ||
    !Number.isSafeInteger(state.revision) ||
    state.revision < 0 ||
    !/^[0-9a-f]{64}$/.test(state.snapshotId) ||
    !['normal', 'unseal', 'trueform', 'favorite', 'checkpoint'].includes(
      state.preparedMode
    ) ||
    !Array.isArray(state.ownedDirs)
  )
    fail('workspace-invalid');
  if ((state.normalId !== undefined && state.normalId !== reg.normalId && state.snapshotVersion !== 2) ||
      (state.snapshotVersion !== undefined && state.snapshotVersion !== 2) ||
      (state.snapshotVersion === 2 && !/^[0-9a-f]{64}$/.test(state.normalId)) ||
      (state.normalId !== undefined && !/^[0-9a-f]{64}$/.test(state.normalId)) ||
      (state.lastRetainedPlanId != null && !/^[0-9a-f]{64}$/.test(state.lastRetainedPlanId))) fail('workspace-invalid');
  for (const key of ['lastCheckpointId', 'lastPlanId'])
    if (state[key] !== null && !/^[0-9a-f]{64}$/.test(state[key]))
      fail('workspace-invalid');
  for (const key of ['setupId', 'preparedSetupId', 'scopeId', 'lastEnrollmentReviewId', 'lastRebindReviewId', 'lastPluginEnrollmentReviewId'])
    if (state[key] != null && (typeof state[key] !== 'string' || !/^[0-9a-f]{64}$/.test(state[key]))) fail('workspace-invalid');
  if (state.scopePreparationRequired !== undefined && typeof state.scopePreparationRequired !== 'boolean') fail('workspace-invalid');
  if (state.setupSchemaVersion !== undefined && ![2, 3].includes(state.setupSchemaVersion)) fail('workspace-invalid');
  const paths = pathsFor(reg);
  if (
    new Set(state.ownedDirs.map((d) => d.path)).size !== state.ownedDirs.length
  )
    fail('workspace-invalid');
  for (const d of state.ownedDirs)
    if (
      !Object.hasOwn(paths, d.key) ||
      d.path !== dirname(paths[d.key]) ||
      !reg.bindings[d.key].missing.includes(d.path) ||
      !validDirectoryIdentity(d.identity)
    )
      fail('workspace-invalid');
}
async function loadRegistration(workspace, scopeId) {
  const reg = await loadRecord(workspace, 'scope', scopeId);
  if (
    !['registration', 'registration-rebind', 'registration-controls-v3'].includes(reg.role) ||
    reg.workspace !== workspace ||
    !reg.context ||
    !Array.isArray(reg.skills) ||
    reg.skills.length > 32
  )
    fail('workspace-invalid');
  const app = applicationFor(reg.context);
  if (reg.plugins !== undefined || reg.controlSchemaVersion !== undefined || reg.role === 'registration-controls-v3') {
    if (app.id !== 'codex' || reg.controlSchemaVersion !== 3) fail('workspace-invalid');
    const { validateRegisteredPlugins } = await import('../codex/plugin-dependency.mjs');
    try { await validateRegisteredPlugins(workspace, reg); } catch { fail('workspace-invalid'); }
  }
  if (reg.role === 'registration-controls-v3' && !/^[a-f0-9]{64}$/.test(reg.pluginEnrollmentReviewId)
    || reg.role === 'registration' && reg.pluginEnrollmentReviewId !== undefined) fail('workspace-invalid');
  if (reg.role === 'registration-rebind' &&
      (!/^[a-f0-9]{64}$/.test(reg.rebindReviewId) || !/^[a-f0-9]{64}$/.test(reg.parentScopeId))
      || reg.role === 'registration' && reg.rebindReviewId !== undefined) fail('workspace-invalid');
  if (
    reg.skills.some(
      (s) =>
        !['user', 'repo'].includes(s.identity?.scope) ||
        s.path !== s.identity.path ||
        s.id !==
          'skill-' +
            hash({ identity: s.identity, sourceDigest: s.sourceDigest }) ||
        app.rejectsRegisteredSkill(s)
    )
  )
    fail('workspace-invalid');
  if (new Set(reg.skills.map((s) => s.id)).size !== reg.skills.length ||
      new Set(reg.skills.map((s) => s.path)).size !== reg.skills.length)
    fail('workspace-invalid');
  const expected = Object.keys(pathsFor(reg)).sort();
  if (!equal(Object.keys(reg.bindings ?? {}).sort(), expected))
    fail('workspace-invalid');
  for (const [key, path] of Object.entries(pathsFor(reg))) {
    if (!isAbsolute(path) || resolve(path) !== path) fail('workspace-invalid');
    const b = reg.bindings[key];
    if (
      !b ||
      !Array.isArray(b.missing) ||
      !validDirectoryIdentity(b)
    )
      fail('workspace-invalid');
    if (b.missing.length === 0) {
      if (b.path !== dirname(path)) fail('workspace-invalid');
    } else if (
      b.missing.length !== 1 ||
      b.missing[0] !== dirname(path) ||
      b.path !== dirname(dirname(path))
    )
      fail('workspace-invalid');
    if (reg.ownedRoot) {
      const rel = relative(reg.ownedRoot, path);
      if (rel.startsWith('..') || isAbsolute(rel)) fail('workspace-invalid');
    }
  }
  const normal = await loadSnapshot(workspace, reg, reg.normalId);
  for (const s of reg.skills)
    if (s.sourceDigest !== app.skillSourceDigest(normal, s))
      fail('workspace-invalid');
  return reg;
}

// The original reservation anchors the workspace for its whole lifetime. An
// additive registration is selected by the same atomic state publication as
// its snapshots; no multi-file reservation/manifest move is needed.
export async function loadScopeLineage(workspace, rootScopeId, scopeId) {
  const registrations = [];
  let id = scopeId;
  while (true) {
    if (!/^[a-f0-9]{64}$/.test(id) || registrations.some(s => s.scopeId === id) || registrations.length > 32) fail('workspace-invalid');
    const reg = await loadRegistration(workspace, id);
    registrations.push({ scopeId: id, reg });
    if (id === rootScopeId) {
      if (reg.role !== 'registration' || reg.parentScopeId !== undefined || reg.parentNormalId !== undefined
        || reg.plugins !== undefined || reg.controlSchemaVersion !== undefined) fail('workspace-invalid');
      break;
    }
    if (!/^[a-f0-9]{64}$/.test(reg.parentScopeId) || !/^[a-f0-9]{64}$/.test(reg.parentNormalId)) fail('workspace-invalid');
    id = reg.parentScopeId;
  }
  for (let i = 0; i < registrations.length - 1; i++) {
    const child = registrations[i].reg, parent = registrations[i + 1].reg;
    if (child.role === 'registration-rebind') {
      const { validateReboundRegistration } = await import('./directory-rebind-records.mjs');
      await validateReboundRegistration(workspace, rootScopeId, registrations[i + 1].scopeId, parent, child);
      continue;
    }
    if (child.role === 'registration-controls-v3') {
      const { validatePluginEnrollmentRegistration } = await import('../setup/plugin-enrollment-records.mjs');
      await validatePluginEnrollmentRegistration(workspace, rootScopeId, registrations[i + 1].scopeId, parent, child);
      continue;
    }
    if (!equal(child.context, parent.context) || child.ownedRoot !== parent.ownedRoot || child.version !== parent.version ||
        !equal(child.instructions, parent.instructions) || child.skills.length <= parent.skills.length ||
        !equal(child.plugins, parent.plugins) || child.controlSchemaVersion !== parent.controlSchemaVersion ||
        !equal(child.skills.slice(0, parent.skills.length), parent.skills)) fail('workspace-invalid');
    const before = await loadNormal(workspace, parent, child.parentNormalId);
    const after = await loadNormal(workspace, child);
    for (const key of Object.keys(before))
      if (!equal(before[key], after[key]) || !equal(parent.bindings[key], child.bindings[key])) fail('workspace-invalid');
  }
  return registrations;
}
export function scopeWorkspace(w, scopeId) {
  if (scopeId === w.scopeId) return w;
  const index = w.registrations?.findIndex(s => s.scopeId === scopeId) ?? -1;
  const activeIndex = w.registrations?.findIndex(s => s.scopeId === w.scopeId) ?? -1;
  const historic = w.registrations?.[index];
  if (!historic || index < activeIndex) fail('record-invalid');
  return { ...w, ...historic };
}
export async function openWorkspace(workspace) {
  await canonical(workspace);
  const manifest = await readJson(join(workspace, 'registration.json'));
  const state = await readJson(join(workspace, 'state.json'));
  const rootScopeId = workspaceManifestRoot(manifest);
  const manifestVersion = manifest.schemaVersion ?? 1;
  if ((state.setupSchemaVersion ?? 1) > manifestVersion) fail('workspace-invalid');
  if (manifestVersion === 3 && state.setupSchemaVersion !== 3) {
    // The new writer fence is published before its state. Only the matching
    // durable record-only adoption may account for this intermediate pair.
    try {
      const j = await readJson(join(workspace, 'pending.json'));
      if (!['unharness-user-source-setup-pending', 'unharness-user-source-plugin-enrollment-pending'].includes(j.kind) || j.schemaVersion !== 3
        || j.scopeId !== (state.scopeId ?? rootScopeId) || !equal(j.beforeState, state)
        || !equal(j.afterManifest, manifest) || workspaceManifestRoot(j.beforeManifest) !== rootScopeId)
        fail('workspace-invalid');
    } catch { fail('workspace-invalid'); }
  }
  const scopeId = state.scopeId ?? rootScopeId;
  const registrations = await loadScopeLineage(workspace, rootScopeId, scopeId);
  const reg = registrations[0].reg;
  const home = applicationFor(reg.context).home(reg.context);
  await canonical(home);
  await canonical(reg.context.project);
  const owner = ownerPath(home);
  await canonical(owner);
  const reservation = await readJson(join(owner, 'reservation.json'));
  if (reservation.workspace !== workspace || reservation.scopeId !== rootScopeId ||
      (reservation.home ?? reservation.codexHome) !== home) fail('workspace-invalid');
  await validateStateSnapshots(workspace, reg, state);
  return { workspace, scopeId, rootScopeId, manifest, manifestVersion, registrations, reg, state, owner };
}

// A v2 manifest deliberately has no legacy scopeId. Older writers cannot open
// it, even if they ignore fields added to mutable state. Immutable scopes,
// snapshots and the original profile reservation keep their exact identities.
export function workspaceManifestRoot(manifest) {
  const versioned = [2, 3].includes(manifest?.schemaVersion);
  const root = versioned ? manifest.rootScopeId : manifest?.scopeId;
  if (!manifest || !equal(Object.keys(manifest).sort(), versioned ? ['rootScopeId', 'schemaVersion'] : ['scopeId'])
    || typeof root !== 'string' || !/^[a-f0-9]{64}$/.test(root)) fail('workspace-invalid');
  return root;
}

export function registeredSkill(app, s) {
  return { id: s.id, sourceDigest: s.sourceDigest, path: s.path, label: s.label,
    identity: s.identity, pluginId: s.pluginId, enabled: s.enabled, availability: s.availability,
    ...app.registeredSkillFields(s) };
}
export async function initializeWorkspace(d, selected, instructionsOptional) {
  assertRegistrationOwnership(d, selected, instructionsOptional);
  const app = applicationFor(d.context);
  const home = app.home(d.context);
  const owner = ownerPath(home);
  try {
    await mkdir(owner, { mode: 0o700 });
  } catch (e) {
    if (e.code === 'EEXIST') fail('profile-owned');
    throw e;
  }
  // Reservation directory survives every interrupted initialization.
  // A Codex reservation keeps its original codexHome field so that a CLI
  // built before the application seam still validates workspaces this build
  // creates. New readers use `home`; `application` is additive.
  const homeFields =
    app.id === 'codex'
      ? { application: app.id, home, codexHome: home }
      : { application: app.id, home };
  await writeJson(
    join(owner, 'initializing.json'),
    {
      kind: 'unharness-user-source-initialization',
      ...homeFields,
      pid: process.pid
    },
    true
  );
  const { store: workspace } = await createStore({ parent: owner });
  const skills = d.skills
    .filter((s) => selected.includes(s.id))
    .map(s => registeredSkill(app, s));
  const reg = {
    role: 'registration',
    workspace,
    context: d.context,
    ownedRoot: d.ownedRoot,
    version: d.version,
    instructions: instructionsOptional ? d.instructions : null,
    skills,
    bindings: { ...d.bindings },
    normalId: null
  };
  const files = { ...d.files };
  // Each application decides which files back one registered Skill: Codex has
  // a policy and format sidecar, Claude Code has only the guarded body.
  for (const s of d.skills.filter((s) => selected.includes(s.id)))
    for (const [key, { file, binding }] of Object.entries(app.skillFiles(s))) {
      files[key] = file;
      reg.bindings[key] = binding;
    }
  reg.normalId = await saveSnapshot(workspace, reg, files);
  const scopeId = await record(workspace, 'scope', reg);
  await writeJson(join(workspace, 'registration.json'), { scopeId }, true);
  await writeJson(
    join(workspace, 'state.json'),
    {
      preparation: newPreparation(),
      lastObservationId: null,
      revision: 0,
      preparedMode: 'normal',
      snapshotId: reg.normalId,
      lastCheckpointId: null,
      lastPlanId: null,
      ownedDirs: []
    },
    true
  );
  if (!equal(await captureRegistered(reg), files)) fail('stale-discovery');
  await writeJson(
    join(owner, 'reservation.json'),
    {
      kind: 'unharness-user-source-reservation',
      ...homeFields,
      workspace,
      scopeId
    },
    true
  );
  return { workspace, scopeId, reg, owner };
}
export { unlink };
