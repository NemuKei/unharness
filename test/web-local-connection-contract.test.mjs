import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PUBLIC_WEB_ORIGIN, REMOTE_OPERATIONS } from '../src/gui/remote-policy.mjs';
import { pairingFromHash, readLocalPairing, publicPairingUrl } from '../web/src/local-connection.ts';

const view = { metadata: { launchId: randomUUID(), application: 'codex' }, source: { registration: { scopeId: 'a'.repeat(64) } } };
const pending = () => ({ pairingId: randomUUID(), status: 'approved', ticket: 'b'.repeat(64), protocolVersion: 1,
  launchId: view.metadata.launchId, webOrigin: PUBLIC_WEB_ORIGIN, expiresAt: Date.now() + 60000,
  target: { application: 'codex', scopeId: 'a'.repeat(64) }, operations: [...REMOTE_OPERATIONS] });

test('local handoffs accept only one exact pairing ID and public links contain only the short-lived ticket', () => {
  const value = pending();
  assert.equal(pairingFromHash('#pairing=' + value.pairingId), value.pairingId);
  for (const hash of ['#main', '#pairing=' + value.pairingId + '&approve=true', '#pairing=invalid']) assert.equal(pairingFromHash(hash), null);
  const details = readLocalPairing(value, view, value.pairingId);
  const link = new URL(publicPairingUrl(details, 'http://127.0.0.1:45678'));
  assert.equal(link.origin, PUBLIC_WEB_ORIGIN); assert.equal(link.search, '');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(link.hash.slice(1))), {
    unharness: '1', port: '45678', launch: value.launchId, ticket: value.ticket,
  });
  assert.equal(publicPairingUrl({ ...details, status: 'awaiting-approval' }, 'http://127.0.0.1:45678'), null);
  assert.equal(publicPairingUrl({ ...details, expiresAt: 1 }, 'http://127.0.0.1:45678'), null);
  for (const origin of ['https://other.test', 'http://localhost:45678', 'http://127.0.0.1:45678/other', 'http://user@127.0.0.1:45678'])
    assert.equal(publicPairingUrl(details, origin), null);
});

test('local approval refuses changed targets, broader permissions, and malformed connection details', () => {
  for (const mutate of [v => { v.webOrigin += '.other.test'; }, v => { v.target.scopeId = 'c'.repeat(64); },
    v => { v.launchId = randomUUID(); }, v => { v.protocolVersion = 2; }, v => { v.operations.push('approve'); },
    v => { v.ticket = 'not-a-ticket'; }, v => { v.expiresAt = 'tomorrow'; }, v => { v.target.application = 'claude'; }]) {
    const value = pending(); mutate(value);
    assert.throws(() => readLocalPairing(value, view, value.pairingId));
  }
  const value = pending();
  assert.throws(() => readLocalPairing(value, view, randomUUID()));
  assert.deepEqual(readLocalPairing({ pairingId: value.pairingId, status: 'expired' }, view, value.pairingId), { pairingId: value.pairingId, status: 'expired' });
  const connection = { ...value, connectionId: randomUUID() }; delete connection.ticket; delete connection.status; delete connection.pairingId;
  assert.equal(readLocalPairing({ pairingId: value.pairingId, status: 'connected', connection }, view, value.pairingId).status, 'connected');
  connection.token = 'b'.repeat(64);
  assert.throws(() => readLocalPairing({ pairingId: value.pairingId, status: 'connected', connection }, view, value.pairingId));
});
