import { createHash, randomUUID } from 'node:crypto';
import { fork } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import { canonical } from '../sources/platform.mjs';
import { acquire } from '../sources/transaction.mjs';
import { LAUNCH_PROTOCOL, launchFail, launchDirectory, readLaunchReceipt, publishLaunchReceipt, processPresent } from './launch-records.mjs';
import { nonce, probeLaunch, signature, launchRequest } from './launch-protocol.mjs';
import { resolveWorkbenchTarget } from './launch-target.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const worker = fileURLToPath(new URL('./launch-worker.mjs', import.meta.url));
const assets = resolve(root, 'dist');
const summary = (r, status, extra = {}) => ({ kind: 'unharness-workbench', schemaVersion: 1, status,
  protocolVersion: LAUNCH_PROTOCOL, launchId: r?.launchId ?? null, rootScopeId: r?.rootScopeId ?? null,
  loopbackOrigin: status === 'running' ? r.loopbackOrigin : null, webOrigin: null, runtimeId: r?.runtimeId ?? null, ...extra });
async function withLock(w, perform) {
  const directory = await launchDirectory(w, true);
  const until = Date.now() + 8000;
  let release;
  while (!release) {
    try { release = await acquire({ workspace: w.contextKey, owner: directory.path }, true); }
    catch (e) { if (e.kind !== 'profile-busy' || Date.now() >= until) launchFail('gui-launch-busy'); await delay(40); }
  }
  try { return await perform(); } finally { await release(); }
}
async function runtimeIdentity(assetsDirectory) {
  await canonical(assetsDirectory);
  const hash = createHash('sha256').update(root + '\n' + assetsDirectory);
  for (const path of [join(root, 'package.json'), worker, fileURLToPath(new URL('./server.mjs', import.meta.url)), join(assetsDirectory, 'index.html')]) hash.update(await readFile(path));
  return hash.digest('hex');
}
async function stopOwned(w, receipt) {
  if (receipt.phase === 'stopped' || !processPresent(receipt.pid)) return summary(receipt, 'stopped');
  if (!await probeLaunch(receipt)) launchFail('gui-launch-unconfirmed');
  const value = { launchId: receipt.launchId, nonce: nonce() };
  try {
    const response = await launchRequest(receipt.loopbackOrigin, '/_unharness/stop', { ...value, signature: signature(receipt.key, 'stop', value) });
    if (response.stopping !== true || response.launchId !== receipt.launchId) launchFail('gui-launch-unconfirmed');
  } catch { launchFail('gui-launch-unconfirmed'); }
  const until = Date.now() + 8000;
  while (processPresent(receipt.pid) && Date.now() < until) await delay(40);
  if (processPresent(receipt.pid)) launchFail('gui-launch-unconfirmed');
  await publishLaunchReceipt(w, { ...receipt, phase: 'stopped' }, receipt);
  return summary(receipt, 'stopped');
}
export async function workbenchStatus(input) {
  const w = await resolveWorkbenchTarget(input), receipt = await readLaunchReceipt(w);
  if (!receipt) return summary(null, 'not-started');
  if (await probeLaunch(receipt)) return summary(receipt, 'running', { rootScopeId: w.rootScopeId });
  return summary(receipt, receipt.phase === 'stopped' || !processPresent(receipt.pid) ? 'stopped' : 'unknown');
}
export async function stopWorkbench(input) {
  const w = await resolveWorkbenchTarget(input);
  return withLock(w, async () => {
    const receipt = await readLaunchReceipt(w);
    return receipt ? stopOwned(w, receipt) : summary(null, 'stopped');
  });
}
export async function openWorkbench(input, { assetsDirectory = assets } = {}) {
  const w = await resolveWorkbenchTarget(input);
  const runtimeId = await runtimeIdentity(assetsDirectory);
  return withLock(w, async () => {
    const previous = await readLaunchReceipt(w);
    let expected = previous;
    if (await probeLaunch(previous)) {
      if (previous.runtimeId === runtimeId) return summary(previous, 'running', { rootScopeId: w.rootScopeId, reused: true });
      await stopOwned(w, previous);
      expected = await readLaunchReceipt(w);
      if (!isDeepStrictEqual(expected, previous) && !isDeepStrictEqual(expected, { ...previous, phase: 'stopped' })) launchFail('gui-launch-record-changed');
    } else if (previous && previous.phase !== 'stopped' && processPresent(previous.pid)) launchFail('gui-launch-unconfirmed');
    const launchId = randomUUID(), key = nonce();
    const child = fork(worker, [], { execPath: process.execPath, execArgv: [], detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'json' });
    let finished = false;
    const ready = new Promise((resolveReady, reject) => {
      const timer = setTimeout(() => { finished = true; reject(new Error('timeout')); }, 8000);
      const fail = () => { if (!finished) { finished = true; clearTimeout(timer); reject(new Error('launch-failed')); } };
      child.on('error', fail); child.once('exit', fail);
      child.on('message', message => {
        if (finished) return;
        finished = true; clearTimeout(timer);
        message?.kind === 'ready' && message.launchId === launchId ? resolveReady(message) : reject(new Error('launch-failed'));
      });
    });
    // Install a handler immediately: a spawn failure can precede the first
    // durable write, without producing an unhandled promise rejection.
    ready.catch(() => {});
    const starting = { kind: 'unharness-workbench-process', schemaVersion: 1, protocolVersion: LAUNCH_PROTOCOL,
      phase: 'starting', contextKey: w.contextKey, rootScopeId: w.rootScopeId, launchId, runtimeId, key,
      pid: child.pid, loopbackOrigin: null };
    try {
      await publishLaunchReceipt(w, starting, expected);
      child.send({ kind: 'start', target: { context: w.context }, assetsDirectory, receipt: starting });
      const message = await ready;
      const receipt = await publishLaunchReceipt(w, { ...starting, phase: 'running', loopbackOrigin: message.loopbackOrigin }, starting);
      if (!await probeLaunch(receipt)) launchFail('gui-launch-unconfirmed');
      return summary(receipt, 'running', { reused: false });
    } catch { launchFail('gui-launch-unconfirmed'); }
    finally { if (child.connected) child.disconnect(); child.unref(); }
  });
}
