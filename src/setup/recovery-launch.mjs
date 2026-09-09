// The saved .command checks this file, its two builtin-only imports and Node
// before execution. Do not add unverified imports to this bootstrap chain.
import { fileURLToPath } from 'node:url';
import { readDistribution } from './distribution.mjs';

try {
  const expected = process.argv[2], root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
  if (!/^[a-f0-9]{64}$/.test(expected) || (await readDistribution(root)).id !== expected) throw Error();
  // All contents (including extra files and links) have now been checked. No
  // source-management or third-party code is imported before this boundary.
  const { recoveryMain } = await import('./recovery-cli.mjs');
  process.exitCode = await recoveryMain(['recovery', 'open', ...process.argv.slice(3), '--distribution-id', expected, '--browser']);
} catch {
  process.stderr.write('Unharness: recovery package verification failed.\n');
  process.exitCode = 1;
}
