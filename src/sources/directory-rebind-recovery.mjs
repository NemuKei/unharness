// Cancellation changes only the exact reviewed record pointers. Source content
// and independent stages are never restored or removed by this operation.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { readJson, writeJson, unlink, loadScopeLineage, validateStateSnapshots } from './records.mjs';
import { equal } from './platform.mjs';
import { fail, verification } from './errors.mjs';
import { loadDirectoryRebindReview, reboundRegistration, reboundState } from './directory-rebind-records.mjs';

export async function recoverDirectoryRebind(w, j) {
  try {
    exactKeys(j, ['kind', 'reviewId', 'scopeId', 'nextScopeId', 'beforeState', 'afterState', 'beforeManifest', 'afterManifest'], [], 'journal-invalid');
    if (j.kind !== 'unharness-user-source-directory-rebind-pending') fail('journal-invalid');
    const p = await loadDirectoryRebindReview(w, j.reviewId);
    const reg = reboundRegistration(p.before.reg, p, p.reviewId);
    const child = (await loadScopeLineage(w.workspace, w.rootScopeId, j.nextScopeId))[0];
    if (j.scopeId !== p.scopeId || !equal(j.beforeState, p.beforeState) || !equal(j.beforeManifest, p.beforeManifest)
      || !equal(j.afterManifest, { schemaVersion: 2, rootScopeId: w.rootScopeId })
      || !equal(child.reg, reg) || !equal(j.afterState, reboundState(j.beforeState, p, j.nextScopeId, j.afterState.preparation))
      || ![j.beforeState, j.afterState].some(s => equal(s, w.state))
      || ![j.beforeManifest, j.afterManifest].some(m => equal(m, w.manifest))) fail('journal-invalid');
    await validateStateSnapshots(w.workspace, p.before.reg, j.beforeState);
    await validateStateSnapshots(w.workspace, reg, j.afterState);
  } catch { fail('journal-invalid'); }
  const files = [
    { path: join(w.workspace, 'state.json'), before: j.beforeState, after: j.afterState, current: w.state },
    { path: join(w.workspace, 'registration.json'), before: j.beforeManifest, after: j.afterManifest, current: w.manifest }
  ];
  const staged = [];
  for (const file of files) try {
    await lstat(file.path + '.next');
    const data = await readJson(file.path + '.next');
    if (!equal(data, file.before) && !equal(data, file.after)) fail('foreign-stage');
    staged.push({ path: file.path + '.next', data });
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const journalPath = join(w.workspace, 'pending.json');
  if (!equal(await readJson(journalPath), j)) fail('journal-invalid');
  for (const file of files) if (!equal(await readJson(file.path), file.current)) fail('journal-invalid');
  for (const file of staged) {
    if (!equal(await readJson(file.path), file.data)) fail('foreign-stage');
    await unlink(file.path);
  }
  // Remove the new scope before dropping the pre-v2 writer fence.
  for (const file of files) {
    if (!equal(await readJson(file.path), file.current) || !equal(await readJson(journalPath), j)) fail('journal-invalid');
    await writeJson(file.path, file.before);
  }
  await unlink(journalPath);
  return { status: 'directory-rebind-recording-cancelled', checkpointId: j.beforeState.lastCheckpointId, verification };
}
