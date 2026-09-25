#!/usr/bin/env node
// Synthetic Codex RPC peer. It exits immediately during broad node --test discovery.
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const scenario = process.env.UNHARNESS_QUALIFY_TEST_SCENARIO;
const log = process.env.UNHARNESS_QUALIFY_TEST_LOG;
if (scenario && process.argv[2] === '--version') { process.stdout.write('codex-cli 0.155.0-alpha.16.4\n'); process.exit(0); }
if (!scenario || !log || !process.env.CODEX_HOME || process.argv[2] !== 'app-server') process.exit(0);
const file = join(process.env.CODEX_HOME, 'config.toml');
const version = text => createHash('sha256').update(text).digest('hex');
const send = (id, result) => process.stdout.write(JSON.stringify({ id, result }) + '\n');
const skillPath = () => (readFile(file, 'utf8').then(text => /\[\[skills\.config\]\]\s*path\s*=\s*"([^"]+)"/.exec(text)?.[1]));
await appendFile(log, JSON.stringify({ phase: 'start', home: process.env.HOME, profile: process.env.CODEX_HOME,
  cwd: process.cwd(), skill: (await skillPath())?.replace('/SKILL.md', '') }) + '\n');
function config(text) {
  const skill = /\[\[skills\.config\]\]\s*path\s*=\s*"([^"]+)"\s*enabled\s*=\s*(true|false)/.exec(text);
  const plugins = {};
  for (const match of text.matchAll(/\[plugins\."([^"]+)"\]\s*enabled\s*=\s*(true|false)\s*note\s*=\s*"([^"]+)"/g))
    plugins[match[1]] = { enabled: match[2] === 'true', note: match[3] };
  return { model: /model\s*=\s*"([^"]+)"/.exec(text)?.[1],
    approval_policy: /approval_policy\s*=\s*"([^"]+)"/.exec(text)?.[1],
    sandbox_mode: /sandbox_mode\s*=\s*"([^"]+)"/.exec(text)?.[1],
    skills: { config: skill ? [{ path: skill[1], enabled: skill[2] === 'true' }] : [] },
    plugins };
}
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  if (message.method === 'initialized' || message.error) continue;
  if (scenario === 'timeout') continue;
  if (message.method === 'initialize') send(message.id, { userAgent: 'probe/0.155.0-alpha.16.4 (fixture)', codexHome: process.env.CODEX_HOME });
  else if (message.method === 'skills/list') send(message.id, { data: [{ cwd: process.cwd(), skills: [], errors: [] }] });
  else if (message.method === 'config/read') {
    const text = await readFile(file, 'utf8');
    const parsed = config(text);
    send(message.id, { config: parsed, layers: [{ name: { type: 'user', file }, version: version(text), config: parsed }] });
  } else if (message.method === 'skills/config/write') {
    let text = await readFile(file, 'utf8');
    if (message.params.path !== config(text).skills.config[0]?.path || typeof message.params.enabled !== 'boolean') process.exit(70);
    if (message.params.enabled && scenario === 'no-enable-no-plugin')
      text = text.replace(/\[\[skills\.config\]\]\s*path\s*=\s*"[^"]+"\s*enabled\s*=\s*false\s*/, '');
    else text = text.replace(/(\[\[skills\.config\]\]\s*path\s*=\s*"[^"]+"\s*enabled\s*=\s*)(true|false)/,
      '$1' + message.params.enabled);
    await writeFile(file, text);
    send(message.id, { effectiveEnabled: message.params.enabled });
  } else if (message.method === 'config/batchWrite') {
    const before = await readFile(file, 'utf8');
    const { filePath, expectedVersion, reloadUserConfig, edits } = message.params;
    if (filePath !== file || expectedVersion !== version(before) || reloadUserConfig !== false || edits.length !== 1
      || edits[0].keyPath !== 'plugins."synthetic.probe".enabled' || edits[0].value !== false) process.exit(71);
    let after = scenario === 'no-enable-no-plugin' ? before : before.replace(/(\[plugins\."synthetic\.probe"\]\s*enabled\s*=\s*)true/, '$1false');
    if (scenario === 'tamper-plugin-peer') after = after.replace(/(\[plugins\."synthetic\.peer"\]\s*enabled\s*=\s*)false/, '$1true');
    await writeFile(file, after);
    send(message.id, { status: 'ok', version: version(after), filePath: file });
  } else process.exit(72);
}
