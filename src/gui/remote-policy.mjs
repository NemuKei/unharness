// Public-page protocol. This allowlist is deliberately separate from the local
// GUI/MCP schema, whose registration and private readers remain local only.
import { createHash } from 'node:crypto';
import stock from '../../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };

export const REMOTE_PROTOCOL_VERSION = 2;
export const PUBLIC_WEB_ORIGIN = 'https://unharness.deltahelmlab.com';
export const ARTWORK_WRITES = Object.freeze(['review-appearance-import', 'save-appearance-import',
  'select-appearance', 'name-appearance', 'recover-appearance']);
export const REMOTE_WRITES = Object.freeze(['plan', 'apply', ...ARTWORK_WRITES]);
export const REMOTE_OPERATIONS = Object.freeze(['status', 'plan', 'apply', 'operation-status',
  'artwork', 'artwork-item', 'artwork-image', 'review-appearance-import', 'read-appearance-import',
  'save-appearance-import', 'select-appearance', 'name-appearance', 'recover-appearance']);
export const REMOTE_IMAGE_LIMIT = 8 * 1024 * 1024;
export const REMOTE_SET_LIMIT = 64 * 1024 * 1024;
export const REMOTE_UPLOAD_BODY_LIMIT = Math.ceil(REMOTE_SET_LIMIT * 4 / 3) + 64 * 1024;
const partIds = stock.files.map(file => file.partId);
const fileId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
const optionalHash = value => value === null || isHash(value);
const text = (value, empty = false) => typeof value === 'string' && value.length <= 80
  && (empty || value.trim().length > 0) && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
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
// Validate nested upload data before hashing it. Core import still owns complete
// PNG decoding, template compatibility, image ownership and review publication.
function uploadShape(value) {
  const m = value.manifest;
  exactRemote(m, ['templateId', 'baseItemId', 'name', 'author', 'parts']);
  if (m.templateId !== stock.manifest.templateId || !optionalHash(m.baseItemId)
    || !text(m.name) || !text(m.author, true) || !Array.isArray(m.parts) || !m.parts.length
    || m.parts.length > partIds.length || !Array.isArray(value.files) || !value.files.length
    || value.files.length > 64) remoteFail('remote-invalid-request');
  const parts = new Set(), used = new Set(), files = new Set();
  for (const part of m.parts) {
    exactRemote(part, ['partId', 'fileId']);
    if (!partIds.includes(part.partId) || parts.has(part.partId) || !fileId(part.fileId)) remoteFail('remote-invalid-request');
    parts.add(part.partId); used.add(part.fileId);
  }
  let total = 0;
  for (const file of value.files) {
    exactRemote(file, ['fileId', 'base64']);
    if (!fileId(file.fileId) || files.has(file.fileId) || !used.has(file.fileId)
      || typeof file.base64 !== 'string' || file.base64.length > Math.ceil(REMOTE_IMAGE_LIMIT / 3) * 4
      || file.base64.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(file.base64)) remoteFail('remote-invalid-request');
    const bytes = Buffer.from(file.base64, 'base64'); total += bytes.length;
    if (!bytes.length || bytes.length > REMOTE_IMAGE_LIMIT || total > REMOTE_SET_LIMIT
      || bytes.toString('base64') !== file.base64) remoteFail('remote-invalid-request');
    files.add(file.fileId);
  }
  if (files.size !== used.size) remoteFail('remote-invalid-request');
}
export function remoteRequestShape(operation, value) {
  const keys = { status: [], plan: ['requestId', 'mode', 'expectedRevision'], apply: ['requestId', 'planRequestId'],
    'operation-status': ['requestId'], redeem: ['ticket', 'launchId', 'protocolVersion'], artwork: ['after'],
    'artwork-item': ['itemId'], 'artwork-image': ['referenceId', 'assetId'], 'read-appearance-import': ['reviewId'],
    'review-appearance-import': ['requestId', 'importId', 'expectedStateId', 'manifest', 'files'],
    'save-appearance-import': ['requestId', 'reviewId', 'expectedStateId'],
    'select-appearance': ['requestId', 'itemId', 'expectedStateId'],
    'name-appearance': ['requestId', 'itemId', 'expectedStateId', 'name'], 'recover-appearance': ['requestId'] };
  if (!Object.hasOwn(keys, operation)) remoteFail('remote-invalid-request');
  exactRemote(value, keys[operation]);
  if (keys[operation].includes('requestId') && !isUuid(value.requestId)) remoteFail('remote-invalid-request');
  for (const key of ['itemId', 'referenceId', 'assetId', 'reviewId'])
    if (keys[operation].includes(key) && !isHash(value[key])) remoteFail('remote-invalid-request');
  if (operation === 'artwork' && !optionalHash(value.after)) remoteFail('remote-invalid-request');
  if (keys[operation].includes('expectedStateId') && !(isHash(value.expectedStateId)
    || value.expectedStateId === null && ['review-appearance-import', 'save-appearance-import'].includes(operation))) remoteFail('remote-invalid-request');
  if (operation === 'name-appearance' && !text(value.name)) remoteFail('remote-invalid-request');
  if (operation === 'review-appearance-import') {
    if (!isUuid(value.importId)) remoteFail('remote-invalid-request');
    uploadShape(value);
  }
  if (operation === 'plan' && (!isMode(value.mode) || !isRevision(value.expectedRevision))) remoteFail('remote-invalid-request');
  if (operation === 'apply' && !isUuid(value.planRequestId)) remoteFail('remote-invalid-request');
  if (operation === 'redeem' && (!isHash(value.ticket) || !isUuid(value.launchId)
    || value.protocolVersion !== REMOTE_PROTOCOL_VERSION)) remoteFail('remote-incompatible');
  // No caller-owned arrays/objects may change between fingerprint and execution.
  return structuredClone(value);
}
export function remoteLedgerInput(operation, input) {
  if (!ARTWORK_WRITES.includes(operation)) return input; // Historical mode claim format stays intact.
  const hash = createHash('sha256').update('unharness-public-artwork-input/v2\n');
  function append(value) {
    if (value === null || typeof value !== 'object') { hash.update(JSON.stringify(value)); return; }
    if (Array.isArray(value)) {
      hash.update('['); value.forEach((entry, i) => { if (i) hash.update(','); append(entry); }); hash.update(']');
    } else {
      hash.update('{'); Object.keys(value).sort().forEach((key, i) => {
        if (i) hash.update(','); hash.update(JSON.stringify(key) + ':'); append(value[key]);
      }); hash.update('}');
    }
  }
  append(input);
  // Never pass base64 to the ledger's 1 MiB record encoder. JSON key order is
  // irrelevant; canonical base64 means changing actual image bytes changes this hash.
  return { protocolVersion: REMOTE_PROTOCOL_VERSION, payloadSha256: hash.digest('hex') };
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
  'scope-preparation-required', 'source-session-changed', 'gui-source-context-changed', 'source-locked',
  'appearance-import-invalid', 'appearance-image-invalid', 'appearance-image-store-invalid', 'appearance-not-owned',
  'appearance-state-conflict', 'appearance-recovery-required', 'appearance-record-invalid',
  'appearance-template-invalid', 'appearance-name-invalid', 'appearance-publication-uncertain', 'appearance-image-publication-uncertain']);
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
  if (kind === 'remote-operation-error' || kind === 'remote-operation-unconfirmed' || kind.endsWith('-uncertain')) return 500;
  if (kind.includes('stale') || kind.includes('conflict') || kind.includes('changed') || kind === 'remote-capacity') return 409;
  return 400;
}
