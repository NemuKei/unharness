import { openWorkspace } from '../sources/records.mjs';
import { acquire, pending } from '../sources/transaction.mjs';
import { fail } from '../sources/errors.mjs';

export async function withAppearanceWorkspace(workspace, action, recovery = false) {
  const initial = await openWorkspace(workspace), release = await acquire(initial, recovery);
  try {
    if (await pending(workspace)) fail('recovery-required');
    const w = await openWorkspace(workspace);
    if (w.scopeId !== initial.scopeId) fail('workspace-invalid');
    return await action(w);
  } finally { await release(); }
}
