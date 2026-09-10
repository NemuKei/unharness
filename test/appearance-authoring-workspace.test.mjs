import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { readUserAppearance } from '../src/appearances/service.mjs';
import { fixtureAiClient } from '../test-support/ai-client.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
const authoring = await import('../src/appearances/authoring.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });

async function prepare(p, input = { creationId: randomUUID(), baseItemId: null }) {
  assert.equal(typeof authoring.prepareAppearanceAuthoring, 'function');
  return authoring.prepareAppearanceAuthoring({ workspace: p.workspace, ...input });
}
test('an issued local creation place reopens without changing existing drafts or configuration', async t => {
  const p = await aiProfile(t), input = { creationId: randomUUID(), baseItemId: null }, place = await prepare(p, input);
  assert.equal(place.files.length, 13); assert.equal(place.referenceFiles.length, 13);
  const entity = place.files.find(file => file.partId === 'entity');
  assert.equal(entity.path, join(place.directory, 'entity.png'));
  const bytes = PNG.sync.write({ width: 1, height: 1, data: Buffer.from([60, 200, 230, 255]) });
  await writeFile(entity.path, bytes);
  assert.deepEqual(await prepare(p, input), place);
  assert.deepEqual(await readFile(entity.path), bytes);
  const reviewed = await authoring.reviewAuthoredAppearance({ workspace: p.workspace, authoringId: place.authoringId, importId: randomUUID(),
    expectedStateId: null, name: 'Local authored entity', author: '', partIds: ['entity'] });
  assert.deepEqual(reviewed.replacedParts, ['entity']);
  assert.equal((await readUserAppearance({ workspace: p.workspace })).state, null);
  assert.deepEqual(await readFile(entity.path), bytes);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});
test('authoring imports refuse links, unknown parts and independent ownership edits', async t => {
  const p = await aiProfile(t), place = await prepare(p), entity = place.files.find(file => file.partId === 'entity').path;
  const outside = join(p.parent, 'private-note.txt'); await writeFile(outside, 'PRIVATE TEST DATA');
  await symlink(outside, entity);
  const args = { workspace: p.workspace, authoringId: place.authoringId, importId: randomUUID(), expectedStateId: null,
    name: 'Selected source', author: '', partIds: ['entity'] };
  await assert.rejects(authoring.reviewAuthoredAppearance(args));
  await assert.rejects(authoring.reviewAuthoredAppearance({ ...args, partIds: ['../../private-note'] }));
  assert.equal(await readFile(outside, 'utf8'), 'PRIVATE TEST DATA');
  await unlink(entity);
  const marker = join(place.directory, 'authoring.json'); await writeFile(marker, 'INDEPENDENT EDIT');
  await assert.rejects(authoring.readAppearanceAuthoring({ workspace: p.workspace, authoringId: place.authoringId }));
  assert.equal(await readFile(marker, 'utf8'), 'INDEPENDENT EDIT');
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});
test('MCP can prepare, review and save explicit local parts without taking arbitrary paths', async t => {
  const p = await aiProfile(t), ai = await fixtureAiClient(t, p.workspace);
  const place = await ai.mutate('prepare_appearance_authoring', { creationId: randomUUID(), baseItemId: null });
  const checked = await ai.call('read_appearance_authoring', { authoringId: place.authoringId });
  assert.deepEqual(checked.files, place.files);
  const entity = place.files.find(file => file.partId === 'entity');
  await writeFile(entity.path, PNG.sync.write({ width: 1, height: 1, data: Buffer.from([230, 160, 80, 255]) }));
  const reviewed = await ai.mutate('review_authored_appearance', { authoringId: place.authoringId, importId: randomUUID(), expectedStateId: null,
    name: 'MCP authored version', author: '', partIds: ['entity'] });
  const saved = await ai.mutate('save_appearance_import', { reviewId: reviewed.reviewId, expectedStateId: null });
  assert.equal((await ai.call('read_appearance')).selectedItem.id, saved.savedItemId);
  assert.deepEqual(await readSourceProfileFiles(p.context), p.originalFiles);
});
test('a changed ownership marker during issuance is preserved and makes the result unverified', async t => {
  const p = await aiProfile(t), input = { creationId: randomUUID(), baseItemId: null }, first = await prepare(p, input);
  const marker = join(first.directory, 'authoring.json');
  setSourceTransactionTestHook(async phase => { if (phase === 'appearance-authoring-issued') await writeFile(marker, 'INDEPENDENT OWNERSHIP EDIT'); });
  t.after(() => setSourceTransactionTestHook(null));
  await assert.rejects(prepare(p, input), { kind: 'appearance-authoring-invalid' });
  assert.equal(await readFile(marker, 'utf8'), 'INDEPENDENT OWNERSHIP EDIT');
});
