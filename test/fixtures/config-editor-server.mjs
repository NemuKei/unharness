// Synthetic executable for the editor boundary, intentionally supporting only
// the literal TOML forms used by these tests. Native TOML coverage is separate.
import { createInterface } from 'node:readline';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const scenario = process.argv[2];
const record = process.argv[3];
// Node's broad test discovery also visits fixtures without their controls.
if (!scenario || !record) process.exit(0);
const file = join(process.env.CODEX_HOME, 'config.toml');
let config;
let version = 'v1';
const initial = await readFile(file, 'utf8');
await appendFile(record, JSON.stringify({ profile: process.env.CODEX_HOME, cwd: process.cwd(), pid: process.pid, initial }) + '\n');
function parseFixtureToml(text) {
  const out = {}; let target = out;
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const array = line.match(/^\[\[skills.config\]\]$/);
    if (array) { out.skills ??= {}; out.skills.config ??= []; target = {}; out.skills.config.push(target); continue; }
    const table = line.match(/^\[([a-z_]+)\]$/);
    if (table) { target = out[table[1]] ??= {}; continue; }
    const assignment = line.match(/^([a-z_]+) = (.+)$/);
    if (!assignment) throw Error('unsupported fixture syntax');
    target[assignment[1]] = JSON.parse(assignment[2]);
  }
  return out;
}
config = parseFixtureToml(initial);
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const respond = (id, result) => send({ jsonrpc: '2.0', id, result });
if (scenario === 'timeout') { process.stdin.resume(); setInterval(() => {}, 1000); }
else for await (const line of createInterface({ input: process.stdin })) {
  const msg = JSON.parse(line);
  await appendFile(record, JSON.stringify(msg) + '\n');
  if (msg.method === 'initialized') continue;
  if (msg.error) continue;
  if (msg.method === 'initialize') {
    if (scenario === 'rpc-error') { send({ id: msg.id, error: { code: -32000, message: 'SECRET_MARKER', data: { path: '/private/SECRET_MARKER' } } }); continue; }
    respond(msg.id, { userAgent: 'Codex Desktop/0.153.4 (fixture)', codexHome: process.env.CODEX_HOME });
    send({ id: 'inbound', method: 'item/commandExecution/requestApproval', params: { command: 'SECRET_MARKER' } });
  } else if (msg.method === 'config/read') {
    respond(msg.id, { config, layers: scenario === 'missing-user' ? [] : [{ name: { type: 'user', file }, version, config }] });
  } else if (['skills/config/write', 'config/batchWrite'].includes(msg.method)) {
    if (scenario === 'write-error') { send({ id: msg.id, error: { code: -32000, message: 'SECRET_MARKER write failed' } }); continue; }
    config.skills ??= {};
    config.skills.config ??= [];
    if (msg.method === 'config/batchWrite') {
      if (msg.params.filePath !== file || msg.params.expectedVersion !== version || msg.params.reloadUserConfig !== false || msg.params.edits.length !== 1 || msg.params.edits[0].keyPath !== 'skills.config' || msg.params.edits[0].mergeStrategy !== 'replace') process.exit(71);
      config.skills.config = msg.params.edits[0].value;
    } else {
      if (Object.keys(msg.params).sort().join(',') !== 'enabled,path' || !['/skills/selected/SKILL.md', '/skills/new/SKILL.md'].includes(msg.params.path) || msg.params.enabled !== false) process.exit(71);
      const entry = config.skills.config.find(item => item.path === msg.params.path);
      if (entry) entry.enabled = false;
      else config.skills.config.push({ path: msg.params.path, enabled: false });
    }
    if (scenario === 'tamper-retained') config.memories.use_memories = true;
    if (scenario === 'tamper-selected') config.skills.config[0].enabled = true;
    version = 'v2';
    let prefix = initial.split('[[skills.config]]')[0];
    if (scenario === 'drop-comments') prefix = prefix.replace(/^#.*\n/gm, '');
    if (scenario === 'relocate-comment') prefix = prefix.replace(/^(#.*\n)([^\n]*\n)/, '$2$1');
    await writeFile(file, prefix + config.skills.config.map(item => '[[skills.config]]\n' + Object.entries(item).map(([k, v]) => `${k} = ${JSON.stringify(v)}\n`).join('')).join(''));
    respond(msg.id, msg.method === 'config/batchWrite' ? { status: 'ok', version, filePath: file } : { effectiveEnabled: false });
  } else process.exit(72); // No model/task/other write APIs are available.
}
