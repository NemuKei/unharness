import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadRecord, loadSnapshot, activeNormalId } from '../sources/records.mjs';
import { preparationMetadata, validUtc } from '../sources/observation-record.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail, USER_SOURCE_ERROR_KINDS } from '../sources/errors.mjs';
import { replayConditionsIdentity } from '../codex/replay-conditions.mjs';
import { validateReplayRepository } from './repository.mjs';
import { readStartingManifestIndex } from './records.mjs';
import { hash, loadSavedStart, validateStartingCaptureGuard } from './start-records.mjs';
import { replayRelativePath } from './variant.mjs';
import { digestBytes } from './files.mjs';
import { validateReplayGitGuard } from './replay-git.mjs';

const invalid = () => fail('replay-record-invalid');
const shape = (value, keys) => exactKeys(value, ['kind', 'role', 'schemaVersion', 'scopeId', ...keys], [], 'replay-record-invalid');
const absent = path => ({ path, present: false, size: 0, sha256: null, meta: null });
const fileSummary = ({ chunks, ...file }) => file;
const sourceFile = (path, file) => file === null ? absent(path) : { path, present: true,
  size: Buffer.byteLength(file.text), sha256: digestBytes(Buffer.from(file.text)), meta: file.meta };
export function replaySourceBinding(w) {
  const boundary = preparationMetadata(w.state);
  if (boundary.issue || !['normal', 'unseal', 'trueform'].includes(w.state.preparedMode)) fail('replay-preparation-stale');
  return { normalId: activeNormalId(w), snapshotId: w.state.snapshotId, snapshotVersion: w.state.snapshotVersion ?? 1,
    revision: w.state.revision, preparedMode: w.state.preparedMode, preparation: boundary.preparation };
}
function binding(b) {
  exactKeys(b, ['normalId', 'snapshotId', 'snapshotVersion', 'revision', 'preparedMode', 'preparation'], [], 'replay-record-invalid');
  if (!hash(b.normalId) || !hash(b.snapshotId) || ![1, 2].includes(b.snapshotVersion) || !Number.isSafeInteger(b.revision)
    || b.revision < 0 || !['normal', 'unseal', 'trueform'].includes(b.preparedMode) || preparationMetadata(b).issue) invalid();
}
export async function loadReplaySeries(w, seriesId) {
  try {
    const p = await loadRecord(w.workspace, 'experiment', seriesId);
    shape(p, ['startId', 'pinnedAt', 'repository']);
    if (p.role !== 'replay-series' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !hash(p.startId)
      || !validUtc(p.pinnedAt) || p.repository?.project !== w.reg.context.project) invalid();
    validateReplayRepository(p.repository);
    return { ...p, seriesId };
  } catch { invalid(); }
}
export async function loadReplayNative(w, id, project) {
  try {
    const p = await loadRecord(w.workspace, 'observation', id);
    shape(p, ['value']);
    if (p.role !== 'replay-native' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId
      || !isDeepStrictEqual(p.value.context, { ...w.reg.context, project })) invalid();
    replayConditionsIdentity(p.value);
    return p.value;
  } catch { invalid(); }
}
async function validateVariant(w, value, snapshot, project, baseManifestId) {
  exactKeys(value, ['baseManifestId', 'manifestId', 'sourceMappings', 'changes', 'expectedSources'], [], 'replay-record-invalid');
  if (value.baseManifestId !== baseManifestId || !hash(value.manifestId) || !Array.isArray(value.sourceMappings)
    || !Array.isArray(value.changes) || !Array.isArray(value.expectedSources)) invalid();
  const base = await readStartingManifestIndex({ store: w.workspace, manifestId: baseManifestId });
  const variant = await readStartingManifestIndex({ store: w.workspace, manifestId: value.manifestId });
  const expectedById = new Map(), sources = [ ...(w.reg.instructions ? [{ ...w.reg.instructions, category: 'instructions' }] : []),
    ...w.reg.skills.map(s => ({ ...s, category: 'skill' })) ];
  if (value.expectedSources.length !== sources.length) invalid();
  for (const e of value.expectedSources) {
    const source = sources.find(s => s.id === e.sourceId);
    if (!source || e.category !== source.category || expectedById.has(e.sourceId)) invalid();
    exactKeys(e, e.category === 'skill' ? ['sourceId', 'category', 'expected', 'name', 'path'] : ['sourceId', 'category', 'expected', 'text'], [], 'replay-record-invalid');
    if (e.category === 'skill' ? !['disabled', 'manual-only', 'automatic-catalog'].includes(e.expected) || e.path !== source.path || e.name !== source.identity.name
      : !['saved-instructions', 'minimal-guide', 'inert-instructions'].includes(e.expected) || typeof e.text !== 'string' || Buffer.byteLength(e.text) > 128 * 1024) invalid();
    expectedById.set(e.sourceId, e);
  }
  const repoSkills = w.reg.skills.filter(s => s.identity.scope === 'repo');
  if (value.sourceMappings.length !== repoSkills.length) invalid();
  const mapped = new Set();
  for (const m of value.sourceMappings) {
    exactKeys(m, ['sourceId', 'sourcePath', 'path', 'expected', 'strategy'], [], 'replay-record-invalid');
    const s = repoSkills.find(s => s.id === m.sourceId), e = expectedById.get(m.sourceId);
    if (!s || mapped.has(s.id) || m.sourcePath !== s.path || m.path !== join(project, replayRelativePath(w.reg.context.project, s.path))
      || m.expected !== e.expected || m.strategy !== (e.expected === 'disabled' ? 'omit-entrypoints' : 'copy-entrypoints')) invalid();
    mapped.add(s.id);
  }
  const files = new Map(base.files.map(f => [f.path, fileSummary(f)])), changed = new Set();
  for (const c of value.changes) {
    exactKeys(c, ['sourceId', 'path', 'reason', 'before', 'after'], [], 'replay-record-invalid');
    const s = repoSkills.find(s => s.id === c.sourceId);
    if (!s || changed.has(c.path) || !isDeepStrictEqual(c.before, files.get(c.path) ?? absent(c.path))) invalid();
    const path = replayRelativePath(w.reg.context.project, s.path);
    if (c.reason === 'prepared-skill-policy') {
      if (c.path !== dirname(path) + '/agents/openai.yaml'
        || !isDeepStrictEqual(c.after, sourceFile(c.path, snapshot[s.id + ':policy']))) invalid();
    } else if (c.reason !== 'disabled-skill-entrypoint' || expectedById.get(s.id).expected !== 'disabled'
      || ![path, dirname(path) + '/SKILL.json'].includes(c.path) || !isDeepStrictEqual(c.after, absent(c.path))) invalid();
    changed.add(c.path); files.set(c.path, c.after);
  }
  const rebuilt = [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (!isDeepStrictEqual(rebuilt, variant.files.map(fileSummary))) invalid();
  return variant;
}
export async function loadReplayReview(w, reviewId) {
  try {
    if (!hash(reviewId)) invalid();
    const p = await loadRecord(w.workspace, 'experiment', reviewId);
    shape(p, ['startId', 'seriesId', 'createdAt', 'locationId', 'sourceBinding', 'nativeId', 'variant', 'retainedGuard']);
    if (p.role !== 'replay-review' || p.schemaVersion !== 1 || p.scopeId !== w.scopeId || !validUtc(p.createdAt)
      || !hash(p.locationId) || !hash(p.nativeId)) invalid();
    binding(p.sourceBinding);
    const series = await loadReplaySeries(w, p.seriesId);
    if (series.startId !== p.startId) invalid();
    const saved = await loadSavedStart(w, p.startId, false);
    const snapshot = await loadSnapshot(w.workspace, w.reg, p.sourceBinding.snapshotId, p.sourceBinding.snapshotVersion);
    await loadSnapshot(w.workspace, w.reg, p.sourceBinding.normalId);
    const project = join(w.workspace, 'replays', p.locationId, 'work');
    const manifest = await validateVariant(w, p.variant, snapshot, project, saved.review.manifestId);
    const native = await loadReplayNative(w, p.nativeId, w.reg.context.project);
    if (!p.retainedGuard || p.retainedGuard.project !== w.reg.context.project) invalid();
    // Retained paths may include captured absences absent from the working-file
    // manifest. Validate this self-contained guard with the same strict grammar.
    validateStartingCaptureGuard(p.retainedGuard, { files: p.retainedGuard.files, totalBytes: p.retainedGuard.totalBytes }, w.reg.context.project);
    return { ...p, reviewId, series, saved, project, manifest, native, snapshot };
  } catch { invalid(); }
}
export async function loadReplayAttempt(w, entry) {
  try {
    const p = await loadRecord(w.workspace, 'experiment', entry.stateId);
    shape(p, ['attemptId', 'reviewId', 'previousStateId', 'phase', 'createdAt', 'updatedAt', 'preparedAt', 'readyAt', 'cancelledAt', 'failure', 'captureGuard', 'gitGuard', 'nativeId', 'match', ...(p.schemaVersion === 2 ? ['resultId'] : [])]);
    if (p.role !== 'replay-attempt' || ![1, 2].includes(p.schemaVersion) || p.scopeId !== w.scopeId || p.attemptId !== entry.attemptId
      || p.reviewId !== p.attemptId || !(p.previousStateId === null || hash(p.previousStateId))
      || !(p.schemaVersion === 1 ? ['preparing', 'prepared', 'ready', 'preparation-failed', 'cancelled'].includes(p.phase) : p.phase === 'recorded' && hash(p.resultId))
      || !validUtc(p.createdAt) || !validUtc(p.updatedAt) || Date.parse(p.updatedAt) < Date.parse(p.createdAt)
      || [p.preparedAt, p.readyAt, p.cancelledAt].some(x => x !== null && !validUtc(x))
      || !(p.failure === null || USER_SOURCE_ERROR_KINDS.includes(p.failure))) invalid();
    const review = await loadReplayReview(w, p.reviewId);
    if (['prepared', 'ready', 'recorded'].includes(p.phase) && !p.preparedAt || ['ready', 'recorded'].includes(p.phase) && !p.readyAt
      || p.phase === 'cancelled' && !p.cancelledAt || p.phase === 'preparation-failed' && !p.failure
      || !['cancelled', 'recorded'].includes(p.phase) && p.cancelledAt !== null || !p.preparedAt && p.readyAt !== null) invalid();
    if (p.preparedAt) {
      validateStartingCaptureGuard(p.captureGuard, review.manifest, review.project);
      validateReplayGitGuard(p.gitGuard, review.series.repository);
      await loadReplayNative(w, p.nativeId, review.project);
      if (!p.match || p.match.status !== 'matched' || p.match.desktopRuntimeVerified !== false
        || !hash(p.match.retainedConditionsDigest)) invalid();
    } else if (p.captureGuard !== null || p.gitGuard !== null || p.nativeId !== null || p.match !== null) invalid();
    if (p.phase === 'recorded') {
      const result = await loadRecord(w.workspace, 'application', p.resultId);
      if (result.role !== 'replay-result' || result.schemaVersion !== 1 || result.scopeId !== w.scopeId || result.attemptId !== p.attemptId) invalid();
    }
    return { ...p, stateId: entry.stateId, review };
  } catch { invalid(); }
}
export async function loadReplayAttempts(w, index) {
  const attempts = [];
  for (const entry of index.data.attempts) attempts.push(await loadReplayAttempt(w, entry));
  const active = attempts.filter(a => ['preparing', 'prepared', 'ready'].includes(a.phase));
  if (active.length > 1 || (active[0]?.attemptId ?? null) !== index.data.activeAttemptId) invalid();
  return attempts;
}
export function replayReviewSummary(review) {
  const variant = review.variant;
  return { reviewId: review.reviewId, startId: review.startId, scopeId: review.scopeId, phase: 'reviewed',
    preparedMode: review.sourceBinding.preparedMode, snapshotId: review.sourceBinding.snapshotId,
    revision: review.sourceBinding.revision, createdAt: review.createdAt,
    budget: { ...review.saved.review.declaration.budget },
    repositoryKind: review.series.repository.kind, gitPinnedAt: review.series.pinnedAt,
    gitRevision: review.series.repository.head ?? null, fileCount: review.manifest.files.filter(f => f.present).length,
    totalBytes: review.manifest.totalBytes, sourceMappings: variant.sourceMappings.map(({ sourceId, expected, strategy }) => ({ sourceId, expected, strategy })),
    changes: variant.changes.map(({ sourceId, path, reason }) => ({ sourceId, path, reason })),
    desktopRuntimeVerified: false };
}
