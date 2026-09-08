import { isDeepStrictEqual } from 'node:util';
import { dirname } from 'node:path';
import { loadRecord } from '../sources/records.mjs';
import { validUtc } from '../sources/observation-record.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { validateDeclaration } from './declaration.mjs';
import { readStartingManifest, readStartingManifestIndex } from './records.mjs';
import { validateStartingPaths } from './files.mjs';
import { fail } from '../sources/errors.mjs';

export const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const invalid = () => fail('starting-record-invalid');
const shape = (x, keys) => exactKeys(x, keys, [], 'starting-record-invalid');
export const START_CONDITIONS = Object.freeze({
  memorySettings: 'retained', nativeContinuity: 'retained', memoryInputs: 'uncontrolled',
  liveTools: 'uncontrolled', caches: 'uncontrolled', externalState: 'uncontrolled'
});
function identity(x) {
  shape(x, ['dev', 'ino']);
  if (![x.dev, x.ino].every(v => Number.isSafeInteger(v) && v >= 0)) invalid();
}
function validateGuard(guard, manifest, project) {
  shape(guard, ['project', 'totalBytes', 'guards', 'files']);
  if (guard.project !== project || guard.totalBytes !== manifest.totalBytes
    || !isDeepStrictEqual(guard.files, manifest.files.map(({ chunks, ...f }) => f))) invalid();
  const guards = guard.guards;
  shape(guards, ['root', 'dirs', 'entries']); identity(guards.root);
  if (!Array.isArray(guards.dirs) || !Array.isArray(guards.entries) || guards.entries.length !== manifest.files.length) invalid();
  const directories = new Set();
  for (const f of manifest.files) {
    let parent = dirname(f.path);
    while (parent !== '.') { directories.add(parent); parent = dirname(parent); }
  }
  const expected = [...directories].sort();
  if (guards.dirs.length !== expected.length) invalid();
  for (const [i, d] of guards.dirs.entries()) {
    shape(d, ['path', 'identity']);
    if (d.path !== expected[i]) invalid();
    if (d.identity !== null) identity(d.identity);
    else if (manifest.files.some(f => f.present && f.path.startsWith(d.path + '/'))) invalid();
  }
  for (const [i, g] of guards.entries.entries()) {
    shape(g, ['path', 'identity']); const f = manifest.files[i];
    if (g.path !== f.path) invalid();
    if (!f.present) { if (g.identity !== null) invalid(); continue; }
    shape(g.identity, ['dev', 'ino', 'size', 'mode', 'uid', 'gid', 'nlink', 'mtimeMs', 'ctimeMs']);
    const s = g.identity;
    identity({ dev: s.dev, ino: s.ino });
    if (s.size !== f.size || !Number.isInteger(s.mode) || (s.mode & 0o170000) !== 0o100000 || (s.mode & 0o777) !== f.meta.mode
      || s.uid !== f.meta.uid || s.gid !== f.meta.gid || s.nlink !== 1
      || !Number.isFinite(s.mtimeMs) || !Number.isFinite(s.ctimeMs)) invalid();
  }
}
export async function loadStartReview(w, reviewId, checkChunks = true) {
  try {
    if (!hash(reviewId)) invalid();
    const p = await loadRecord(w.workspace, 'input', reviewId);
    shape(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'capturedAt', 'declaration', 'manifestId', 'captureGuard', 'selection', 'conditions']);
    if (p.role !== 'start-review' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !validUtc(p.capturedAt)
      || !isDeepStrictEqual(p.conditions, START_CONDITIONS)) invalid();
    const declaration = validateDeclaration(p.declaration);
    shape(p.selection, ['kind', 'gitMetadata', 'ignoredFiles', 'retainedProjectInputs', 'additionalPaths']);
    if (!['directory-working-files', 'git-working-files'].includes(p.selection.kind)
      || p.selection.gitMetadata !== 'excluded' || p.selection.retainedProjectInputs !== 'included'
      || p.selection.ignoredFiles !== (p.selection.kind === 'git-working-files' ? 'excluded' : 'not-applicable')
      || !isDeepStrictEqual(p.selection.additionalPaths, validateStartingPaths(p.selection.additionalPaths))) invalid();
    const manifest = await (checkChunks ? readStartingManifest : readStartingManifestIndex)({ store: w.workspace, manifestId: p.manifestId });
    validateGuard(p.captureGuard, manifest, w.reg.context.project);
    if (p.selection.additionalPaths.some(path => !manifest.files.some(f => f.path === path))) invalid();
    return { ...p, declaration, reviewId, manifest };
  } catch { invalid(); }
}
export function startReviewSummary(p) {
  const { request, title = null, ...criteria } = p.declaration;
  return { reviewId: p.reviewId, scopeId: p.scopeId, capturedAt: p.capturedAt, title, criteria,
    requestBytes: Buffer.byteLength(request), selection: p.selection, conditions: { ...START_CONDITIONS },
    totalBytes: p.manifest.totalBytes, fileCount: p.manifest.files.filter(f => f.present).length,
    absentCount: p.manifest.files.filter(f => !f.present).length,
    files: p.manifest.files.map(({ path, size, present, sha256 }) => ({ path, size, present, sha256 })) };
}
export function savedStartSummary(p, startId) {
  const { files, capturedAt, ...summary } = startReviewSummary(p);
  return { ...summary, startId, frozenAt: capturedAt, inputIntegrity: 'not-rechecked' };
}
export async function loadSavedStart(w, startId, checkChunks = true) {
  try {
    if (!hash(startId)) invalid();
    const p = await loadRecord(w.workspace, 'experiment', startId);
    shape(p, ['kind', 'role', 'schemaVersion', 'scopeId', 'reviewId']);
    if (p.role !== 'saved-start' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !hash(p.reviewId)) invalid();
    const review = await loadStartReview(w, p.reviewId, checkChunks);
    return { review, summary: { ...savedStartSummary(review, startId), inputIntegrity: checkChunks ? 'verified' : 'not-rechecked' } };
  } catch { invalid(); }
}
