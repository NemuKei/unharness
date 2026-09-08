import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { lstat, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequestLedger } from '../src/ai/requests.mjs';
import { saveUserFavorite, listUserFavorites } from '../src/sources/service.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';

const request = (connectionId, input = { name: 'AI favorite' }) => ({ connectionId, requestId: randomUUID(), action: 'save', input });
const save = p => saveUserFavorite({ workspace: p.workspace, name: 'AI favorite' });

test('concurrent identical requests publish one favorite, and reconnect reads its result', async t => {
  const p = await aiProfile(t), connectionId = randomUUID();
  const ledger = await createRequestLedger({ workspace: p.workspace, connectionId });
  const r = request(connectionId);
  let calls = 0;
  const perform = () => { calls++; return save(p); };
  const [a, b] = await Promise.all([ledger.execute(r, perform), ledger.execute(r, perform)]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(a.state, 'completed');
  assert.ok(a.result.favoriteId);
  assert.equal((await listUserFavorites({ workspace: p.workspace })).favorites.length, 1);
  const other = await createRequestLedger({ workspace: p.workspace, connectionId: randomUUID() });
  assert.deepEqual(await other.execute(r, () => assert.fail('must not execute twice')), a);
  assert.deepEqual(await other.status(r.requestId), a);
  assert.equal((await lstat(join(p.workspace, 'ai-requests', r.requestId, 'request.json'))).mode & 0o777, 0o600);
  assert.ok(!(await readFile(join(p.workspace, 'ai-requests', r.requestId, 'request.json'), 'utf8')).includes('AI favorite'));
});

test('a killed process leaves its completed source save visible and its AI result unconfirmed', async t => {
  const p = await aiProfile(t), connectionId = randomUUID(), r = request(connectionId);
  const child = spawn(process.execPath, ['test-support/ai-interrupt.mjs', p.workspace, connectionId, r.requestId], { stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const exit = once(child, 'exit');
  const ready = once(child.stdout, 'data');
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  t.after(() => clearTimeout(timer));
  assert.equal(String((await Promise.race([ready, exit.then(() => { throw Error('child exited before save'); })]))[0]), 'saved\n');
  child.kill('SIGKILL');
  await exit;
  const resumed = await createRequestLedger({ workspace: p.workspace, connectionId: randomUUID() });
  assert.equal((await resumed.execute(r, () => assert.fail('must not replay interrupted request'))).state, 'unconfirmed');
  assert.equal((await listUserFavorites({ workspace: p.workspace })).favorites.length, 1);
});

test('request identity rejects changed arguments and old-connection new claims', async t => {
  const p = await aiProfile(t), connectionId = randomUUID();
  const ledger = await createRequestLedger({ workspace: p.workspace, connectionId });
  const r = request(connectionId);
  await ledger.execute(r, () => save(p));
  await assert.rejects(ledger.execute({ ...r, input: { name: 'different' } }, () => assert.fail()), { kind: 'ai-request-conflict' });
  const other = await createRequestLedger({ workspace: p.workspace, connectionId: randomUUID() });
  await assert.rejects(other.execute(request(connectionId), () => assert.fail()), { kind: 'ai-connection-changed' });
  await assert.rejects(other.execute({ ...r, workspace: p.parent }, () => assert.fail()), { kind: 'invalid-request' });
});

test('interruption after a real save leaves an unconfirmed claim that is never replayed', async t => {
  const p = await aiProfile(t), connectionId = randomUUID();
  const ledger = await createRequestLedger({ workspace: p.workspace, connectionId });
  const r = request(connectionId);
  await assert.rejects(ledger.execute(r, async () => { await save(p); throw Error('PRIVATE unexpected detail'); }), { kind: 'ai-operation-unconfirmed' });
  assert.equal((await ledger.status(r.requestId)).state, 'unconfirmed');
  const other = await createRequestLedger({ workspace: p.workspace, connectionId: randomUUID() });
  const response = await other.execute(r, () => assert.fail('unfinished work must not restart'));
  assert.equal(response.state, 'unconfirmed');
  assert.equal((await listUserFavorites({ workspace: p.workspace })).favorites.length, 1);
  assert.ok(!JSON.stringify(response).includes('PRIVATE'));
});

test('missing, corrupted and linked receipts cannot turn an old request into a new mutation', async t => {
  const p = await aiProfile(t), connectionId = randomUUID();
  const ledger = await createRequestLedger({ workspace: p.workspace, connectionId });
  const r = request(connectionId);
  await ledger.execute(r, () => save(p));
  const path = join(p.workspace, 'ai-requests', r.requestId);
  await writeFile(join(path, 'result.json'), '{"broken":true}');
  assert.equal((await ledger.execute(r, () => assert.fail())).state, 'unconfirmed');
  await rm(path, { recursive: true });
  assert.equal((await ledger.execute(r, () => assert.fail())).state, 'unconfirmed');
  const other = await createRequestLedger({ workspace: p.workspace, connectionId: randomUUID() });
  await assert.rejects(other.execute(r, () => assert.fail()), { kind: 'ai-connection-changed' });
  await symlink(p.parent, path);
  assert.equal((await ledger.status(r.requestId)).state, 'unconfirmed');
});
