// Real loopback HTTP and the public route/policy. The remote controller is a
// double here so upload admission is tested independently of native profiles.
// Real-core review/save/reset coverage lives in gui-remote-artwork.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { register } from 'node:module';
import { PUBLIC_WEB_ORIGIN, remoteRequestShape, remoteFail } from '../src/gui/remote-policy.mjs';

const controllerUrl = new URL('../src/gui/remote-controller.mjs', import.meta.url).href;
const doubleUrl = 'data:text/javascript,' + encodeURIComponent('export const createRemoteController = async ({controller}) => controller;');
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (context.parentURL && new URL(specifier, context.parentURL).href === ${JSON.stringify(controllerUrl)})
      return { url: ${JSON.stringify(doubleUrl)}, shortCircuit: true };
    return next(specifier, context);
  }`), import.meta.url);
const { createRemoteHttp } = await import('../src/gui/remote-http.mjs');

async function fixture(t) {
  let hold = null, reads = 0, executions = 0, lastRead;
  const active = new Set(), finished = new Map(), entered = new Map();
  const controller = {
    webOrigin: PUBLIC_WEB_ORIGIN,
    async authenticate({token, origin}) {
      if (origin !== PUBLIC_WEB_ORIGIN || !['a'.repeat(64), 'b'.repeat(64)].includes(token)) remoteFail('remote-request-forbidden');
    },
    async request(operation, input, auth) {
      await this.authenticate(auth);
      if (operation === 'review-appearance-import') {
        ++executions;
        if (hold) { const current = hold; current.entered.resolve(); await current.release.promise; if (current.error) throw current.error; }
      }
      return { operation, state: operation === 'operation-status' ? 'running' : 'completed', requestId: input.requestId ?? null };
    },
    async close() {},
  };
  const handler = await createRemoteHttp({ controller, readJson: async (request, strict, limit) => {
    ++reads; lastRead = request.headers['x-test-id']; entered.get(lastRead)?.resolve();
    assert.equal(strict, true);
    if (Number(request.headers['content-length']) > limit) remoteFail('remote-request-too-large');
    let size = 0; const chunks = [];
    for await (const chunk of request) { size += chunk.length; if (size > limit) remoteFail('remote-request-too-large'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks)); } catch { remoteFail('remote-invalid-request'); }
  } });
  const server = createServer((req, res) => {
    const done = handler.publicRequest(req, res, new URL(req.url, origin), origin);
    active.add(done);
    done.finally(() => { active.delete(done); finished.get(req.headers['x-test-id'])?.resolve(); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { hold?.release.resolve(); server.closeAllConnections(); await Promise.allSettled([...active]); await handler.close(); await new Promise(resolve => server.close(resolve)); });
  const headers = token => ({ Origin: PUBLIC_WEB_ORIGIN, Authorization: 'Bearer ' + token.repeat(64),
    'Content-Type': 'application/json', 'X-Unharness-Client': '1', Connection: 'close' });
  async function call(operation, input = {}, token = 'a') {
    const response = await fetch(origin + '/remote/v2/' + operation, { method: 'POST', headers: headers(token), body: JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  }
  function partial(token = 'a') {
    const id = randomUUID(), start = Promise.withResolvers(), end = Promise.withResolvers();
    entered.set(id, start); finished.set(id, end);
    const req = httpRequest(origin + '/remote/v2/review-appearance-import', { method: 'POST',
      headers: { ...headers(token), 'X-Test-Id': id, 'Content-Length': 2097152 } });
    req.on('error', () => {}); req.on('response', response => response.resume());
    req.write('{');
    t.after(() => req.destroy());
    return { req, entered: start.promise, finished: end.promise };
  }
  async function headerOnly(token = 'b') {
    return new Promise((resolve, reject) => {
      const req = httpRequest(origin + '/remote/v2/review-appearance-import', { method: 'POST',
        headers: { ...headers(token), 'Content-Length': 2097152 } }, response => {
        const chunks = []; response.on('data', data => chunks.push(data));
        response.on('end', () => { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }); req.destroy(); });
      });
      req.on('error', reject); req.setTimeout(1000, () => req.destroy(Error('second upload body was awaited'))); req.flushHeaders();
    });
  }
  return { call, partial, headerOnly, get reads() { return reads; }, get executions() { return executions; },
    hold(error = null) { const value = { entered: Promise.withResolvers(), release: Promise.withResolvers(), error }; hold = value; return value; },
    unhold() { hold = null; } };
}

test('an empty public name is a reset, not an invalid request', () => {
  const input = { requestId: randomUUID(), itemId: 'a'.repeat(64), expectedStateId: 'b'.repeat(64), name: '' };
  assert.deepEqual(remoteRequestShape('name-appearance', input), input);
  for (const name of [null, '\0', 'x'.repeat(81)]) assert.throws(() => remoteRequestShape('name-appearance', { ...input, name }));
});

test('one server-wide upload slot rejects the next body and releases after partial disconnect', { timeout: 10000 }, async t => {
  const s = await fixture(t), first = s.partial(); await first.entered;
  const before = s.reads;
  const denied = await s.headerOnly();
  assert.equal(denied.status, 409); assert.equal(denied.body.error.kind, 'remote-capacity');
  assert.equal(s.reads, before, 'a different connection cannot allocate a second upload body');
  assert.equal((await s.call('status')).status, 200);
  assert.equal((await s.call('operation-status', { requestId: randomUUID() })).body.state, 'running');
  first.req.destroy(); await first.finished;
  assert.equal((await s.call('review-appearance-import', { requestId: randomUUID() })).status, 200);
  assert.equal(s.executions, 1);
});

test('a malformed complete body releases the upload slot without running a review', { timeout: 10000 }, async t => {
  const s = await fixture(t), first = s.partial(); await first.entered;
  // End the declared body at its exact length, but keep it invalid JSON.
  first.req.end('x'.repeat(2097151)); await first.finished;
  assert.equal(s.executions, 0);
  assert.equal((await s.call('review-appearance-import', { requestId: randomUUID() })).status, 200);
});

for (const fails of [false, true]) test(`the slot covers queued execution and is released on ${fails ? 'exception' : 'completion'}`, { timeout: 10000 }, async t => {
  const s = await fixture(t), held = s.hold(fails ? Object.assign(Error('PRIVATE_TEST'), {kind:'appearance-import-invalid'}) : null);
  const first = s.call('review-appearance-import', { requestId: randomUUID() }); await held.entered.promise;
  const before = s.reads;
  assert.equal((await s.headerOnly()).body.error.kind, 'remote-capacity'); assert.equal(s.reads, before);
  assert.equal((await s.call('status')).status, 200);
  held.release.resolve(); const response = await first;
  assert.equal(response.status, fails ? 400 : 200); assert.ok(!JSON.stringify(response).includes('PRIVATE_TEST'));
  s.unhold(); assert.equal((await s.call('review-appearance-import', { requestId: randomUUID() })).status, 200);
});
