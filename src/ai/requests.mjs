// Private, conservative request receipts. Source transactions retain their own
// locks and recovery journals; an unfinished receipt never restarts a service.
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { recordId } from '../core/local-store.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';
import { openWorkspace } from '../sources/records.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const LIMIT = 1024 * 1024;
const fail = kind => { throw Object.assign(new Error(kind), { kind }); };
const validUuid = value => typeof value === 'string' && UUID.test(value);
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail('invalid-request');
}
async function info(path) {
  try { return await lstat(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
function same(a, b) { return a && b && a.dev === b.dev && a.ino === b.ino; }
async function directory(path, before) {
  const now = await info(path);
  if (!now?.isDirectory() || now.isSymbolicLink() || await realpath(path) !== path
    || (before && !same(now, before))) fail('ai-request-store-invalid');
  return now;
}
async function read(path) {
  const before = await info(path);
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > LIMIT) fail('ai-request-store-invalid');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!same(before, await handle.stat())) fail('ai-request-store-invalid');
    const buffer = Buffer.alloc(before.size + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    const bytes = buffer.subarray(0, count);
    const after = await handle.stat();
    if (bytes.length !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs
      || !same(before, await info(path))) fail('ai-request-store-invalid');
    return parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { await handle.close(); }
}
async function publish(path, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  if (bytes.length > LIMIT) fail('ai-result-too-large');
  const handle = await open(path, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

export async function createRequestLedger({ workspace, connectionId }) {
  if (!validUuid(connectionId)) fail('invalid-request');
  const registered = await openWorkspace(workspace);
  const scopeId = registered.rootScopeId;
  const root = await directory(workspace);
  const parent = join(workspace, 'ai-requests');
  const inFlight = new Map(), seen = new Set();
  let parentIdentity = (await info(parent)) ? await directory(parent) : null;
  async function check() {
    await directory(workspace, root);
    const current = await openWorkspace(workspace);
    if (current.rootScopeId !== scopeId) fail('ai-request-store-invalid');
    if (parentIdentity) await directory(parent, parentIdentity);
  }
  function claim(value, requestId) {
    exact(value, ['kind', 'schemaVersion', 'scopeId', 'requestId', 'connectionId', 'action', 'inputHash']);
    if (value.kind !== 'unharness-ai-request' || value.schemaVersion !== 1 || value.scopeId !== scopeId
      || value.requestId !== requestId || !validUuid(value.connectionId) || !HASH.test(value.inputHash)
      || typeof value.action !== 'string' || !/^[a-z][a-z-]{0,63}$/.test(value.action)) fail('ai-request-store-invalid');
    return value;
  }
  const envelope = (requestId, c, state, result) => ({
    requestId, connectionId: c?.connectionId ?? null, action: c?.action ?? null, state,
    ...(state === 'completed' ? { result } : {}),
  });
  async function lookup(requestId) {
    const path = join(parent, requestId);
    let c = null;
    try {
      if (!(await info(parent))) return { exists: false, response: envelope(requestId, null, 'not-found') };
      await directory(parent, parentIdentity);
      if (!(await info(path))) return { exists: false, response: envelope(requestId, null, 'not-found') };
      await directory(path);
      c = claim(await read(join(path, 'request.json')), requestId);
      const receipt = await read(join(path, 'result.json'));
      if (!receipt) return { exists: true, claim: c, response: envelope(requestId, c, 'unconfirmed') };
      exact(receipt, ['kind', 'schemaVersion', 'scopeId', 'requestId', 'requestHash', 'resultHash', 'result']);
      if (receipt.kind !== 'unharness-ai-result' || receipt.schemaVersion !== 1 || receipt.scopeId !== scopeId
        || receipt.requestId !== requestId || receipt.requestHash !== recordId('application', c)
        || receipt.resultHash !== recordId('application', { result: receipt.result })) fail('ai-request-store-invalid');
      return { exists: true, claim: c, response: envelope(requestId, c, 'completed', receipt.result) };
    } catch { return { exists: true, claim: c, response: envelope(requestId, c, 'unconfirmed') }; }
  }
  function fingerprint(value) {
    exact(value, ['connectionId', 'requestId', 'action', 'input']);
    if (!validUuid(value.connectionId) || !validUuid(value.requestId)
      || typeof value.action !== 'string' || !/^[a-z][a-z-]{0,63}$/.test(value.action)) fail('invalid-request');
    const inputHash = recordId('application', { action: value.action, input: value.input });
    return { kind: 'unharness-ai-request', schemaVersion: 1, scopeId,
      requestId: value.requestId, connectionId: value.connectionId, action: value.action, inputHash };
  }
  async function run(value, c, perform) {
    await check();
    const previous = await lookup(value.requestId);
    if (previous.exists) {
      if (previous.claim && recordId('application', previous.claim) !== recordId('application', c)) fail('ai-request-conflict');
      return previous.response;
    }
    if (seen.has(value.requestId)) return envelope(value.requestId, c, 'unconfirmed');
    if (value.connectionId !== connectionId) fail('ai-connection-changed');
    seen.add(value.requestId);
    try { await mkdir(parent, { mode: 0o700 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    parentIdentity = await directory(parent, parentIdentity);
    const path = join(parent, value.requestId);
    try { await mkdir(path, { mode: 0o700 }); }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const raced = await lookup(value.requestId);
      if (raced.claim && recordId('application', raced.claim) !== recordId('application', c)) fail('ai-request-conflict');
      return raced.response;
    }
    const requestDirectory = await directory(path);
    try {
      await publish(join(path, 'request.json'), c);
      await check();
      await directory(path, requestDirectory);
      const result = await perform();
      // Keep uncertainty on a failed receipt write, even if the service returned.
      const resultHash = recordId('application', { result });
      await check();
      await directory(path, requestDirectory);
      await publish(join(path, 'result.json'), { kind: 'unharness-ai-result', schemaVersion: 1,
        scopeId, requestId: value.requestId, requestHash: recordId('application', c), resultHash, result });
      const confirmed = await lookup(value.requestId);
      if (confirmed.response.state !== 'completed') fail('ai-operation-unconfirmed');
      return confirmed.response;
    } catch { fail('ai-operation-unconfirmed'); }
  }
  return {
    async status(requestId) {
      if (!validUuid(requestId)) fail('invalid-request');
      await check();
      if (inFlight.has(requestId)) return envelope(requestId, inFlight.get(requestId).claim, 'running');
      const found = await lookup(requestId);
      return !found.exists && seen.has(requestId) ? envelope(requestId, null, 'unconfirmed') : found.response;
    },
    async execute(value, perform) {
      const c = fingerprint(value), active = inFlight.get(value.requestId);
      if (active) {
        if (recordId('application', active.claim) !== recordId('application', c)) fail('ai-request-conflict');
        return active.promise;
      }
      const promise = run(value, c, perform);
      inFlight.set(value.requestId, { claim: c, promise });
      try { return await promise; } finally { inFlight.delete(value.requestId); }
    },
  };
}
