// Node-only transactional publication/recovery. No catalog, editor or YAML import.
import { randomBytes } from 'node:crypto';
import { lstat, readdir, rename } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import {
  captureFile,
  equal,
  checkBinding,
  writeComplete,
  publish,
  unlink,
  mkdir,
  rmdir,
  canonical
} from './platform.mjs';
import {
  readJson,
  writeJson,
  record,
  loadRecord,
  loadSnapshot,
  saveSnapshot,
  validateState
} from './records.mjs';
import { pathsFor } from './capture.mjs';
import { fail, verification } from './errors.mjs';
let testHook = null;
// Internal process-local seam: never accepted as service/CLI/browser input.
export function setSourceTransactionTestHook(hook) {
  testHook = hook;
}
const hook = async (phase) => {
  if (testHook) await testHook(phase);
};
async function exists(path) {
  try {
    return await lstat(path);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
export async function pending(workspace) {
  return !!(await exists(join(workspace, 'pending.json')));
}
export async function acquire(w, recovery = false) {
  const path = join(w.owner, 'operation.lock');
  const ownerFile = join(path, 'owner.json');
  const lock = {
    kind: 'unharness-user-source-lock',
    pid: process.pid,
    nonce: randomBytes(16).toString('hex'),
    workspace: w.workspace
  };
  const create = async () => {
    await mkdir(path, { mode: 0o700 });
    await writeJson(ownerFile, lock, true);
  };
  try {
    await create();
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    let previous;
    try {
      await canonical(path);
      previous = await readJson(ownerFile);
    } catch {
      fail('profile-busy');
    }
    if (
      previous.kind !== lock.kind ||
      previous.workspace !== w.workspace ||
      !Number.isSafeInteger(previous.pid) ||
      previous.pid <= 0 ||
      !/^[0-9a-f]{32}$/.test(previous.nonce)
    )
      fail('profile-busy');
    try {
      process.kill(previous.pid, 0);
      fail('profile-busy');
    } catch (e) {
      if (e.code !== 'ESRCH') fail('profile-busy');
    }
    if (!recovery) fail('recovery-required');
    // A permanent nonempty receipt makes concurrent reclaim atomic: a second
    // rename cannot replace this directory, including after a new owner starts.
    const receipt = join(w.owner, 'reclaimed-' + previous.nonce);
    try {
      if (
        (await exists(receipt)) ||
        !equal(await readJson(ownerFile), previous)
      )
        fail('profile-busy');
      await rename(path, receipt);
      await create();
    } catch {
      fail('profile-busy');
    }
  }
  return async () => {
    await canonical(path);
    if (!equal(await readJson(ownerFile), lock)) fail('profile-busy');
    await unlink(ownerFile);
    await rmdir(path);
  };
}
export async function checkParents(reg) {
  for (const b of Object.values(reg.bindings)) await checkBinding(b);
}
export async function assertCurrent(w, expected) {
  await checkParents(w.reg);
  for (const b of Object.values(w.reg.bindings))
    for (const path of b.missing) {
      const s = await exists(path);
      if (!s) continue;
      const owned = (w.state.ownedDirs ?? []).find((d) => d.path === path);
      if (
        !owned?.identity ||
        s.dev !== owned.identity.dev ||
        s.ino !== owned.identity.ino ||
        !s.isDirectory() ||
        s.isSymbolicLink()
      )
        fail('source-redirection');
    }
  const paths = pathsFor(w.reg);
  for (const [k, path] of Object.entries(paths))
    if (!equal(await captureFile(path), expected[k])) fail('source-conflict');
}
export async function loadPlan(w, id) {
  const p = await loadRecord(w.workspace, 'application', id);
  if (
    p.role !== 'plan' ||
    p.scopeId !== w.scopeId ||
    !Number.isSafeInteger(p.revision) ||
    !['normal', 'unseal', 'trueform', 'favorite', 'checkpoint'].includes(
      p.mode
    ) ||
    !['normal', 'unseal', 'trueform'].includes(p.preparedMode) ||
    !Array.isArray(p.selectedIds)
  )
    fail('record-invalid');
  const allowed = [
    w.reg.instructions?.id,
    ...w.reg.skills.map((s) => s.id)
  ].filter(Boolean);
  if (
    p.selectedIds.some((id) => !allowed.includes(id)) ||
    new Set(p.selectedIds).size !== p.selectedIds.length
  )
    fail('record-invalid');
  await loadSnapshot(w.workspace, w.reg, p.beforeId);
  await loadSnapshot(w.workspace, w.reg, p.afterId);
  return p;
}
function controlKeys(reg) {
  return [
    'config',
    ...(reg.instructions ? ['override'] : []),
    ...reg.skills.map((s) => s.id + ':policy')
  ];
}
function changes(w, before, after) {
  const allowed = controlKeys(w.reg);
  for (const k of Object.keys(before))
    if (!allowed.includes(k) && !equal(before[k], after[k]))
      fail('record-invalid');
  return allowed.filter((k) => !equal(before[k], after[k]));
}
export async function transact(w, plan, planId) {
  if (process.platform !== 'darwin') fail('unsupported-platform');
  if (await pending(w.workspace)) fail('recovery-required');
  if (
    plan.revision !== w.state.revision ||
    plan.beforeId !== w.state.snapshotId
  )
    fail('stale-plan');
  const before = await loadSnapshot(w.workspace, w.reg, plan.beforeId),
    after = await loadSnapshot(w.workspace, w.reg, plan.afterId);
  const keys = changes(w, before, after),
    paths = pathsFor(w.reg);
  await assertCurrent(w, before);
  const checkpointId = await record(w.workspace, 'checkpoint', {
    role: 'checkpoint',
    scopeId: w.scopeId,
    snapshotId: plan.beforeId,
    preparedMode: w.state.preparedMode,
    revision: w.state.revision
  });
  const nonce = randomBytes(16).toString('hex');
  const dirs = structuredClone(w.state.ownedDirs ?? []);
  for (const k of keys) {
    const dir = dirname(paths[k]);
    if (!(await exists(dir))) {
      const binding = w.reg.bindings[k];
      if (binding.missing.length !== 1 || binding.missing[0] !== dir)
        fail('source-redirection');
      if (!dirs.some((d) => d.path === dir))
        dirs.push({ path: dir, key: k, identity: null });
    }
  }
  const journal = {
    kind: 'unharness-user-source-pending',
    scopeId: w.scopeId,
    planId,
    checkpointId,
    nonce,
    keys,
    dirs,
    beforeState: w.state
  };
  await writeJson(join(w.workspace, 'pending.json'), journal, true);
  await hook('journal');
  for (const dir of dirs) {
    if (dir.identity) continue;
    await mkdir(dir.path, { mode: 0o700 });
    const s = await lstat(dir.path);
    dir.identity = { dev: s.dev, ino: s.ino };
    await writeJson(join(w.workspace, 'pending.json'), journal);
    await hook('directory');
  }
  for (const k of keys) {
    if (after[k] !== null)
      await writeComplete(paths[k] + '.unharness-' + nonce, after[k]);
  }
  await hook('staged');
  const active = { ...w, state: { ...w.state, ownedDirs: dirs } };
  await assertCurrent(active, before);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    await checkParents(w.reg);
    if (!equal(await captureFile(paths[k]), before[k])) fail('source-conflict');
    if (after[k] === null) await unlink(paths[k]);
    else await publish(paths[k] + '.unharness-' + nonce, paths[k], before[k]);
    await hook('write-' + i);
  }
  await assertCurrent(active, after);
  await hook('before-completion');
  const newState = {
    ownedDirs: dirs,
    revision: w.state.revision + 1,
    preparedMode: plan.preparedMode,
    snapshotId: plan.afterId,
    lastCheckpointId: checkpointId,
    lastPlanId: planId
  };
  await writeJson(join(w.workspace, 'state.json'), newState);
  await hook('state');
  // Journal removal is the committed boundary. Empty directory housekeeping
  // follows it so pending recovery never needs to recreate a deleted directory.
  await unlink(join(w.workspace, 'pending.json'));
  const retainedDirectories = await cleanupDirs(journal, after, paths, false);
  newState.ownedDirs = [];
  for (const d of dirs) if (await exists(d.path)) newState.ownedDirs.push(d);
  await writeJson(join(w.workspace, 'state.json'), newState);

  return {
    planId,
    checkpointId,
    preparedMode: plan.preparedMode,
    revision: newState.revision,
    readback: 'matched',
    retainedDirectories,
    verification
  };
}
async function validateJournal(w, j) {
  if (
    j?.kind !== 'unharness-user-source-pending' ||
    j.scopeId !== w.scopeId ||
    !/^[0-9a-f]{32}$/.test(j.nonce) ||
    !Array.isArray(j.keys) ||
    !Array.isArray(j.dirs) ||
    !j.beforeState
  )
    fail('journal-invalid');
  try {
    validateState(w.reg, j.beforeState);
  } catch {
    fail('journal-invalid');
  }
  const plan = await loadPlan(w, j.planId),
    before = await loadSnapshot(w.workspace, w.reg, plan.beforeId),
    after = await loadSnapshot(w.workspace, w.reg, plan.afterId),
    paths = pathsFor(w.reg);
  if (
    !equal(j.keys, changes(w, before, after)) ||
    j.beforeState.snapshotId !== plan.beforeId ||
    j.beforeState.revision !== plan.revision
  )
    fail('journal-invalid');
  const cp = await loadRecord(w.workspace, 'checkpoint', j.checkpointId);
  if (
    cp.role !== 'checkpoint' ||
    cp.scopeId !== w.scopeId ||
    cp.snapshotId !== plan.beforeId ||
    cp.revision !== plan.revision
  )
    fail('journal-invalid');
  if (new Set(j.dirs.map((d) => d.path)).size !== j.dirs.length)
    fail('journal-invalid');
  for (const d of j.dirs) {
    if (
      !Object.hasOwn(paths, d.key) ||
      d.path !== dirname(paths[d.key]) ||
      !w.reg.bindings[d.key].missing.includes(d.path)
    )
      fail('journal-invalid');
    const st = await exists(d.path);
    if (
      st &&
      (!d.identity ||
        st.dev !== d.identity.dev ||
        st.ino !== d.identity.ino ||
        !st.isDirectory() ||
        st.isSymbolicLink())
    )
      fail('journal-invalid');
  }
  for (const k of j.keys) {
    const stage = await captureFile(paths[k] + '.unharness-' + j.nonce);
    if (stage !== null && !equal(stage, after[k]) && !equal(stage, before[k]))
      fail('foreign-stage');
  }
  // Reject unknown siblings with this reserved prefix; never delete them.
  for (const path of new Set(j.keys.map((k) => dirname(paths[k])))) {
    if (!(await exists(path))) continue;
    for (const name of await readdir(path)) {
      if (
        Object.values(paths).some(
          (p) =>
            dirname(p) === path && name.startsWith(basename(p) + '.unharness-')
        ) &&
        !j.keys.some(
          (k) => paths[k] + '.unharness-' + j.nonce === join(path, name)
        )
      )
        fail('foreign-stage');
    }
  }
  return { plan, before, after, paths };
}
async function cleanupDirs(j, desired, paths, recovering) {
  const retainedDirectories = [];
  for (const d of j.dirs) {
    const s = await exists(d.path);
    if (!s) continue;
    if (!d.identity || s.dev !== d.identity.dev || s.ino !== d.identity.ino)
      fail('journal-invalid');
    if (
      Object.keys(paths).some(
        (k) => dirname(paths[k]) === d.path && desired[k] !== null
      )
    )
      continue;
    if ((await readdir(d.path)).length) {
      retainedDirectories.push(d.path);
      continue;
    }
    await rmdir(d.path);
  }
  return retainedDirectories;
}
export async function recoverTransaction(w) {
  if (!(await pending(w.workspace)))
    return { status: 'nothing-pending', verification };
  if (process.platform !== 'darwin') fail('unsupported-platform');
  const j = await readJson(join(w.workspace, 'pending.json'));
  const { before, after, paths } = await validateJournal(w, j);
  await checkParents(w.reg);
  const dependencyConflicts = [];
  // Validate every target and dependency before the first recovery mutation.
  for (const [k, path] of Object.entries(paths)) {
    const current = await captureFile(path);
    if (j.keys.includes(k)) {
      if (!equal(current, before[k]) && !equal(current, after[k]))
        fail('source-conflict');
    } else if (!equal(current, before[k])) dependencyConflicts.push(k);
  }
  for (const k of j.keys) {
    const stage = paths[k] + '.unharness-' + j.nonce;
    if ((await captureFile(stage)) !== null) await unlink(stage);
  }
  for (const k of [...j.keys].reverse()) {
    const current = await captureFile(paths[k]);
    if (equal(current, before[k])) continue;
    if (!equal(current, after[k])) fail('source-conflict');
    if (before[k] === null) await unlink(paths[k]);
    else {
      const stage = paths[k] + '.unharness-' + j.nonce;
      await writeComplete(stage, before[k]);
      await publish(stage, paths[k], current);
    }
  }
  const retainedDirectories = await cleanupDirs(j, before, paths, true);
  for (const k of j.keys)
    if (!equal(await captureFile(paths[k]), before[k])) fail('source-conflict');
  // Configuration returns to its previous revision, but a newly created
  // directory retained for foreign contents still needs its verified identity.
  // Rebuild only from registered journal directories that remain intact;
  // directories removed by cleanup must not leave stale ownership in state.
  const recoveredState = { ...j.beforeState, ownedDirs: [] };
  for (const d of j.dirs) {
    const current = await exists(d.path);
    if (!current) continue;
    await canonical(d.path);
    if (
      !d.identity ||
      !current.isDirectory() ||
      current.isSymbolicLink() ||
      current.dev !== d.identity.dev ||
      current.ino !== d.identity.ino
    )
      fail('journal-invalid');
    recoveredState.ownedDirs.push({
      key: d.key,
      path: d.path,
      identity: { dev: d.identity.dev, ino: d.identity.ino }
    });
  }
  validateState(w.reg, recoveredState);
  await writeJson(join(w.workspace, 'state.json'), recoveredState);
  await unlink(join(w.workspace, 'pending.json'));
  return {
    status: dependencyConflicts.length
      ? 'controls-restored-dependencies-changed'
      : 'restored',
    checkpointId: j.checkpointId,
    dependencyConflicts,
    retainedDirectories,
    verification
  };
}
