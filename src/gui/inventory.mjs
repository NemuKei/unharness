import { lstat, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { collectSourceInventory } from '../codex/inventory.mjs';

function fail(kind) {
  throw Object.assign(new Error(kind), { kind });
}

export async function normalizeInventoryOptions(options) {
  if (options === undefined) return undefined;
  if (typeof options.cwd !== 'string' || options.cwd.trim() === '') fail('gui-inventory-target-invalid');
  const executable = options.executable ?? 'codex';
  if (typeof executable !== 'string' || executable.trim() === '' || /\.(?:cmd|bat)$/i.test(executable)) {
    fail('gui-inventory-native-executable-required');
  }
  let cwd;
  try {
    cwd = await realpath(resolve(options.cwd));
    if (!(await lstat(cwd)).isDirectory()) fail('gui-inventory-target-invalid');
  } catch { fail('gui-inventory-target-invalid'); }
  return { cwd, executable: /[\\/]/.test(executable) ? resolve(executable) : executable };
}

export async function createGuiInventory(options, { collect = collectSourceInventory } = {}) {
  const selected = await normalizeInventoryOptions(options);
  const identity = selected ? await lstat(selected.cwd) : null;
  const launchId = randomUUID();
  let report = null;
  let pending = null;
  function state() {
    return { launchId, enabled: !!selected, cwd: selected?.cwd ?? null, report: structuredClone(report) };
  }
  async function inspect() {
    if (!selected) fail('gui-inventory-disabled');
    // Reading never occupies the fixture mutation queue, including recovery.
    // Concurrent callers share one bounded collection for this selected context.
    if (!pending) {
      pending = (async () => {
        let current;
        try {
          current = await lstat(selected.cwd);
          if (!current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev
            || current.ino !== identity.ino || await realpath(selected.cwd) !== selected.cwd) throw new Error();
        } catch { fail('gui-inventory-target-changed'); }
        report = await collect(selected);
        return state();
      })().finally(() => { pending = null; });
    }
    return pending;
  }
  return { state, inspect };
}
