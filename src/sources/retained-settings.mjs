// Record-only reconciliation and offline cancellation. Native compiler imports
// stay inside planning: accepting/recovering frozen records is Node-only.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { captureRegistered, retained, targetFile, freshCatalog } from './capture.mjs';
import { equal, assertWritableOwnership } from './platform.mjs';
import { openWorkspace, activeNormalId, loadNormal, loadSnapshot, saveSnapshot,
  loadRecord, record, writeJson, readJson, unlink, newPreparation, validateStateSnapshots } from './records.mjs';
import { acquire, pending, assertCurrent, sourceTransactionHook } from './transaction.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail, verification } from './errors.mjs';
const modes = ['normal', 'unseal', 'trueform'];
// The one registered file that mixes managed and retained settings. Everything
// else must be byte-identical for an edit to qualify as retained-only.
const retainedKey = reg => applicationFor(reg.context).retainedKey;
const sameExceptRetained = (reg, left, right, kind = 'source-conflict') => {
  const skip = retainedKey(reg);
  for (const key of Object.keys(left))
    if (key !== skip && !equal(left[key], right[key])) fail(kind);
};
async function compose(w, base, target, current) {
  const key = retainedKey(w.reg);
  const result = await applicationFor(w.reg.context).mergeRetained({
    reg: w.reg, baseText: base[key]?.text ?? '',
    targetText: target[key]?.text ?? '', currentText: current[key]?.text ?? '' });
  if (result.version !== w.reg.version) fail('stale-discovery');
  await freshCatalog(w.reg);
  return result;
}
function summary(reg, p, planId) {
  return { planId, scopeId: p.scopeId, revision: p.revision,
    preparedMode: p.preparedMode, previousNormalId: p.previousNormalId,
    normalId: p.normalId, managedFilesChanged: 0,
    changedCategories: [...applicationFor(reg.context).retainedCategories],
    retained, verification };
}
export async function planRetainedSettings({ workspace }) {
  let w = await openWorkspace(workspace);
  const release = await acquire(w);
  try {
    w = await openWorkspace(workspace);
    if (await pending(workspace)) fail('recovery-required');
    const expected = await loadSnapshot(workspace, w.reg, w.state.snapshotId);
    const actual = await captureRegistered(w.reg);
    await assertCurrent(w, actual);
    const key = retainedKey(w.reg);
    sameExceptRetained(w.reg, expected, actual);
    if (equal(expected, actual)) fail('no-retained-change');
    assertWritableOwnership(actual[key]);
    const normal = await loadNormal(workspace, w.reg, activeNormalId(w));
    const merged = await compose(w, expected, normal, actual);
    const nextNormal = { ...normal, [key]: actual[key] === null ? null : { ...actual[key], text: merged.text } };
    // An absent current file must not conceal selected entries required by Normal.
    if (actual[key] === null && merged.text !== '') fail('config-transform-failed');
    const normalId = await saveSnapshot(workspace, w.reg, nextNormal, 2);
    const observedId = await saveSnapshot(workspace, w.reg, actual, 2);
    await assertCurrent(w, actual);
    const plan = { role: 'retained-plan', scopeId: w.scopeId,
      revision: w.state.revision, preparedMode: w.state.preparedMode,
      previousNormalId: activeNormalId(w), beforeId: w.state.snapshotId,
      observedId, normalId, snapshotVersion: 2 };
    return summary(w.reg, plan, await record(workspace, 'application', plan));
  } finally { await release(); }
}
async function loadRetainedPlan(w, planId) {
  const p = await loadRecord(w.workspace, 'application', planId);
  if (p.role !== 'retained-plan' || p.scopeId !== w.scopeId ||
      p.snapshotVersion !== 2 || !Number.isSafeInteger(p.revision) || p.revision < 0 ||
      !modes.includes(p.preparedMode) ||
      ['previousNormalId', 'normalId', 'beforeId', 'observedId'].some(k =>
        typeof p[k] !== 'string' || !/^[0-9a-f]{64}$/.test(p[k]))) fail('record-invalid');
  await loadSnapshot(w.workspace, w.reg, p.normalId, 2);
  await loadNormal(w.workspace, w.reg, p.previousNormalId);
  await loadNormal(w.workspace, w.reg, p.normalId);
  const before = await loadSnapshot(w.workspace, w.reg, p.beforeId);
  const actual = await loadSnapshot(w.workspace, w.reg, p.observedId, 2);
  sameExceptRetained(w.reg, before, actual, 'record-invalid');
  if (equal(before, actual)) fail('record-invalid');
  return p;
}
function assertPlanState(w, p) {
  if (p.revision !== w.state.revision || p.beforeId !== w.state.snapshotId ||
      p.previousNormalId !== activeNormalId(w) || p.preparedMode !== w.state.preparedMode)
    fail('stale-plan');
}
function acceptedState(before, p, planId, preparation) {
  return { ...before, snapshotVersion: 2, normalId: p.normalId,
    revision: before.revision + 1, snapshotId: p.observedId,
    lastRetainedPlanId: planId, lastPlanId: null, lastObservationId: null, preparation };
}
const result = (p, planId, duplicate) => ({ planId, normalId: p.normalId,
  revision: p.revision + 1, preparedMode: p.preparedMode, recorded: true, duplicate, verification });
export async function acceptRetainedSettings({ workspace, planId }) {
  if (process.platform !== 'darwin') fail('unsupported-platform');
  let w = await openWorkspace(workspace);
  const release = await acquire(w);
  try {
    w = await openWorkspace(workspace);
    if (await pending(workspace)) fail('recovery-required');
    const p = await loadRetainedPlan(w, planId);
    if (w.state.lastRetainedPlanId === planId) {
      if (w.state.revision !== p.revision + 1 || activeNormalId(w) !== p.normalId ||
          w.state.snapshotId !== p.observedId || w.state.preparedMode !== p.preparedMode)
        fail('stale-plan');
      await assertCurrent(w, await loadSnapshot(workspace, w.reg, p.observedId, 2));
      return result(p, planId, true);
    }
    assertPlanState(w, p);
    const actual = await loadSnapshot(workspace, w.reg, p.observedId, 2);
    await assertCurrent(w, actual);
    const afterState = acceptedState(w.state, p, planId, newPreparation());
    const cancelledState = { ...w.state, preparation: newPreparation(), lastObservationId: null };
    const journal = { kind: 'unharness-user-source-retained-pending', scopeId: w.scopeId,
      planId, beforeState: w.state, afterState, cancelledState };
    await writeJson(join(workspace, 'pending.json'), journal, true);
    await sourceTransactionHook('retained-journal');
    // No managed source is written. Recheck all source and parent bindings at
    // the final publication boundary, after the durable recovery receipt.
    await assertCurrent(w, actual);
    const reopened = await openWorkspace(workspace);
    if (reopened.scopeId !== w.scopeId || !equal(reopened.reg, w.reg) ||
        !equal(reopened.state, w.state)) fail('stale-plan');
    await writeJson(join(workspace, 'state.json'), afterState);
    await sourceTransactionHook('retained-state');
    await unlink(join(workspace, 'pending.json'));
    return result(p, planId, false);
  } finally { await release(); }
}
export async function adaptRetainedSnapshot(w, r, id, type) {
  const previousNormalId = r.normalId ?? w.reg.normalId;
  const base = await loadNormal(w.workspace, w.reg, previousNormalId);
  const after = await loadSnapshot(w.workspace, w.reg, r.snapshotId);
  const normalId = activeNormalId(w);
  if (previousNormalId === normalId) return { after, adaptation: null };
  const current = await loadNormal(w.workspace, w.reg, normalId);
  const merged = await compose(w, base, after, current);
  const key = retainedKey(w.reg);
  after[key] = current[key] === null && merged.text === '' ? null :
    await targetFile(w.reg, key, merged.text, current);
  return { after, adaptation: { kind: 'retained-settings', sourceType: type,
    sourceId: id, previousNormalId, normalId } };
}
export async function recoverRetainedSettings(w, j) {
  // Match the complete known states, not just a revision: a stale receipt may
  // never roll back a later preparation, observation, or independent record.
  try {
    if (j.scopeId !== w.scopeId) fail('journal-invalid');
    await validateStateSnapshots(w.workspace, w.reg, j.beforeState);
    await validateStateSnapshots(w.workspace, w.reg, j.afterState);
    await validateStateSnapshots(w.workspace, w.reg, j.cancelledState);
    const p = await loadRetainedPlan(w, j.planId);
    assertPlanState({ ...w, state: j.beforeState }, p);
    if (!equal(j.afterState, acceptedState(j.beforeState, p, j.planId, j.afterState.preparation)) ||
        !equal(j.cancelledState, { ...j.beforeState, preparation: j.cancelledState.preparation, lastObservationId: null }) ||
        ![j.beforeState, j.afterState, j.cancelledState].some(s => equal(s, w.state))) fail('journal-invalid');
  } catch { fail('journal-invalid'); }
  const statePath = join(w.workspace, 'state.json');
  try {
    await lstat(statePath + '.next');
    const staged = await readJson(statePath + '.next');
    if (!equal(staged, j.afterState) && !equal(staged, j.cancelledState)) fail('foreign-stage');
    await unlink(statePath + '.next');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!equal(await readJson(join(w.workspace, 'pending.json')), j) ||
      !equal(await readJson(statePath), w.state)) fail('journal-invalid');
  await writeJson(statePath, j.cancelledState);
  await unlink(join(w.workspace, 'pending.json'));
  return { status: 'retained-recording-cancelled', checkpointId: j.beforeState.lastCheckpointId, verification };
}
