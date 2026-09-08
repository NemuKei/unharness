import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, rename, symlink } from 'node:fs/promises';
import { tmpdir, devNull } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as service from '../src/sources/service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { openWorkspace, loadRecord, record } from '../src/sources/records.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { readRecord, putRecord, listRecordPage } from '../src/core/local-store.mjs';

const execute = promisify(execFile);
const inventory = await import('../src/experiments/inventory.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const declaration = {
  title: 'Synthetic writing task', request: 'PRIVATE REQUEST\nUse the original files.',
  requirements: [{ id: 'complete', label: 'All requested material is included', critical: true }],
  ratings: [], budget: { maxAttempts: 2, maxTurnsPerAttempt: 3, maxRecordedTokens: 4000 }
};
const mac = { skip: process.platform !== 'darwin' };
async function fixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-start-conditions-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  t.after(() => setSourceTransactionTestHook(null));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const discovered = await service.discoverUserSources(owned.context);
  const registration = await service.registerUserSources({ context: owned.context, discoveryId: discovered.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  await writeFile(join(owned.context.project, 'work.txt'), 'original work');
  return { parent, ...owned, ...registration, project: owned.context.project };
}
async function git(project, args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return execute('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: project,
    env: { ...env, GIT_CONFIG_GLOBAL: devNull, GIT_CONFIG_NOSYSTEM: '1' } });
}
async function gitFixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-start-inventory-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project'); await mkdir(project);
  await git(project, ['init', '--template=']);
  await writeFile(join(project, '.gitignore'), '.private\n.codex/\n');
  await writeFile(join(project, 'tracked.txt'), 'indexed original');
  await writeFile(join(project, 'removed.txt'), 'removed original');
  await git(project, ['add', '.gitignore', 'tracked.txt', 'removed.txt']);
  await writeFile(join(project, 'tracked.txt'), 'uncommitted contents');
  await rm(join(project, 'removed.txt'));
  await writeFile(join(project, 'untracked.txt'), 'new working file');
  await writeFile(join(project, '.private'), 'explicit additional input');
  await mkdir(join(project, '.codex'));
  await writeFile(join(project, '.codex', 'config.toml'), '# required project configuration\n');
  return { project, parent };
}
test('Git inventory includes uncommitted, untracked and missing paths and retained project configuration', async t => {
  assert.equal(typeof inventory.inventoryStartingFiles, 'function');
  const { project } = await gitFixture(t);
  const result = await inventory.inventoryStartingFiles({ project });
  assert.deepEqual(result.paths, ['.codex/config.toml', '.gitignore', 'removed.txt', 'tracked.txt', 'untracked.txt']);
  assert.equal(result.selection.kind, 'git-working-files');
  assert.equal(result.selection.gitMetadata, 'excluded');
  assert.equal(result.selection.ignoredFiles, 'excluded');
  const additional = await inventory.inventoryStartingFiles({ project, additionalPaths: ['.private'] });
  assert.ok(additional.paths.includes('.private'));
  assert.equal(additional.paths.some(path => path.startsWith('.git/')), false);
  assert.equal(await readFile(join(project, 'tracked.txt'), 'utf8'), 'uncommitted contents');
});
test('inventory refuses nested roots and redirected supplemental paths without reading outside the selected project', { skip: process.platform === 'win32' }, async t => {
  assert.equal(typeof inventory.inventoryStartingFiles, 'function');
  const { project, parent } = await gitFixture(t);
  const child = join(project, 'child'); await mkdir(child);
  await assert.rejects(inventory.inventoryStartingFiles({ project: child }), { kind: 'starting-project-root-required' });
  await symlink(parent, join(project, 'external'));
  await assert.rejects(inventory.inventoryStartingFiles({ project, additionalPaths: ['external/private'] }), { kind: 'starting-files-unsupported' });
  await assert.rejects(inventory.inventoryStartingFiles({ project, additionalPaths: ['../private'] }), { kind: 'starting-path-invalid' });
});
test('saving a frozen start rejects intervening file changes, stays immutable and never changes source state', mac, async t => {
  assert.equal(typeof service.reviewUserStart, 'function');
  const s = await fixture(t), { workspace, project } = s;
  const w = await openWorkspace(workspace), sourceBefore = await captureRegistered(w.reg);
  const stateBefore = await readFile(join(workspace, 'state.json'), 'utf8');
  const review = await service.reviewUserStart({ workspace, declaration });
  assert.deepEqual(review.files.map(f => f.path), ['AGENTS.md', 'work.txt']);
  assert.equal(JSON.stringify(review).includes('PRIVATE REQUEST'), false);
  await writeFile(join(project, 'work.txt'), 'independent edit');
  await assert.rejects(service.saveUserStart({ workspace, reviewId: review.reviewId }), { kind: 'starting-files-changed' });
  const next = await service.reviewUserStart({ workspace, declaration });
  const saved = await service.saveUserStart({ workspace, reviewId: next.reviewId });
  await writeFile(join(project, 'work.txt'), 'trial output');
  assert.deepEqual(await service.saveUserStart({ workspace, reviewId: next.reviewId }), saved);
  const detail = await service.readUserStart({ workspace, startId: saved.startId });
  assert.deepEqual(detail.declaration, declaration);
  assert.equal(detail.frozenAt, next.capturedAt);
  assert.equal(detail.files.find(f => f.path === 'work.txt').size, 16);
  assert.equal(detail.conditions.memorySettings, 'retained');
  assert.equal(detail.conditions.memoryInputs, 'uncontrolled');
  const list = await service.listUserStarts({ workspace });
  assert.equal(list.starts.length, 1);
  assert.equal(JSON.stringify(list).includes('PRIVATE REQUEST'), false);
  assert.equal(JSON.stringify(list).includes('independent edit'), false);
  assert.equal(JSON.stringify(list).includes('trial output'), false);
  assert.deepEqual(await captureRegistered(w.reg), sourceBefore);
  assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), stateBefore);
  await assert.rejects(readFile(join(workspace, 'pending.json')), { code: 'ENOENT' });
});
test('newly included files and changes during capture invalidate the review before a usable start is saved', mac, async t => {
  assert.equal(typeof service.reviewUserStart, 'function');
  const { workspace, project } = await fixture(t);
  let review = await service.reviewUserStart({ workspace, declaration });
  await writeFile(join(project, 'new.txt'), 'new independent file');
  await assert.rejects(service.saveUserStart({ workspace, reviewId: review.reviewId }), { kind: 'starting-files-changed' });
  setSourceTransactionTestHook(async phase => {
    if (phase === 'starting-review-captured') await writeFile(join(project, 'work.txt'), 'changed during capture');
  });
  await assert.rejects(service.reviewUserStart({ workspace, declaration }), { kind: 'starting-files-changed' });
  setSourceTransactionTestHook(null);
  assert.deepEqual(await service.listUserStarts({ workspace }), { starts: [], nextCursor: null });
});
test('cross-scope and malformed private records cannot be adopted as a saved start', mac, async t => {
  assert.equal(typeof service.reviewUserStart, 'function');
  const first = await fixture(t), second = await fixture(t);
  const review = await service.reviewUserStart({ workspace: first.workspace, declaration });
  const payload = await loadRecord(first.workspace, 'input', review.reviewId);
  await record(second.workspace, 'input', Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'kind')));
  await assert.rejects(service.saveUserStart({ workspace: second.workspace, reviewId: review.reviewId }), { kind: 'starting-record-invalid' });
  const { id: wrongRole } = await putRecord({ store: first.workspace, type: 'input', payload: { ...payload, role: 'run-review' } });
  await assert.rejects(service.saveUserStart({ workspace: first.workspace, reviewId: wrongRole }), { kind: 'starting-record-invalid' });
  await assert.rejects(service.reviewUserStart({ workspace: first.workspace, declaration, project: second.project }), { kind: 'invalid-request' });
  await assert.rejects(service.saveUserStart({ workspace: first.workspace, reviewId: review.reviewId, declaration }), { kind: 'invalid-request' });
});
test('an interrupted private publication is uncertain, discoverable and never alters configuration recovery', mac, async t => {
  assert.equal(typeof service.reviewUserStart, 'function');
  const { workspace } = await fixture(t);
  const review = await service.reviewUserStart({ workspace, declaration });
  setSourceTransactionTestHook(phase => { if (phase === 'starting-save-recorded') throw Error('lost reply'); });
  await assert.rejects(service.saveUserStart({ workspace, reviewId: review.reviewId }), { kind: 'starting-publication-uncertain' });
  setSourceTransactionTestHook(null);
  const list = await service.listUserStarts({ workspace });
  assert.equal(list.starts.length, 1);
  const state = await service.userSourceState({ workspace });
  assert.equal(state.recovery.pending, false);
  assert.equal(state.conflict, null);
  const detail = await service.readUserStart({ workspace, startId: list.starts[0].startId });
  const index = await readRecord({ store: workspace, type: 'experiment', id: detail.startId });
  const frozen = await loadRecord(workspace, 'input', index.reviewId);
  await writeFile(join(workspace, 'records', 'input', `${frozen.manifestId}.json`), '{}');
  await assert.rejects(service.readUserStart({ workspace, startId: detail.startId }), { kind: 'starting-record-invalid' });
  assert.equal((await service.userSourceState({ workspace })).conflict, null);
  assert.equal((await service.listUserRuns({ workspace })).runs.length, 0);
});
test('saved-start pages retain all captures without exposing request or file bodies', mac, async t => {
  assert.equal(typeof service.reviewUserStart, 'function');
  const { workspace } = await fixture(t);
  const ids = [];
  for (let i = 0; i < 21; i++) {
    const review = await service.reviewUserStart({ workspace, declaration: { ...declaration, title: `Start ${i}` } });
    ids.push((await service.saveUserStart({ workspace, reviewId: review.reviewId })).startId);
  }
  const first = await service.listUserStarts({ workspace });
  assert.equal(first.starts.length, 20); assert.ok(first.nextCursor);
  const second = await service.listUserStarts({ workspace, after: first.nextCursor });
  assert.equal(second.starts.length, 1); assert.equal(second.nextCursor, null);
  assert.deepEqual([...first.starts, ...second.starts].map(s => s.startId).sort(), ids.sort());
  assert.equal(JSON.stringify([first, second]).includes('PRIVATE REQUEST'), false);
  assert.equal((await listRecordPage({ store: workspace, type: 'experiment' })).records.length, 21);
});

test('a project containing its own private store is rejected before capture can recursively snapshot it', mac, async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-start-overlap-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const root = dirname(owned.context.codexHome), context = { ...owned.context, project: root };
  await writeFile(join(context.codexHome, '.unharness-owned-profile.json'), JSON.stringify({ root, codexHome: context.codexHome, project: root }));
  const d = await service.discoverUserSources(context);
  const { workspace } = await service.registerUserSources({ context, discoveryId: d.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
  const before = await readFile(join(workspace, 'state.json'), 'utf8');
  await assert.rejects(service.reviewUserStart({ workspace, declaration }), { kind: 'starting-project-contains-store' });
  assert.equal(await readFile(join(workspace, 'state.json'), 'utf8'), before);
  assert.equal((await listRecordPage({ store: workspace, type: 'input' })).records.length, 0);
});
