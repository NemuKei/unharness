#!/usr/bin/env node
// Complete read-only response shape of the exercised 0.153.4 native boundary.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
if (!process.argv.includes('app-server')) process.exit(70);
const data = JSON.parse(await readFile(join(process.env.CODEX_HOME, 'replay-native.json'), 'utf8'));
const n = data.native;
let configReads = 0;
for await (const line of createInterface({ input: process.stdin })) {
  const msg = JSON.parse(line); if (msg.method === 'initialized') continue;
  let result;
  if (msg.method === 'initialize') result = { codexHome: process.env.CODEX_HOME, userAgent: `Codex Desktop/${data.version ?? '0.153.4'} synthetic` };
  else if (msg.method === 'config/read') {
    if (msg.params.cwd !== n.context.project || msg.params.includeLayers !== true) process.exit(72);
    configReads += 1;
    const config = structuredClone(n.config);
    if (data.changeAfterRead && configReads > 1) config.memories.use_memories = false;
    if (data.omitPolicy) delete config.sandbox_mode;
    result = { config, layers: n.layers, origins: {} };
  } else if (['skills/list', 'hooks/list'].includes(msg.method)) {
    if (msg.params.cwds?.length !== 1 || msg.params.cwds[0] !== n.context.project || msg.params.forceReload !== true) process.exit(72);
    result = { data: [{ cwd: n.context.project, ...(msg.method === 'skills/list'
      ? { skills: n.skills, errors: data.skillErrors ?? [] } : { hooks: n.hooks, errors: [], warnings: [] }) }] };
  } else if (msg.method === 'configRequirements/read') result = n.requirements;
  else process.exit(71); // Writes and model-task methods are never allowed.
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
}
