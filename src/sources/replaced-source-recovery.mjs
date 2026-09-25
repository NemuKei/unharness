// Cancel an interrupted record-only successor adoption. External Skill files
// are never restored, moved or removed by this recovery path.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { readJson, writeJson, unlink, loadScopeLineage, validateStateSnapshots } from './records.mjs';
import { equal } from './platform.mjs';
import { fail, verification } from './errors.mjs';
import { loadReplacementReview, replacementRegistration, replacementState, replacementManifest } from './replaced-source-records.mjs';

export async function recoverReplacedSource(w, j) {
  try {
    exactKeys(j, ['kind', 'reviewId', 'scopeId', 'nextScopeId', 'beforeState', 'afterState', 'beforeManifest', 'afterManifest'], [], 'journal-invalid');
    if (j.kind !== 'unharness-user-source-replaced-pending') fail('journal-invalid');
    const p = await loadReplacementReview(w, j.reviewId);
    const reg = replacementRegistration(p.before.reg, p, p.reviewId);
    const child = (await loadScopeLineage(w.workspace, w.rootScopeId, j.nextScopeId))[0];
    if (j.scopeId !== p.scopeId || !equal(j.beforeState, p.beforeState) || !equal(j.beforeManifest, p.beforeManifest)
      || !equal(j.afterManifest, replacementManifest(p)) || !equal(child.reg, reg)
      || !equal(j.afterState, replacementState(j.beforeState, p, j.nextScopeId, j.afterState.preparation))
      || ![j.beforeState, j.afterState].some(state => equal(state, w.state))
      || ![j.beforeManifest, j.afterManifest].some(manifest => equal(manifest, w.manifest))) fail('journal-invalid');
    await validateStateSnapshots(w.workspace, p.before.reg, j.beforeState);
    await validateStateSnapshots(w.workspace, reg, j.afterState);
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
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const journalPath = join(w.workspace, 'pending.json');
  if (!equal(await readJson(journalPath), j)) fail('journal-invalid');
  for (const file of files) if (!equal(await readJson(file.path), file.current)) fail('journal-invalid');
  for (const file of staged) {
    if (!equal(await readJson(file.path), file.data)) fail('foreign-stage');
    await unlink(file.path);
  }
  for (const file of files) {
    if (!equal(await readJson(file.path), file.current) || !equal(await readJson(journalPath), j)) fail('journal-invalid');
    await writeJson(file.path, file.before);
  }
  await unlink(journalPath);
  return { status: 'replaced-source-recording-cancelled', checkpointId: j.beforeState.lastCheckpointId, verification };
}
