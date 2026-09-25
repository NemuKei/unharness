// Explicit record-only adoption of one externally replaced registered Skill.
import { dirname, join } from 'node:path';
import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace, loadSnapshot, loadNormal, activeNormalId, saveSnapshot, record, readJson,
  writeJson, unlink, newPreparation } from './records.mjs';
import { captureFile, parentBinding, checkBinding, equal } from './platform.mjs';
import { acquire, pending, assertCurrent, sourceTransactionHook } from './transaction.mjs';
import { replacedSkillIdentity } from './replaced-source-identity.mjs';
import { hash } from './capture.mjs';
import { fail, verification } from './errors.mjs';
import { replacementRegistration, replacementState, replacementManifest, loadReplacementReview,
  replacementSummary } from './replaced-source-records.mjs';

const request = (args, required, optional = []) => exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
const parts = ['body', 'policy', 'format'];
async function locked(workspace, action) {
  if (process.platform !== 'darwin') fail('unsupported-platform');
  const initial = await openWorkspace(workspace), release = await acquire(initial);
  try {
    const w = await openWorkspace(workspace);
    if (initial.scopeId !== w.scopeId) fail('stale-review');
    if (await pending(workspace)) fail('recovery-required');
    return await action(w);
  } finally { await release(); }
}
async function idle(w) {
  const { loadReplayIndex } = await import('../experiments/replay-index.mjs');
  if ((await loadReplayIndex(w)).data.activeAttemptId !== null) fail('replay-active-attempt');
  const { readAppearanceStore } = await import('../appearances/store.mjs');
  if ((await readAppearanceStore({ ...w, scopeId: w.rootScopeId })).journal !== null) fail('appearance-recovery-required');
}
function withTarget(files, oldId, newId, targetFiles) {
  const result = { ...files };
  for (const part of parts) delete result[oldId + ':' + part];
  for (const part of parts) result[newId + ':' + part] = targetFiles[part];
  return result;
}
async function target(w, sourceId) {
  const source = w.reg.skills.find(s => s.id === sourceId);
  if (!source) fail('replaced-source-unavailable');
  const candidate = await replacedSkillIdentity(w.reg, sourceId + ':body');
  if (!candidate) {
    await checkBinding(w.reg.bindings[sourceId + ':body']);
    fail('replaced-source-unavailable');
  }
  const path = dirname(source.path), paths = { body: source.path,
    policy: join(path, 'agents', 'openai.yaml'), format: join(path, 'SKILL.json') };
  const files = {}, bindings = { ...w.reg.bindings };
  for (const part of parts) {
    files[part] = await captureFile(paths[part]);
    bindings[sourceId + ':' + part] = await parentBinding(paths[part]);
  }
  if (!files.body) fail('source-redirection');
  const after = await replacedSkillIdentity(w.reg, sourceId + ':body');
  if (!after || !equal(after.current, candidate.current)) fail('stale-review');
  const { catalog, catalogIdentity } = await import('../codex/catalog.mjs');
  const native = await catalog(w.reg.context);
  const selected = native.skills.filter(s => s.path === source.path);
  if (selected.length !== 1 || selected[0].scope !== source.identity.scope
    || (selected[0].pluginId ?? null) !== source.pluginId) fail('stale-review');
  const identity = catalogIdentity(selected[0]);
  const normal = await loadNormal(w.workspace, w.reg, activeNormalId(w));
  const normalFiles = { body: files.body, policy: normal[sourceId + ':policy'], format: files.format };
  const sourceDigest = hash(normalFiles);
  const nextId = 'skill-' + hash({ identity, sourceDigest });
  const nextSkill = { ...source, id: nextId, label: selected[0].name, identity, sourceDigest };
  if (nextId !== sourceId) {
    for (const part of parts) {
      bindings[nextId + ':' + part] = bindings[sourceId + ':' + part];
      delete bindings[sourceId + ':' + part];
    }
  }
  const ownedDirs = w.state.ownedDirs.filter(d => !d.path.startsWith(path + '/'));
  return { source, nextSkill, files, normalFiles, bindings, ownedDirs, directory: candidate.current };
}
function candidateWorkspace(w, p, reg, state) { return { ...w, reg, state }; }
async function assertReviewedCurrent(w, p, reg, state, expectedManifest = w.manifest) {
  try {
    const current = await target(w, p.sourceId);
    if (!equal(current.nextSkill, p.newSkill) || !equal(current.files, p.targetFiles)
      || !equal(current.normalFiles, p.normalFiles)
      || !equal(current.bindings, p.bindings) || !equal(current.ownedDirs, p.ownedDirs)) fail('stale-review');
    const expected = await loadSnapshot(w.workspace, reg, p.observedId, 2);
    await assertCurrent(candidateWorkspace(w, p, reg, state), expected);
    const reopened = await openWorkspace(w.workspace);
    if (reopened.scopeId !== w.scopeId || !equal(reopened.reg, w.reg) || !equal(reopened.state, w.state)
      || !equal(reopened.manifest, expectedManifest)) fail('stale-review');
  } catch { fail('stale-review'); }
}

export async function reviewReplacedSource(args) {
  request(args, ['sourceId']);
  return locked(args.workspace, async w => {
    await idle(w);
    const t = await target(w, args.sourceId);
    const normal = await loadNormal(w.workspace, w.reg, activeNormalId(w));
    const current = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
    const bodyChanged = normal[t.source.id + ':body']?.text !== t.files.body.text
      || t.source.sourceDigest !== t.nextSkill.sourceDigest || !equal(t.source.identity, t.nextSkill.identity);
    const missingPreparedFiles = ['policy', 'format'].filter(part => current[t.source.id + ':' + part] !== null && t.files[part] === null);
    const candidate = { ...w.reg, skills: w.reg.skills.map(s => s.id === t.source.id ? t.nextSkill : s), bindings: t.bindings };
    const nextState = { ...w.state, ownedDirs: t.ownedDirs };
    const after = withTarget(current, t.source.id, t.nextSkill.id, t.files);
    await assertCurrent(candidateWorkspace(w, null, candidate, nextState), after);
    const nextNormal = withTarget(normal, t.source.id, t.nextSkill.id, t.normalFiles);
    const normalId = await saveSnapshot(w.workspace, candidate, nextNormal, 2);
    const observedId = await saveSnapshot(w.workspace, candidate, after, 2);
    const reviewId = await record(w.workspace, 'input', { role: 'replaced-source-review', schemaVersion: 1,
      scopeId: w.scopeId, rootScopeId: w.rootScopeId, beforeState: w.state, beforeManifest: w.manifest,
      sourceId: t.source.id, newSkill: t.nextSkill, targetFiles: t.files, normalFiles: t.normalFiles,
      bodyChanged, missingPreparedFiles,
      bindings: t.bindings, ownedDirs: t.ownedDirs, normalId, observedId, reviewedAt: new Date().toISOString() });
    const p = await loadReplacementReview(w, reviewId);
    await assertReviewedCurrent(w, p, replacementRegistration(w.reg, p, reviewId), nextState);
    return { ...replacementSummary(p), verification };
  });
}

export async function applyReplacedSource(args) {
  request(args, ['reviewId', 'confirmedNewLocation'], ['confirmedChangedContent']);
  if (args.confirmedNewLocation !== true || args.confirmedChangedContent !== undefined && typeof args.confirmedChangedContent !== 'boolean')
    fail('replaced-source-confirmation-required');
  return locked(args.workspace, async w => {
    const p = await loadReplacementReview(w, args.reviewId);
    if (p.bodyChanged && args.confirmedChangedContent !== true) fail('replaced-source-confirmation-required');
    const reg = replacementRegistration(p.before.reg, p, p.reviewId);
    const nextScopeId = await record(w.workspace, 'scope', reg);
    const result = duplicate => ({ ...replacementSummary(p), scopeId: p.scopeId, nextScopeId,
      nextNormalId: p.normalId, sourceFilesChanged: 0, previousScopeId: p.scopeId,
      revision: p.beforeState.revision + 1, adopted: true, duplicate, modeChangeRequired: true, verification });
    if (w.state.lastReplacedSourceReviewId === p.reviewId && w.scopeId === nextScopeId) {
      const expected = await loadSnapshot(w.workspace, reg, p.observedId, 2);
      await assertCurrent(w, expected);
      return result(true);
    }
    if (w.scopeId !== p.scopeId || !equal(w.state, p.beforeState) || !equal(w.manifest, p.beforeManifest)) fail('stale-review');
    await idle(w);
    const afterManifest = replacementManifest(p), afterState = replacementState(w.state, p, nextScopeId, newPreparation());
    await assertReviewedCurrent(w, p, reg, afterState);
    const journal = { kind: 'unharness-user-source-replaced-pending', scopeId: w.scopeId,
      reviewId: p.reviewId, nextScopeId, beforeState: w.state, afterState,
      beforeManifest: w.manifest, afterManifest };
    const journalPath = join(w.workspace, 'pending.json');
    await writeJson(journalPath, journal, true);
    await sourceTransactionHook('replaced-source-journal');
    await assertReviewedCurrent(w, p, reg, afterState);
    if (!equal(await readJson(journalPath), journal)) fail('journal-invalid');
    await writeJson(join(w.workspace, 'registration.json'), afterManifest);
    await sourceTransactionHook('replaced-source-manifest');
    await assertReviewedCurrent(w, p, reg, afterState, afterManifest);
    if (!equal(await readJson(join(w.workspace, 'state.json')), w.state)
      || !equal(await readJson(join(w.workspace, 'registration.json')), afterManifest)
      || !equal(await readJson(journalPath), journal)) fail('journal-invalid');
    await writeJson(join(w.workspace, 'state.json'), afterState);
    await sourceTransactionHook('replaced-source-state');
    const published = await openWorkspace(w.workspace);
    if (!equal(published.reg, reg) || !equal(published.state, afterState)
      || !equal(await readJson(journalPath), journal)) fail('journal-invalid');
    await assertCurrent(published, await loadSnapshot(w.workspace, reg, p.observedId, 2));
    await unlink(journalPath);
    return result(false);
  });
}
