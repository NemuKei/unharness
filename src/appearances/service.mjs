import { randomBytes } from 'node:crypto';
import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace } from '../sources/records.mjs';
import { acquire, pending } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';
import { initializeAppearance, discoverPrepared, selectOwned } from './lifecycle.mjs';
import { readAppearanceStore, appearanceStoreSummary, publishAppearanceState, recoverAppearanceStore } from './store.mjs';

const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const request = (args, required = [], optional = []) => exactKeys(args, ['workspace', ...required], optional, 'invalid-request');
async function locked(workspace, action, recovery = false) {
  const initial = await openWorkspace(workspace), release = await acquire(initial, recovery);
  try {
    if (await pending(workspace)) fail('recovery-required');
    const w = await openWorkspace(workspace);
    if (w.scopeId !== initial.scopeId) fail('workspace-invalid');
    return await action(w);
  } finally { await release(); }
}
export async function readUserAppearance(args) {
  request(args);
  const w = await openWorkspace(args.workspace);
  return appearanceStoreSummary(w, await readAppearanceStore(w));
}
export async function discoverUserAppearance(args) {
  request(args, [], ['expectedStateId']);
  if (args.expectedStateId !== undefined && !hash(args.expectedStateId)) fail('invalid-request');
  return locked(args.workspace, async w => {
    const before = await readAppearanceStore(w);
    if (before.journal) fail('appearance-recovery-required');
    if (args.expectedStateId === undefined && before.state) return appearanceStoreSummary(w, before);
    if (args.expectedStateId !== undefined && args.expectedStateId !== before.stateId) fail('appearance-state-conflict');
    const seed = randomBytes(32).toString('hex');
    const next = before.state ? discoverPrepared(before.state, seed) : initializeAppearance(w.scopeId, seed);
    return appearanceStoreSummary(w, await publishAppearanceState(w, before, next));
  });
}
export async function selectUserAppearance(args) {
  request(args, ['itemId', 'expectedStateId']);
  if (!hash(args.itemId) || !hash(args.expectedStateId)) fail('invalid-request');
  return locked(args.workspace, async w => {
    const before = await readAppearanceStore(w);
    if (before.journal) fail('appearance-recovery-required');
    if (!before.state || args.expectedStateId !== before.stateId) fail('appearance-state-conflict');
    const next = selectOwned(before.state, args.itemId);
    if (next.revision === before.state.revision) return appearanceStoreSummary(w, before);
    return appearanceStoreSummary(w, await publishAppearanceState(w, before, next));
  });
}
export async function recoverUserAppearance(args) {
  request(args);
  return locked(args.workspace, async w => appearanceStoreSummary(w, await recoverAppearanceStore(w)), true);
}
