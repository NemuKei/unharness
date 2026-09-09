// Started only by the local launcher; stdout is never a log or control channel.
import { resolveWorkbenchTarget } from './launch-target.mjs';
import { readLaunchReceipt, validateLaunchReceipt } from './launch-records.mjs';
import { startGuiServer } from './server.mjs';
import { createLaunchHandler } from './launch-protocol.mjs';

let running, receipt, bound, stopping = false;
async function close() {
  if (stopping) return;
  stopping = true;
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
    if (message?.kind !== 'start' || Object.keys(message).sort().join() !== 'assetsDirectory,kind,receipt,target') throw new Error();
    bound = await resolveWorkbenchTarget(message.target);
    receipt = validateLaunchReceipt(message.receipt, bound);
    if (receipt.phase !== 'starting' || receipt.pid !== process.pid) throw new Error();
    running = await startGuiServer({ manageSources: bound.context, sourceWorkspace: bound.workspace ?? undefined,
      launchId: receipt.launchId, assetsDirectory: message.assetsDirectory }, {
      handleControlRequest: createLaunchHandler({ current: () => receipt.loopbackOrigin ? receipt : null, close }),
    });
    receipt = { ...receipt, phase: 'running', loopbackOrigin: running.url };
    if (!process.connected || stopping) { await close(); return; }
    process.send({ kind: 'ready', launchId: receipt.launchId, loopbackOrigin: running.url });
  } catch { await close(); }
});
