// Offline cancellation restores state before removing the writer fence.
// It never reads live package content or writes source configuration bytes.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { readJson, writeJson, unlink } from '../sources/records.mjs';
import { equal } from '../sources/platform.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { loadPluginEnrollmentReview, validatePluginEnrollmentStates } from './plugin-enrollment-records.mjs';

export async function recoverPluginEnrollment(w, j) {
  try {
    exactKeys(j, ['kind', 'schemaVersion', 'scopeId', 'reviewId', 'beforeState', 'afterState', 'beforeManifest', 'afterManifest'], [], 'journal-invalid');
    if (j.kind !== 'unharness-user-source-plugin-enrollment-pending' || j.schemaVersion !== 3) fail('journal-invalid');
    const p = await loadPluginEnrollmentReview(w, j.reviewId);
    await validatePluginEnrollmentStates(w, p, j);
  } catch { fail('journal-invalid'); }
  const files = [
    { path: join(w.workspace, 'state.json'), before: j.beforeState, after: j.afterState, current: w.state },
    { path: join(w.workspace, 'registration.json'), before: j.beforeManifest, after: j.afterManifest, current: w.manifest },
  ];
  const staged = [];
  for (const file of files) try {
    await lstat(file.path + '.next');
    const data = await readJson(file.path + '.next');
    if (!equal(data, file.before) && !equal(data, file.after)) fail('foreign-stage');
    staged.push({ path: file.path + '.next', data });
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const pending = join(w.workspace, 'pending.json');
  if (!equal(await readJson(pending), j)) fail('journal-invalid');
  for (const file of files) if (!equal(await readJson(file.path), file.current)) fail('journal-invalid');
  for (const file of staged) {
    if (!equal(await readJson(file.path), file.data)) fail('foreign-stage');
    await unlink(file.path);
  }
  for (const file of files) {
    if (!equal(await readJson(file.path), file.current) || !equal(await readJson(pending), j)) fail('journal-invalid');
    await writeJson(file.path, file.before);
  }
  await unlink(pending);
  return { status: 'plugin-enrollment-recording-cancelled', checkpointId: j.beforeState.lastCheckpointId, verification };
}
