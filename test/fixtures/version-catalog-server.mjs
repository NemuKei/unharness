#!/usr/bin/env node
import { createInterface } from 'node:readline';

// Synthetic app-server used only to verify version propagation through catalog.
// Exit when node --test discovers this file directly instead of as app-server.
if (!process.env.UNHARNESS_FIXTURE_CODEX_VERSION || !process.argv.includes('app-server')) process.exit(0);
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.method === 'initialized') continue;
  const result = request.method === 'initialize'
    ? { codexHome: process.env.CODEX_HOME, userAgent: `fixture/${process.env.UNHARNESS_FIXTURE_CODEX_VERSION} (synthetic)` }
    : request.method === 'skills/list'
      ? { data: [{ cwd: process.cwd(), skills: [], errors: [] }] }
      : null;
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
}
