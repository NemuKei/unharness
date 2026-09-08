import { randomBytes } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, relative, resolve, sep } from 'node:path';

import { LOCAL_STORE_ERROR_KINDS } from '../core/local-store.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';
import { createGuiController } from './controller.mjs';
import { createGuiInventory } from './inventory.mjs';
import { createSourceController, sourceRequestShape } from './sources.mjs';
import { USER_SOURCE_ERROR_KINDS } from '../sources/service.mjs';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_REQUESTS = 1000;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const COMPARISON_ACTIONS = new Set([
  'review-run', 'save-run', 'runs', 'run', 'run-output', 'compare-runs',
  'run-favorite',
]);
const STARTING_ACTIONS = new Set(['review-start', 'save-start', 'start', 'starts']);
const REPLAY_ACTIONS = new Set(['review-replay', 'prepare-replay', 'handoff-replay', 'replay', 'replays', 'cancel-replay',
  'observe-replay', 'save-replay-result', 'replay-result', 'open-replay', 'compare-replays', 'replay-favorite']);
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const SAFE_ERRORS = new Set([
  ...LOCAL_STORE_ERROR_KINDS, ...USER_SOURCE_ERROR_KINDS, 'gui-source-context-changed',
  'loadout-invalid-reference', 'loadout-invalid-name', 'loadout-invalid-snapshot',
  'loadout-invalid-favorite', 'loadout-invalid-checkpoint', 'loadout-invalid-application',
  'loadout-incompatible-scope', 'loadout-source-unready', 'loadout-readback-conflict',
  'loadout-stale-plan', 'loadout-stale-application', 'loadout-family-not-found',
  'loadout-store-inside-fixture', 'fixture-conflict', 'fixture-changed', 'fixture-locked',
  'fixture-link-or-type', 'invalid-fixture', 'invalid-fixture-case',
  'fixture-recovery-required', 'fixture-cleanup-required', 'fixture-incompatible-snapshot',
  'invalid-desktop-record', 'desktop-record-too-large', 'desktop-record-changed',
  'desktop-record-read-error', 'desktop-record-identity-mismatch',
  'current-session-unavailable', 'session-index-too-large',
  'gui-invalid-request', 'gui-request-forbidden', 'gui-request-too-large',
  'gui-request-id-reused', 'gui-request-capacity', 'gui-application-not-current',
  'gui-inventory-disabled', 'gui-inventory-target-changed',
]);

const MIME = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2'],
]);

function safeError(error) {
  const result = { kind: SAFE_ERRORS.has(error?.kind) ? error.kind : 'gui-operation-error' };
  if (typeof error?.checkpointId === 'string' && /^[a-f0-9]{64}$/.test(error.checkpointId)) {
    result.checkpointId = error.checkpointId;
  }
  return result;
}

function statusFor(kind) {
  if (kind === 'starting-publication-uncertain' || kind === 'replay-publication-uncertain' || kind === 'replay-desktop-open-uncertain') return 500;
  if (kind === 'starting-files-changed') return 409;
  if (kind === 'gui-request-forbidden') return 403;
  if (kind === 'gui-request-too-large') return 413;
  if (kind === 'gui-request-id-reused' || kind === 'gui-request-capacity'
    || kind.includes('stale') || kind.includes('conflict') || kind.includes('locked')) return 409;
  if (kind === 'gui-operation-error' || kind === 'operation-failed' || kind.endsWith('-error')) return 500;
  return 400;
}

function headers(contentType = 'application/json; charset=utf-8') {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': CSP,
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  };
}

function sendJson(response, status, value) {
  response.writeHead(status, headers());
  response.end(`${JSON.stringify(value)}\n`);
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

async function staticFiles(directory) {
  const root = await realpath(resolve(directory));
  if (root !== resolve(directory)) throw Object.assign(new Error('gui-assets-invalid'), { kind: 'gui-assets-invalid' });
  const files = new Map();
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const target = resolve(path, entry.name);
      const info = await lstat(target);
      if (info.isSymbolicLink()) throw Object.assign(new Error('gui-assets-invalid'), { kind: 'gui-assets-invalid' });
      if (info.isDirectory()) await visit(target);
      else if (info.isFile()) {
        const name = `/${relative(root, target).split(sep).join('/')}`;
        files.set(name, { bytes: await readFile(target), type: MIME.get(extname(target).toLowerCase()) ?? 'application/octet-stream' });
      } else throw Object.assign(new Error('gui-assets-invalid'), { kind: 'gui-assets-invalid' });
    }
  }
  await visit(root);
  if (!files.has('/index.html')) throw Object.assign(new Error('gui-build-missing'), { kind: 'gui-build-missing' });
  files.set('/', files.get('/index.html'));
  return files;
}

function requestShape(body, action) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)
    || typeof body.requestId !== 'string' || !UUID.test(body.requestId)) {
    throw Object.assign(new Error('gui-invalid-request'), { kind: 'gui-invalid-request' });
  }
  const { requestId, ...input } = body;
  const expected = {
    plan: ['favoriteId'], apply: ['favoriteId', 'planId'], save: ['name'],
    'restore-checkpoint': ['checkpointId'], observe: ['applicationId', 'sessionId'], inspect: [],
  }[action];
  if (!expected) throw Object.assign(new Error('gui-invalid-request'), { kind: 'gui-invalid-request' });
  const keys = Object.keys(input).sort();
  const permitted = action === 'save' && keys.length === 0;
  if (!permitted && keys.join('\0') !== expected.sort().join('\0')) {
    throw Object.assign(new Error('gui-invalid-request'), { kind: 'gui-invalid-request' });
  }
  return { requestId, input };
}

async function readJson(request, strict = false, maxBodyBytes = strict ? 64 * 1024 : MAX_BODY_BYTES) {
  if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    throw Object.assign(new Error('gui-invalid-request'), { kind: 'gui-invalid-request' });
  }
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > maxBodyBytes)) {
    throw Object.assign(new Error('gui-request-too-large'), { kind: 'gui-request-too-large' });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) throw Object.assign(new Error('gui-request-too-large'), { kind: 'gui-request-too-large' });
    chunks.push(chunk);
  }
  try {
    const bytes = Buffer.concat(chunks), text = bytes.toString('utf8');
    if (strict && !Buffer.from(text, 'utf8').equals(bytes)) throw new Error();
    const value = strict ? parseStrictJson(text) : JSON.parse(text);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error('gui-invalid-request'), { kind: 'gui-invalid-request' });
  }
}

export async function startGuiServer({ store, scopeId, assetsDirectory, port = 0, codexHome, manageSources, inventory: inventoryOptions } = {}, {
  collectInventory,
} = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw Object.assign(new Error('gui-invalid-port'), { kind: 'gui-invalid-port' });
  }
  const files = await staticFiles(assetsDirectory);
  const sourceController = manageSources ? await createSourceController(manageSources) : null;
  const controller = sourceController ?? await createGuiController({ store, scopeId, codexHome });
  const kind = sourceController ? 'user-sources' : 'fixture';
  const inventory = await createGuiInventory(sourceController ? undefined : inventoryOptions, { collect: collectInventory });
  const token = randomBytes(32).toString('hex');
  const requests = new Map();
  let queue = Promise.resolve();
  let origin;

  const server = createServer(async (request, response) => {
    try {
      const parsed = new URL(request.url, origin);
      const isApi = parsed.pathname.startsWith('/api/');
      if (!isApi) {
        if (!['GET', 'HEAD'].includes(request.method) || parsed.search !== '') {
          response.writeHead(404, headers('text/plain; charset=utf-8')); response.end('Not found\n'); return;
        }
        let pathname;
        try { pathname = decodeURIComponent(parsed.pathname); } catch { pathname = ''; }
        const file = files.get(pathname);
        if (!file) { response.writeHead(404, headers('text/plain; charset=utf-8')); response.end('Not found\n'); return; }
        response.writeHead(200, headers(file.type));
        if (request.method === 'HEAD') response.end();
        else response.end(file.bytes);
        return;
      }

      const hostValid = request.headers.host === new URL(origin).host;
      const requestOrigin = request.headers.origin;
      const fetchSite = request.headers['sec-fetch-site'];
      const metadataValid = requestOrigin === origin || fetchSite === 'same-origin';
      const metadataNotCrossSite = (requestOrigin === undefined || requestOrigin === origin)
        && (fetchSite === undefined || fetchSite === 'same-origin');
      const tokenRequired = parsed.pathname !== '/api/bootstrap';
      if (!hostValid || request.headers['x-unharness-client'] !== '1' || !metadataValid || !metadataNotCrossSite
        || (tokenRequired && request.headers['x-unharness-token'] !== token)) {
        sendJson(response, 403, { error: { kind: 'gui-request-forbidden' } });
        return;
      }

      if (request.method === 'GET') {
        const params = [...parsed.searchParams.keys()];
        if (parsed.pathname === '/api/bootstrap' && params.length === 0) sendJson(response, 200, { token, kind });
        else if (sourceController) {
          if (parsed.pathname === '/api/sources/metadata' && params.length === 0) sendJson(response, 200, await sourceController.metadata());
          else if (parsed.pathname === '/api/sources/state' && params.length === 0) sendJson(response, 200, await sourceController.state());
          else sendJson(response, 404, { error: { kind: 'gui-route-not-found' } });
        }
        else if (parsed.pathname === '/api/state' && params.length === 0) sendJson(response, 200, await controller.state());
        else if (parsed.pathname === '/api/inventory' && params.length === 0) sendJson(response, 200, inventory.state());
        else if (['/api/favorites', '/api/checkpoints'].includes(parsed.pathname)
          && params.every(key => key === 'after') && params.length <= 1) {
          const after = parsed.searchParams.get('after') ?? undefined;
          const result = parsed.pathname === '/api/favorites'
            ? await controller.favorites(after) : await controller.checkpoints(after);
          sendJson(response, 200, result);
        } else sendJson(response, 404, { error: { kind: 'gui-route-not-found' } });
        return;
      }

      if (request.method !== 'POST' || parsed.search !== '') {
        sendJson(response, 404, { error: { kind: 'gui-route-not-found' } });
        return;
      }
      const sourceRoute = parsed.pathname.startsWith('/api/sources/');
      if (sourceRoute !== !!sourceController) {
        sendJson(response, 404, { error: { kind: 'gui-route-not-found' } }); return;
      }
      const action = parsed.pathname.slice(sourceRoute ? '/api/sources/'.length : '/api/'.length);
      const starting = sourceRoute && STARTING_ACTIONS.has(action);
      const replay = sourceRoute && REPLAY_ACTIONS.has(action);
      const parsedBody = (sourceRoute ? sourceRequestShape : requestShape)(
        await readJson(request, sourceRoute && (COMPARISON_ACTIONS.has(action) || starting || replay), starting ? 128 * 1024 : replay ? 65536 : undefined),
        action,
      );
      const fingerprint = canonical({ action, input: parsedBody.input });
      const existing = requests.get(parsedBody.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          sendJson(response, 409, { error: { kind: 'gui-request-id-reused' } });
          return;
        }
        const repeated = await existing.result;
        sendJson(response, repeated.status, repeated.body);
        return;
      }
      if (requests.size >= MAX_REQUESTS) {
        sendJson(response, 409, { error: { kind: 'gui-request-capacity' } });
        return;
      }
      const execute = async () => {
        try {
          const result = action === 'inspect'
            ? await inventory.inspect()
            : await controller.execute(action, parsedBody.input);
          return { status: 200, body: { result, state: await controller.state() } };
        } catch (error) {
          const safe = safeError(error);
          return { status: statusFor(safe.kind), body: { error: safe } };
        }
      };
      const run = action === 'inspect' ? execute() : queue.then(execute);
      if (action !== 'inspect') queue = run.then(() => undefined, () => undefined);
      requests.set(parsedBody.requestId, { fingerprint, result: run });
      const completed = await run;
      sendJson(response, completed.status, completed.body);
    } catch (error) {
      const safe = safeError(error);
      sendJson(response, statusFor(safe.kind), { error: safe });
    }
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
  let closed = false;
  return {
    server,
    url: origin,
    async close() {
      if (closed) return;
      closed = true;
      await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
    },
  };
}
