import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { readJson, writeJson, unlink } from '../sources/records.mjs';
import { equal } from '../sources/platform.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { loadEnrollmentReview, validateEnrollmentStates } from './enrollment-records.mjs';

export async function recoverEnrollment(w, j) {
  try {
    exactKeys(j, ['kind', 'scopeId', 'reviewId', 'beforeState', 'afterState'], [], 'journal-invalid');
    if (j.kind !== 'unharness-user-source-enrollment-pending') fail('journal-invalid');
    const p = await loadEnrollmentReview(w, j.reviewId);
    if (j.scopeId !== p.scopeId || ![j.beforeState, j.afterState].some(state => equal(state, w.state))) fail('journal-invalid');
    await validateEnrollmentStates(w, p, j.beforeState, j.afterState);
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
  return { status: 'enrollment-recording-cancelled', checkpointId: j.beforeState.lastCheckpointId, verification };
}
