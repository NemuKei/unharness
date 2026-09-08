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
import {
  pathsFor,
  validateFiles,
  hash,
  captureRegistered,
  assertRegistrationOwnership
} from './capture.mjs';
import { fail } from './errors.mjs';
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
    const baseline = await loadSnapshot(workspace, reg, reg.normalId);
    for (const key of Object.keys(baseline))
      if (key !== 'config' && !equal(normal[key], baseline[key])) fail('record-invalid');
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
      !Number.isSafeInteger(d.identity?.dev) ||
      !Number.isSafeInteger(d.identity?.ino)
    )
      fail('workspace-invalid');
}
export async function openWorkspace(workspace) {
  await canonical(workspace);
  const manifest = await readJson(join(workspace, 'registration.json'));
  const reg = await loadRecord(workspace, 'scope', manifest.scopeId);
  if (
    reg.role !== 'registration' ||
    reg.workspace !== workspace ||
    !reg.context ||
    !Array.isArray(reg.skills) ||
    reg.skills.length > 32
  )
    fail('workspace-invalid');
  await canonical(reg.context.codexHome);
  await canonical(reg.context.project);
  const owner = ownerPath(reg.context.codexHome);
  await canonical(owner);
  const reservation = await readJson(join(owner, 'reservation.json'));
  if (
    reservation.workspace !== workspace ||
    reservation.scopeId !== manifest.scopeId ||
    reservation.codexHome !== reg.context.codexHome
  )
    fail('workspace-invalid');
  if (
    reg.skills.some(
      (s) =>
        !['user', 'repo'].includes(s.identity?.scope) ||
        s.path !== s.identity.path ||
        s.id !==
          'skill-' +
            hash({ identity: s.identity, sourceDigest: s.sourceDigest }) ||
        s.pluginId?.includes('@openai-')
    )
  )
    fail('workspace-invalid');
  if (new Set(reg.skills.map((s) => s.id)).size !== reg.skills.length)
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
      !Number.isSafeInteger(b.dev) ||
      !Number.isSafeInteger(b.ino)
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
  const state = await readJson(join(workspace, 'state.json'));
  await validateStateSnapshots(workspace, reg, state);
  const normal = await loadSnapshot(workspace, reg, reg.normalId);
  for (const s of reg.skills)
    if (
      s.sourceDigest !==
      hash({
        body: normal[s.id + ':body'],
        policy: normal[s.id + ':policy'],
        format: normal[s.id + ':format']
      })
    )
      fail('workspace-invalid');
  return { workspace, scopeId: manifest.scopeId, reg, state, owner };
}
export async function initializeWorkspace(d, selected, instructionsOptional) {
  assertRegistrationOwnership(d, selected, instructionsOptional);
  const owner = ownerPath(d.context.codexHome);
  try {
    await mkdir(owner, { mode: 0o700 });
  } catch (e) {
    if (e.code === 'EEXIST') fail('profile-owned');
    throw e;
  }
  // Reservation directory survives every interrupted initialization.
  await writeJson(
    join(owner, 'initializing.json'),
    {
      kind: 'unharness-user-source-initialization',
      codexHome: d.context.codexHome,
      pid: process.pid
    },
    true
  );
  const { store: workspace } = await createStore({ parent: owner });
  const skills = d.skills
    .filter((s) => selected.includes(s.id))
    .map((s) => ({
      id: s.id,
      sourceDigest: s.sourceDigest,
      path: s.path,
      label: s.label,
      identity: s.identity,
      pluginId: s.pluginId,
      enabled: s.enabled,
      availability: s.availability
    }));
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
  for (const s of d.skills.filter((s) => selected.includes(s.id))) {
    files[s.id + ':body'] = s.body;
    files[s.id + ':policy'] = s.policy;
    files[s.id + ':format'] = s.format;
    reg.bindings[s.id + ':body'] = s.binding;
    reg.bindings[s.id + ':policy'] = s.policyBinding;
    reg.bindings[s.id + ':format'] = s.formatBinding;
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
      codexHome: d.context.codexHome,
      workspace,
      scopeId
    },
    true
  );
  return { workspace, scopeId, reg, owner };
}
export { unlink };
