// Synthetic fixture process only. The parent kills this child after an owned
// appearance index is staged; no personal source is admitted here.
import assert from 'node:assert/strict';
import { openWorkspace } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { discoverUserAppearance } from '../src/appearances/service.mjs';
const workspace = process.argv[2], w = await openWorkspace(workspace);
assert.match(w.reg.ownedRoot, /unharness-appearances-/);
setSourceTransactionTestHook(async phase => {
  if (phase !== 'appearance-index-staged') return;
  const resumed = new Promise(resolve => process.once('message', resolve));
  process.send({ phase });
  await resumed;
});
await discoverUserAppearance({ workspace });
