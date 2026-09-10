import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPairingManager, PAIRING_TTL_MS, CONNECTION_TTL_MS } from '../src/gui/pairing.mjs';

const webOrigin = 'https://unharness.example.test';
const binding = () => ({ launchId: randomUUID(), contextId: 'a'.repeat(64), rootScopeId: 'b'.repeat(64),
  scopeId: 'c'.repeat(64), collectionScopeId: 'b'.repeat(64), workspace: '/synthetic/private/workspace', application: 'codex' });
function setup() {
  let time = 1000;
  const current = binding(), manager = createPairingManager({ launchId: current.launchId, webOrigin, now: () => time });
  const issue = manager.issue(current);
  const input = { ticket: issue.ticket, launchId: current.launchId, origin: webOrigin, protocolVersion: 2 };
  return { current, manager, issue, input, advance: ms => { time += ms; } };
}

test('a local issue is not approval; approved tickets redeem exactly once', () => {
  const s = setup();
  assert.equal(s.issue.approved, false);
  assert.throws(() => s.manager.redeem(s.input, s.current), { kind: 'remote-pairing-unavailable' });
  s.manager.approve(s.issue.pairingId, s.current);
  const session = s.manager.redeem(s.input, s.current);
  assert.match(session.token, /^[a-f0-9]{64}$/);
  assert.equal(session.expiresAt, 1000 + CONNECTION_TTL_MS);
  assert.equal(session.target.application, 'codex');
  assert.equal(session.protocolVersion, 2);
  assert.equal(session.target.collectionScopeId, s.current.rootScopeId);
  assert.ok(!JSON.stringify(session).includes('/synthetic'));
  assert.throws(() => s.manager.redeem(s.input, s.current), { kind: 'remote-pairing-unavailable' });
  const auth = { token: session.token, origin: webOrigin };
  assert.equal(s.manager.authorize(auth, s.current).connectionId, session.connectionId);
  s.manager.revoke(session.connectionId);
  assert.throws(() => s.manager.authorize(auth, s.current), { kind: 'remote-connection-expired' });
});

test('wrong origins and claimed launch/protocol cannot redeem a valid approved ticket', () => {
  const s = setup(); s.manager.approve(s.issue.pairingId, s.current);
  for (const input of [{ ...s.input, origin: 'https://unharness.example.test.attacker.test' },
    { ...s.input, origin: webOrigin + '/' }, { ...s.input, origin: 'null' },
    { ...s.input, launchId: randomUUID() }, { ...s.input, protocolVersion: 1 }, { ...s.input, approve: true }]) {
    assert.throws(() => s.manager.redeem(input, s.current));
  }
  assert.ok(s.manager.redeem(s.input, s.current).token, 'invalid attempts do not approve or consume the ticket');
});

test('tickets expire at the deadline and approval cannot revive them', () => {
  const s = setup(); s.manager.approve(s.issue.pairingId, s.current); s.advance(PAIRING_TTL_MS);
  assert.throws(() => s.manager.redeem(s.input, s.current), { kind: 'remote-pairing-unavailable' });
  assert.throws(() => s.manager.approve(s.issue.pairingId, s.current), { kind: 'remote-pairing-unavailable' });
});

test('scope, root, context, workspace and launch changes invalidate issued tickets and connections', () => {
  for (const field of ['scopeId', 'rootScopeId', 'collectionScopeId', 'contextId', 'workspace', 'launchId', 'application']) {
    const s = setup(); s.manager.approve(s.issue.pairingId, s.current);
    const changed = { ...s.current, [field]: field === 'launchId' ? randomUUID() : field === 'workspace' ? '/other' : 'd'.repeat(64) };
    assert.throws(() => s.manager.redeem(s.input, changed), undefined, field);
    const q = setup(); q.manager.approve(q.issue.pairingId, q.current);
    const session = q.manager.redeem(q.input, q.current);
    assert.throws(() => q.manager.authorize({ token: session.token, origin: webOrigin },
      { ...q.current, [field]: changed[field] }), { kind: 'remote-connection-changed' }, field);
  }
});

test('connection deadline, revocation and restart refuse new requests', () => {
  const s = setup(); s.manager.approve(s.issue.pairingId, s.current);
  const session = s.manager.redeem(s.input, s.current), auth = { token: session.token, origin: webOrigin };
  assert.throws(() => s.manager.authorize({ ...auth, origin: 'https://other.test' }, s.current));
  assert.throws(() => s.manager.authorize({ ...auth, token: '' }, s.current));
  s.advance(CONNECTION_TTL_MS);
  assert.throws(() => s.manager.authorize(auth, s.current), { kind: 'remote-connection-expired' });
  const restarted = createPairingManager({ launchId: s.current.launchId, webOrigin });
  assert.throws(() => restarted.authorize(auth, s.current));
});

test('only exact HTTPS origins and bounded local binding fields can issue a ticket', () => {
  for (const origin of ['http://example.test', '*', 'https://example.test/', 'https://a@example.test', 'https://example.test?q=1'])
    assert.throws(() => createPairingManager({ launchId: randomUUID(), webOrigin: origin }));
  const s = setup();
  assert.throws(() => s.manager.issue({ ...s.current, scopeId: null }));
  s.manager.close();
  assert.throws(() => s.manager.issue(s.current));
});

test('local pairing details follow approval and redemption without disclosing a connection token', () => {
  const s = setup();
  assert.equal(s.manager.details(s.issue.pairingId, s.current).status, 'awaiting-approval');
  assert.equal(s.manager.details(s.issue.pairingId, s.current).ticket, s.issue.ticket);
  s.manager.approve(s.issue.pairingId, s.current);
  assert.equal(s.manager.details(s.issue.pairingId, s.current).status, 'approved');
  const session = s.manager.redeem(s.input, s.current);
  const connected = s.manager.details(s.issue.pairingId, s.current);
  assert.equal(connected.status, 'connected'); assert.equal(connected.connection.connectionId, session.connectionId);
  assert.equal(connected.ticket, undefined); assert.ok(!JSON.stringify(connected).includes(session.token));
  assert.throws(() => s.manager.details(s.issue.pairingId, { ...s.current, scopeId: 'f'.repeat(64) }));
  s.manager.revoke(session.connectionId);
  assert.equal(s.manager.details(s.issue.pairingId, s.current).status, 'unavailable');
});

test('local cancellation invalidates pending tickets and already redeemed connections', () => {
  for (const state of ['pending', 'approved', 'connected']) {
    const s = setup();
    if (state !== 'pending') s.manager.approve(s.issue.pairingId, s.current);
    const session = state === 'connected' ? s.manager.redeem(s.input, s.current) : null;
    assert.deepEqual(s.manager.cancel(s.issue.pairingId), { pairingId: s.issue.pairingId, cancelled: true });
    assert.equal(s.manager.details(s.issue.pairingId, s.current).status, 'unavailable');
    assert.throws(() => s.manager.redeem(s.input, s.current), { kind: 'remote-pairing-unavailable' });
    if (session) assert.throws(() => s.manager.authorize({ token: session.token, origin: webOrigin }, s.current), { kind: 'remote-connection-expired' });
    assert.equal(s.manager.cancel(s.issue.pairingId).cancelled, true);
  }
});
