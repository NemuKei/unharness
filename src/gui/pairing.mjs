// Issuance and approval are reachable only through the authenticated local UI
// or owned launcher. Neither a public token nor ticket can approve itself.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PUBLIC_WEB_ORIGIN, REMOTE_PROTOCOL_VERSION, REMOTE_OPERATIONS, exactHttpsOrigin,
  exactRemote, isHash, isUuid, remoteFail } from './remote-policy.mjs';

export const PAIRING_TTL_MS = 2 * 60 * 1000;
export const CONNECTION_TTL_MS = 10 * 60 * 1000;
const CAPACITY = 32;
const tokenKey = value => createHash('sha256').update(value).digest('hex');
const BINDING_FIELDS = ['launchId', 'contextId', 'rootScopeId', 'scopeId', 'collectionScopeId', 'workspace', 'application'];
function validBinding(binding, launchId) {
  if (!binding || binding.launchId !== launchId || !isHash(binding.contextId) || !isHash(binding.rootScopeId)
    || !isHash(binding.scopeId) || !isHash(binding.collectionScopeId) || binding.collectionScopeId !== binding.rootScopeId
    || typeof binding.workspace !== 'string' || !binding.workspace
    || !['codex', 'claude'].includes(binding.application)) remoteFail('remote-connection-changed');
  return Object.freeze(Object.fromEntries(BINDING_FIELDS.map(k => [k, binding[k]])));
}
const sameBinding = (a, b) => BINDING_FIELDS.every(key => a[key] === b?.[key]);
const target = binding => ({ application: binding.application, scopeId: binding.scopeId, collectionScopeId: binding.collectionScopeId });
export function publicConnection(session) {
  return { protocolVersion: REMOTE_PROTOCOL_VERSION, connectionId: session.connectionId, launchId: session.launchId,
    expiresAt: session.expiresAt, webOrigin: session.webOrigin, target: target(session), operations: [...REMOTE_OPERATIONS] };
}
export function createPairingManager({ launchId, webOrigin = PUBLIC_WEB_ORIGIN, now = Date.now }) {
  if (!isUuid(launchId) || typeof now !== 'function') remoteFail('remote-invalid-request');
  exactHttpsOrigin(webOrigin);
  const tickets = new Map(), sessions = new Map();
  let closed = false;
  function clock() {
    const value = now();
    if (closed || !Number.isSafeInteger(value) || value < 0) remoteFail('remote-connection-expired');
    return value;
  }
  function prune(map, time) {
    for (const [key, value] of map) if (value.expiresAt <= time) map.delete(key);
    if (map.size >= CAPACITY) remoteFail('remote-capacity');
  }
  function pending(pairingId, binding) {
    const issued = tickets.get(pairingId);
    if (!issued || issued.expiresAt <= clock() || !sameBinding(issued.binding, binding)) remoteFail('remote-pairing-unavailable');
    return issued;
  }
  return {
    webOrigin,
    issue(input) {
      const time = clock(), binding = validBinding(input, launchId);
      prune(tickets, time);
      const ticket = randomBytes(32).toString('hex'), pairingId = randomUUID(), expiresAt = time + PAIRING_TTL_MS;
      tickets.set(pairingId, { binding, key: tokenKey(ticket), ticket, expiresAt, approved: false });
      return { protocolVersion: REMOTE_PROTOCOL_VERSION, pairingId, ticket, expiresAt, approved: false, launchId,
        webOrigin, target: target(binding), operations: [...REMOTE_OPERATIONS] };
    },
    approve(pairingId, binding) {
      const issued = pending(pairingId, binding);
      issued.approved = true;
      return { pairingId, approved: true, expiresAt: issued.expiresAt, webOrigin, target: target(issued.binding), operations: [...REMOTE_OPERATIONS] };
    },
    details(pairingId, input) {
      if (!isUuid(pairingId)) remoteFail('remote-invalid-request');
      const time = clock(), binding = validBinding(input, launchId), issued = tickets.get(pairingId);
      const session = [...sessions.values()].find(value => value.pairingId === pairingId);
      const savedBinding = issued?.binding ?? session;
      if (savedBinding && !sameBinding(savedBinding, binding)) remoteFail('remote-connection-changed');
      if (issued) {
        if (issued.expiresAt <= time) return { pairingId, status: 'expired' };
        return { pairingId, status: issued.approved ? 'approved' : 'awaiting-approval', ticket: issued.ticket,
          protocolVersion: REMOTE_PROTOCOL_VERSION, launchId, webOrigin, expiresAt: issued.expiresAt,
          target: target(binding), operations: [...REMOTE_OPERATIONS] };
      }
      if (session) return session.expiresAt <= time ? { pairingId, status: 'expired' }
        : { pairingId, status: 'connected', connection: publicConnection(session) };
      return { pairingId, status: 'unavailable' };
    },
    redeem(input, binding) {
      exactRemote(input, ['ticket', 'origin', 'launchId', 'protocolVersion']);
      const time = clock();
      if (!isHash(input.ticket) || input.origin !== webOrigin || input.launchId !== launchId
        || input.protocolVersion !== REMOTE_PROTOCOL_VERSION) remoteFail('remote-pairing-unavailable');
      const key = tokenKey(input.ticket), entry = [...tickets].find(([, value]) => value.key === key);
      if (!entry) remoteFail('remote-pairing-unavailable');
      const [pairingId] = entry, issued = pending(pairingId, binding);
      if (!issued.approved) remoteFail('remote-pairing-unavailable');
      prune(sessions, time);
      const token = randomBytes(32).toString('hex');
      const session = Object.freeze({ ...issued.binding, webOrigin, pairingId, connectionId: randomUUID(), expiresAt: time + CONNECTION_TTL_MS });
      tickets.delete(pairingId);
      sessions.set(tokenKey(token), session);
      return { ...publicConnection(session), token };
    },
    authorize({ token, origin }, binding) {
      const time = clock();
      if (origin !== webOrigin || !isHash(token)) remoteFail('remote-request-forbidden');
      const key = tokenKey(token), session = sessions.get(key);
      if (!session || session.expiresAt <= time) { sessions.delete(key); remoteFail('remote-connection-expired'); }
      if (!sameBinding(session, binding)) { sessions.delete(key); remoteFail('remote-connection-changed'); }
      return session;
    },
    cancel(pairingId) {
      if (!isUuid(pairingId)) remoteFail('remote-invalid-request');
      tickets.delete(pairingId);
      for (const [key, value] of sessions) if (value.pairingId === pairingId) sessions.delete(key);
      return { pairingId, cancelled: true };
    },
    revoke(connectionId) {
      if (!isUuid(connectionId)) remoteFail('remote-invalid-request');
      for (const [key, value] of sessions) if (value.connectionId === connectionId) sessions.delete(key);
      return { connectionId, revoked: true };
    },
    close() { closed = true; tickets.clear(); sessions.clear(); },
  };
}
