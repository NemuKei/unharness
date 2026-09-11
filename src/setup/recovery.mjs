// Only record state is restored. Source files and independent edits are never
// written by setup adoption or by this offline cancellation path.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { readJson, writeJson, unlink, validateStateSnapshots } from '../sources/records.mjs';
import { equal } from '../sources/platform.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { loadSetup, assertReviewCurrent, adoptedState } from './records.mjs';

export async function recoverSetup(w, j) {
  if ([2, 3].includes(j.schemaVersion)) {
    const { recoverInheritedSetup } = await import('./inheritance-recovery.mjs');
    return recoverInheritedSetup(w, j);
  }
  try {
    exactKeys(j, ['kind', 'scopeId', 'setupId', 'beforeState', 'afterState'], [], 'journal-invalid');
    if (j.kind !== 'unharness-user-source-setup-pending' || j.scopeId !== w.scopeId) fail('journal-invalid');
    await validateStateSnapshots(w.workspace, w.reg, j.beforeState);
    await validateStateSnapshots(w.workspace, w.reg, j.afterState);
    const saved = await loadSetup(w, j.setupId);
    assertReviewCurrent({ ...w, state: j.beforeState }, saved.review);
    if (!equal(j.afterState, adoptedState(j.beforeState, j.setupId))
      || ![j.beforeState, j.afterState].some(state => equal(state, w.state))) fail('journal-invalid');
  } catch { fail('journal-invalid'); }
  const path = join(w.workspace, 'state.json');
  try {
    await lstat(path + '.next');
    const staged = await readJson(path + '.next');
    if (!equal(staged, j.afterState) && !equal(staged, j.beforeState)) fail('foreign-stage');
    await unlink(path + '.next');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!equal(await readJson(join(w.workspace, 'pending.json')), j) || !equal(await readJson(path), w.state)) fail('journal-invalid');
  await writeJson(path, j.beforeState);
  await unlink(join(w.workspace, 'pending.json'));
  return { status: 'setup-recording-cancelled', checkpointId: j.beforeState.lastCheckpointId, verification };
}
