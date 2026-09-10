import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { remoteHttpPolicy, remoteRequestShape, projectRemoteState } from '../src/gui/remote-policy.mjs';

const webOrigin = 'https://unharness.example.test', loopbackOrigin = 'http://127.0.0.1:43210';
const headers = { host: '127.0.0.1:43210', origin: webOrigin, 'x-unharness-client': '1', 'content-type': 'application/json' };
const request = (overrides = {}) => ({ method: 'POST', headers: { ...headers, ...overrides } });
const policy = req => remoteHttpPolicy(req, { loopbackOrigin, webOrigin });

test('CORS and actual requests each enforce exact origin, loopback host and dedicated client metadata', () => {
  const allowed = policy(request());
  assert.equal(allowed['Access-Control-Allow-Origin'], webOrigin);
  assert.equal(allowed['Access-Control-Allow-Credentials'], undefined);
  for (const override of [{ origin: webOrigin + '.attacker.test' }, { origin: 'null' }, { origin: undefined },
    { host: 'localhost:43210' }, { host: '127.0.0.1:43211' }, { 'x-unharness-client': undefined }, { 'sec-fetch-mode': 'no-cors' }])
    assert.throws(() => policy(request(override)), { kind: 'remote-request-forbidden' });
  const preflight = { method: 'OPTIONS', headers: { host: headers.host, origin: webOrigin,
    'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type, x-unharness-client',
    'access-control-request-private-network': 'true' } };
  assert.equal(policy(preflight)['Access-Control-Allow-Private-Network'], 'true');
  assert.throws(() => policy({ ...preflight, headers: { ...preflight.headers, origin: '*' } }));
  assert.throws(() => policy({ ...preflight, headers: { ...preflight.headers, 'access-control-request-headers': 'x-unharness-token' } }));
  assert.throws(() => policy({ ...preflight, headers: { ...preflight.headers, 'access-control-request-method': 'GET' } }));
});

test('the public request schema has no registration, paths, contents or arbitrary local actions', () => {
  const plan = { requestId: randomUUID(), mode: 'normal', expectedRevision: 1 };
  assert.deepEqual(remoteRequestShape('plan', plan), plan);
  for (const extra of ['workspace', 'path', 'command', 'selectedIds', 'proposal', 'action', 'connectionId', 'token', 'officialOriginEvidence'])
    assert.throws(() => remoteRequestShape('plan', { ...plan, [extra]: 'PRIVATE' }), { kind: 'remote-invalid-request' });
  for (const mode of ['favorite', 'zero', '', null]) assert.throws(() => remoteRequestShape('plan', { ...plan, mode }));
  for (const value of [-1, 1.5, '1', null]) assert.throws(() => remoteRequestShape('plan', { ...plan, expectedRevision: value }));
  assert.throws(() => remoteRequestShape('apply', { requestId: randomUUID(), planId: 'a'.repeat(64) }));
  assert.throws(() => remoteRequestShape('status', { path: '/private' }));
  assert.throws(() => remoteRequestShape('register', {}));
});

test('state projection uses a fixed allowlist and preserves uncertainty without private content', () => {
  const state = { metadata: { context: { project: '/PRIVATE/project' }, workspace: '/PRIVATE/workspace' }, guide: 'PRIVATE body',
    changeVersion: 'a'.repeat(64), source: { context: { secret: 'PRIVATE' }, preparedMode: 'trueform', revision: 3,
      registration: { scopeId: 'b'.repeat(64), modeChangeRequired: true, sources: [{ path: '/PRIVATE', text: 'PRIVATE' }] },
      setup: { setupRequired: true }, conflict: { kind: 'source-conflict', path: '/PRIVATE' },
      recovery: { pending: { command: 'PRIVATE' }, argv: ['PRIVATE'] },
      observation: { status: 'matched-record', taskId: randomUUID(), text: 'PRIVATE' } } };
  const projected = projectRemoteState(state);
  assert.equal(projected.preparedMode, 'trueform');
  assert.equal(projected.setupRequired, true);
  assert.equal(projected.modeChangeRequired, true);
  assert.equal(projected.conflict, true);
  assert.equal(projected.recoveryPending, true);
  assert.equal(projected.runtimeState, 'unknown');
  assert.ok(!JSON.stringify(projected).includes('PRIVATE'));
  assert.throws(() => projectRemoteState({ ...state, changeVersion: null }), { kind: 'remote-state-unconfirmed' });
});
