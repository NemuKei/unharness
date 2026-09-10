// Started only by the local launcher; stdout is never a log or control channel.
import { resolveWorkbenchTarget } from './launch-target.mjs';
import { readLaunchReceipt, validateLaunchReceipt } from './launch-records.mjs';
import { startGuiServer } from './server.mjs';
import { createLaunchHandler } from './launch-protocol.mjs';
import { fileURLToPath } from 'node:url';
import { watchableRuntime } from './runtime-lifetime.mjs';

let running, receipt, bound, lifetimeTimer, stopping = false;
async function close() {
  if (stopping) return;
  stopping = true;
  clearInterval(lifetimeTimer);
  try { await running?.close(); } finally { process.exit(0); }
}
process.once('SIGTERM', close); process.once('SIGINT', close);
process.once('disconnect', async () => {
  try {
    const saved = bound && await readLaunchReceipt(bound);
    if (running && saved?.phase === 'running' && saved.launchId === receipt.launchId
      && saved.pid === process.pid && saved.key === receipt.key && saved.loopbackOrigin === running.url) return;
  } catch {}
  await close();
});
const timeout = setTimeout(() => { void close(); }, 10000);
process.once('message', async message => {
  clearTimeout(timeout);
  try {
    if (message?.kind !== 'start' || Object.keys(message).sort().join() !== 'assetsDirectory,kind,receipt,recovery,target') throw new Error();
    bound = await resolveWorkbenchTarget(message.target);
    receipt = validateLaunchReceipt(message.receipt, bound);
    if (receipt.phase !== 'starting' || receipt.pid !== process.pid) throw new Error();
    const intact = await watchableRuntime(fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, ''));
    if (intact) {
      let checking = false;
      lifetimeTimer = setInterval(async () => {
        if (checking) return;
        checking = true;
        try { if (!await intact()) await close(); } finally { checking = false; }
      }, 500);
    }
    const recoveryBinding = message.recovery ? await (await import('../setup/plugin-recovery.mjs')).openRecoveryBinding(message.recovery) : null;
    if (recoveryBinding && (await recoveryBinding.read()).contextKey !== bound.contextKey) throw new Error();
    running = await startGuiServer({ ...(recoveryBinding ? { recoveryBinding }
      : { manageSources: bound.context, sourceWorkspace: bound.workspace ?? undefined }),
      launchId: receipt.launchId, assetsDirectory: message.assetsDirectory }, {
      handleControlRequest: createLaunchHandler({ current: () => receipt.loopbackOrigin ? receipt : null, close,
        issuePairing: () => running.requestPublicPairing() }),
    });
    receipt = { ...receipt, phase: 'running', loopbackOrigin: running.url };
    if (!process.connected || stopping) { await close(); return; }
    process.send({ kind: 'ready', launchId: receipt.launchId, loopbackOrigin: running.url });
  } catch { await close(); }
});
