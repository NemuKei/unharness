// Public-page protocol. This allowlist is deliberately separate from the local
// GUI/MCP schema, whose registration and private readers remain local only.
export const REMOTE_PROTOCOL_VERSION = 1;
export const PUBLIC_WEB_ORIGIN = 'https://unharness.deltahelmlab.com';
export const REMOTE_OPERATIONS = Object.freeze(['status', 'plan', 'apply', 'operation-status']);
export const remoteFail = kind => { throw Object.assign(new Error(kind), { kind }); };
export const isUuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
export const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isMode = value => ['normal', 'unseal', 'trueform'].includes(value);
export const isRevision = value => Number.isSafeInteger(value) && value >= 0;
export function exactRemote(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) remoteFail('remote-invalid-request');
}
export function exactHttpsOrigin(value) {
  try {
    const url = new URL(value);
    if (typeof value === 'string' && url.protocol === 'https:' && url.origin === value && !url.username && !url.password) return value;
  } catch {}
  remoteFail('remote-invalid-origin');
}
export function remoteHttpPolicy(request, { loopbackOrigin, webOrigin }) {
  const h = request.headers;
  if (h.host !== new URL(loopbackOrigin).host || h.origin !== webOrigin
    || (h['sec-fetch-mode'] !== undefined && h['sec-fetch-mode'] !== 'cors')
    || (h['sec-fetch-dest'] !== undefined && h['sec-fetch-dest'] !== 'empty')) remoteFail('remote-request-forbidden');
  for (const key of ['host', 'origin', 'authorization', 'x-unharness-client']) {
    const count = request.rawHeaders?.filter((_, index) => index % 2 === 0 && request.rawHeaders[index].toLowerCase() === key).length ?? 0;
    if (count > 1) remoteFail('remote-request-forbidden');
  }
  const result = { 'Access-Control-Allow-Origin': webOrigin, Vary: 'Origin',
    'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  if (request.method === 'OPTIONS') {
    const requested = h['access-control-request-headers']?.toLowerCase().split(',').map(s => s.trim());
    if (h['access-control-request-method'] !== 'POST' || !requested?.length
      || new Set(requested).size !== requested.length || requested.some(s => !['authorization', 'content-type', 'x-unharness-client'].includes(s))
      || !requested.includes('content-type') || !requested.includes('x-unharness-client')
      || (h['access-control-request-private-network'] !== undefined && h['access-control-request-private-network'] !== 'true')) remoteFail('remote-request-forbidden');
    Object.assign(result, { 'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Unharness-Client',
      'Access-Control-Max-Age': '0', Vary: 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers' });
    if (h['access-control-request-private-network'] === 'true') result['Access-Control-Allow-Private-Network'] = 'true';
  } else if (request.method !== 'POST' || h['x-unharness-client'] !== '1') remoteFail('remote-request-forbidden');
  return result;
}
export function remoteRequestShape(operation, value) {
  const keys = { status: [], plan: ['requestId', 'mode', 'expectedRevision'], apply: ['requestId', 'planRequestId'],
    'operation-status': ['requestId'], redeem: ['ticket', 'launchId', 'protocolVersion'] };
  if (!Object.hasOwn(keys, operation)) remoteFail('remote-invalid-request');
  exactRemote(value, keys[operation]);
  if (operation !== 'status' && operation !== 'redeem' && !isUuid(value.requestId)) remoteFail('remote-invalid-request');
  if (operation === 'plan' && (!isMode(value.mode) || !isRevision(value.expectedRevision))) remoteFail('remote-invalid-request');
  if (operation === 'apply' && !isUuid(value.planRequestId)) remoteFail('remote-invalid-request');
  if (operation === 'redeem' && (!isHash(value.ticket) || !isUuid(value.launchId)
    || value.protocolVersion !== REMOTE_PROTOCOL_VERSION)) remoteFail('remote-incompatible');
  return value;
}
export function projectRemoteState(state) {
  const source = state?.source;
  if (!isHash(state?.changeVersion) || !source || !isHash(source.registration?.scopeId)
    || !isMode(source.preparedMode) || !isRevision(source.revision)) remoteFail('remote-state-unconfirmed');
  return { scopeId: source.registration.scopeId, revision: source.revision, preparedMode: source.preparedMode,
    setupRequired: source.setup?.setupRequired === true, modeChangeRequired: source.registration.modeChangeRequired === true,
    conflict: source.conflict !== null, recoveryPending: !!source.recovery?.pending,
    // A prepared configuration or historical recording is not a live runtime check.
    runtimeState: 'unknown' };
}

const SAFE_ERRORS = new Set(['remote-request-forbidden', 'remote-invalid-request', 'remote-invalid-origin',
  'remote-pairing-unavailable', 'remote-connection-expired', 'remote-connection-changed', 'remote-incompatible',
  'remote-capacity', 'remote-registration-required', 'remote-state-unconfirmed', 'remote-plan-unavailable',
  'remote-stale-plan', 'remote-operation-unconfirmed', 'remote-operation-error', 'remote-operation-conflict', 'remote-request-too-large',
  'source-conflict', 'stale-plan', 'recovery-required', 'setup-required', 'setup-review-required',
  'scope-preparation-required', 'source-session-changed', 'gui-source-context-changed', 'source-locked']);
export function remoteError(error) {
  const kind = error?.kind === 'gui-request-too-large' ? 'remote-request-too-large'
    : error?.kind === 'gui-invalid-request' ? 'remote-invalid-request'
    : error?.kind === 'ai-request-conflict' ? 'remote-operation-conflict'
    : error?.kind === 'ai-operation-unconfirmed' ? 'remote-operation-unconfirmed' : error?.kind;
  return { kind: SAFE_ERRORS.has(kind) ? kind : 'remote-operation-error' };
}
export function remoteErrorStatus(kind) {
  if (kind === 'remote-request-too-large') return 413;
  if (kind === 'remote-request-forbidden') return 403;
  if (kind === 'remote-connection-expired' || kind === 'remote-pairing-unavailable') return 401;
  if (kind === 'remote-operation-error' || kind === 'remote-operation-unconfirmed') return 500;
  if (kind.includes('stale') || kind.includes('conflict') || kind.includes('changed') || kind === 'remote-capacity') return 409;
  return 400;
}
