// Cancel a record-only setup adoption with no native, YAML or browser code.
// Publish the old state before removing the old-writer fence, and never change
// configuration bytes or replace independent record/staging edits.
import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { readJson, writeJson, unlink, validateStateSnapshots, workspaceManifestRoot } from '../sources/records.mjs';
import { equal } from '../sources/platform.mjs';
import { fail, verification } from '../sources/errors.mjs';
import { loadSetup, assertReviewCurrent, adoptedState } from './records.mjs';

export async function recoverInheritedSetup(w, j) {
  try {
    exactKeys(j, ['kind', 'schemaVersion', 'scopeId', 'setupId', 'beforeState', 'afterState', 'beforeManifest', 'afterManifest'], [], 'journal-invalid');
    if (j.kind !== 'unharness-user-source-setup-pending' || j.schemaVersion !== 2 || j.scopeId !== w.scopeId
      || workspaceManifestRoot(j.beforeManifest) !== w.rootScopeId
      || !equal(j.afterManifest, { schemaVersion: 2, rootScopeId: w.rootScopeId })
      || j.beforeState.setupSchemaVersion === 2 && j.beforeManifest.schemaVersion !== 2) fail('journal-invalid');
    await validateStateSnapshots(w.workspace, w.reg, j.beforeState);
    await validateStateSnapshots(w.workspace, w.reg, j.afterState);
    const saved = await loadSetup(w, j.setupId);
    if (saved.review.schemaVersion !== 2) fail('journal-invalid');
    assertReviewCurrent({ ...w, state: j.beforeState }, saved.review);
    if (!equal(j.afterState, adoptedState(j.beforeState, j.setupId, 2))
      || ![j.beforeState, j.afterState].some(s => equal(s, w.state))
      || ![j.beforeManifest, j.afterManifest].some(m => equal(m, w.manifest))) fail('journal-invalid');
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
  return { status: 'setup-recording-cancelled', checkpointId: j.beforeState.lastCheckpointId, verification };
}
