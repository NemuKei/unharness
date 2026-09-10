import { isDeepStrictEqual } from 'node:util';
import { relative, isAbsolute, sep } from 'node:path';
import { openWorkspace, record, loadSnapshot } from '../sources/records.mjs';
import { acquire, sourceTransactionHook } from '../sources/transaction.mjs';
import { recordId, readRecord, listRecordPage } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { validateDeclaration } from './declaration.mjs';
import { inventoryStartingFiles } from './inventory.mjs';
import { captureStartingFiles, startingCaptureGuard, assertStartingFilesCurrent } from './files.mjs';
import { writeStartingManifest } from './records.mjs';
import { hash, START_CONDITIONS, loadStartReview, loadSavedStart, startReviewSummary } from './start-records.mjs';

const request = (args, required, optional = []) => exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
async function locked(workspace, action) {
  const w = await openWorkspace(workspace), release = await acquire(w);
  try { return await action(await openWorkspace(workspace)); } finally { await release(); }
}
async function assertInputs(w, selection, capture) {
  try {
    const current = await openWorkspace(w.workspace);
    if (current.scopeId !== w.scopeId || !isDeepStrictEqual(current.reg, w.reg)) fail('starting-files-changed');
    const inventory = await inventoryStartingFiles({ project: w.reg.context.project, additionalPaths: selection.additionalPaths });
    if (!isDeepStrictEqual(inventory.selection, selection) || !isDeepStrictEqual(inventory.paths, capture.files.map(f => f.path))
      || !isDeepStrictEqual(inventory.guards, capture.guards)) fail('starting-files-changed');
    await assertStartingFilesCurrent({ project: w.reg.context.project, capture });
  } catch { fail('starting-files-changed'); }
}
export async function reviewUserStart(args) {
  request(args, ['declaration'], ['additionalPaths']);
  const declaration = validateDeclaration(args.declaration);
  return locked(args.workspace, async w => {
    if (declaration.comparisonRule) {
      try {
        await loadSnapshot(w.workspace, w.reg, declaration.comparisonRule.baselineSnapshotId);
        await loadSnapshot(w.workspace, w.reg, declaration.comparisonRule.candidateSnapshotId);
      } catch { fail('starting-declaration-invalid'); }
    }
    const project = w.reg.context.project;
    const storeWithinProject = relative(project, w.workspace);
    if (storeWithinProject === '' || storeWithinProject !== '..' && !storeWithinProject.startsWith('..' + sep) && !isAbsolute(storeWithinProject))
      fail('starting-project-contains-store');
    const inventory = await inventoryStartingFiles({ project, ...(args.additionalPaths === undefined ? {} : { additionalPaths: args.additionalPaths }) });
    const capture = await captureStartingFiles({ project, paths: inventory.paths });
    if (!isDeepStrictEqual(inventory.guards, capture.guards)) fail('starting-files-changed');
    await sourceTransactionHook('starting-review-captured');
    await assertInputs(w, inventory.selection, capture);
    const manifestId = await writeStartingManifest({ store: w.workspace, capture });
    await sourceTransactionHook('starting-review-manifest');
    await assertInputs(w, inventory.selection, capture);
    const payload = { kind: 'unharness-user-source', role: 'start-review', schemaVersion: 1, scopeId: w.scopeId,
      capturedAt: new Date().toISOString(), declaration, manifestId, captureGuard: startingCaptureGuard(capture),
      selection: inventory.selection, conditions: { ...START_CONDITIONS } };
    try { recordId('input', payload); }
    catch { fail('starting-files-limit'); }
    let reviewId;
    try {
      reviewId = await record(w.workspace, 'input', Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'kind')));
      await sourceTransactionHook('starting-review-recorded');
      return startReviewSummary(await loadStartReview(w, reviewId));
    } catch { fail('starting-publication-uncertain'); }
  });
}
export async function saveUserStart(args) {
  request(args, ['reviewId']);
  return locked(args.workspace, async w => {
    const review = await loadStartReview(w, args.reviewId);
    const payload = { kind: 'unharness-user-source', role: 'saved-start', schemaVersion: 1, scopeId: review.scopeId, reviewId: review.reviewId };
    const startId = recordId('experiment', payload);
    let exists = false;
    try { await readRecord({ store: w.workspace, type: 'experiment', id: startId }); exists = true; }
    catch (e) { if (e.kind !== 'record-not-found') fail('starting-record-invalid'); }
    if (exists) return (await loadSavedStart(w, startId)).summary;
    await assertInputs(w, review.selection, review.captureGuard);
    try {
      await record(w.workspace, 'experiment', Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'kind')));
      await sourceTransactionHook('starting-save-recorded');
      return (await loadSavedStart(w, startId)).summary;
    } catch { fail('starting-publication-uncertain'); }
  });
}
export async function readUserStart(args) {
  request(args, ['startId']);
  const { review, summary } = await loadSavedStart(await openWorkspace(args.workspace), args.startId);
  return { ...summary, inputIntegrity: 'verified', declaration: review.declaration, files: startReviewSummary(review).files };
}
export async function listUserStarts(args) {
  request(args, [], ['after']);
  if (args.after !== undefined && !hash(args.after)) fail('invalid-request');
  const w = await openWorkspace(args.workspace), starts = [];
  let after = args.after;
  try {
    do {
      const page = await listRecordPage({ store: w.workspace, type: 'experiment', ...(after === undefined ? {} : { after }) });
      for (const [i, entry] of page.records.entries()) {
        if (entry.payload.role !== 'saved-start') continue;
        starts.push((await loadSavedStart(w, entry.id, false)).summary);
        if (starts.length === 20) return { starts, nextCursor: i < page.records.length - 1 || page.nextCursor !== null ? entry.id : null };
      }
      after = page.nextCursor;
    } while (after !== null);
    return { starts, nextCursor: null };
  } catch { fail('starting-record-invalid'); }
}
