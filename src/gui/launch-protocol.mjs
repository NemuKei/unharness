import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { parseStrictJson } from '../core/strict-json.mjs';
import { validLoopback } from './launch-records.mjs';

const HASH = /^[a-f0-9]{64}$/;
export const nonce = () => randomBytes(32).toString('hex');
export const signature = (key, action, value) => createHmac('sha256', Buffer.from(key, 'hex')).update(action + '\n' + JSON.stringify(value)).digest('hex');
export function matchesSignature(key, action, value, signed) {
  return typeof signed === 'string' && HASH.test(signed)
    && timingSafeEqual(Buffer.from(signature(key, action, value), 'hex'), Buffer.from(signed, 'hex'));
}
export function launchInfo(receipt) {
  const { schemaVersion, protocolVersion, launchId, rootScopeId, runtimeId, pid, loopbackOrigin } = receipt;
  return { schemaVersion, protocolVersion, launchId, rootScopeId, runtimeId, pid, loopbackOrigin };
}
export function launchRequest(origin, path, body) {
  if (!validLoopback(origin)) return Promise.reject(new Error('invalid-loopback'));
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const request = httpRequest(origin + path, { method: data === null ? 'GET' : 'POST',
      signal: AbortSignal.timeout(1500), headers: data === null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, response => {
      let count = 0; const chunks = [];
      response.on('data', chunk => {
        count += chunk.length;
        if (count > 4096) { response.destroy(); reject(new Error('oversize')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          if (response.statusCode !== 200) throw new Error('invalid-response');
          resolve(parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))));
        } catch (e) { reject(e); }
      });
    });
    request.on('error', reject);
    request.end(data);
  });
}
export async function probeLaunch(receipt) {
  if (!receipt?.loopbackOrigin || receipt.phase !== 'running') return false;
  try {
    const challenge = nonce();
    const result = await launchRequest(receipt.loopbackOrigin, '/_unharness/launch?challenge=' + challenge);
    const info = launchInfo(receipt);
    return JSON.stringify(result.info) === JSON.stringify(info)
      && matchesSignature(receipt.key, 'launch', { challenge, info }, result.signature);
  } catch { return false; }
}

// This channel is for the private launcher only. A browser cannot use either
// its ordinary GUI token or a claimed local origin to control the process.
export function createLaunchHandler({ current, close }) {
  return async (request, response) => {
    const receipt = current();
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); response.end(JSON.stringify(body)); };
    if (!receipt || request.headers.host !== new URL(receipt.loopbackOrigin).host || request.headers.origin !== undefined
      || Object.keys(request.headers).some(k => k.startsWith('sec-fetch-'))) { send(403, { error: { kind: 'gui-request-forbidden' } }); return; }
    const url = new URL(request.url, receipt.loopbackOrigin);
    if (request.method === 'GET' && url.pathname === '/_unharness/launch'
      && [...url.searchParams.keys()].join() === 'challenge' && HASH.test(url.searchParams.get('challenge'))) {
      const info = launchInfo(receipt), challenge = url.searchParams.get('challenge');
      send(200, { info, signature: signature(receipt.key, 'launch', { challenge, info }) }); return;
    }
    if (request.method === 'POST' && url.pathname === '/_unharness/stop' && !url.search) {
      try {
        let size = 0; const chunks = [];
        for await (const chunk of request) { size += chunk.length; if (size > 1024) throw new Error(); chunks.push(chunk); }
        const body = parseStrictJson(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        if (!body || Object.keys(body).sort().join() !== 'launchId,nonce,signature' || body.launchId !== receipt.launchId
          || !HASH.test(body.nonce) || !matchesSignature(receipt.key, 'stop', { launchId: body.launchId, nonce: body.nonce }, body.signature)) throw new Error();
        response.once('finish', () => { void close(); });
        send(200, { stopping: true, launchId: receipt.launchId }); return;
      } catch {}
    }
    send(403, { error: { kind: 'gui-request-forbidden' } });
  };
}
