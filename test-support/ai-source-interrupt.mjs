// Synthetic test process only: pause after a journaled source write so the
// parent can kill the MCP connection before either completion receipt exists.
import assert from 'node:assert/strict';
import { openWorkspace } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { serveAiStdio } from '../src/ai/server.mjs';

const workspace = process.argv[2];
const registered = await openWorkspace(workspace);
assert.match(registered.reg.context.codexHome, /unharness-ai-test-/);
setSourceTransactionTestHook(async phase => {
  if (phase !== 'write-0') return;
  process.stderr.write('UNHARNESS_TEST_SOURCE_PAUSED\n');
  await new Promise(() => {});
});
process.exitCode = await serveAiStdio({ workspace });
