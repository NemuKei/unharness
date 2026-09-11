// Synthetic protocol peer for the plugin editor. It edits only the literal
// table forms in these fixtures; real native TOML behavior is checked separately.
import { createInterface } from 'node:readline';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { parse } from '../../src/vendor/smol-toml/parse.js';

const scenario = process.argv[2], record = process.argv[3];
if (!scenario || !record) process.exit(0);
const file = join(process.env.CODEX_HOME, 'config.toml');
const initial = await readFile(file, 'utf8');
await appendFile(record, JSON.stringify({ profile: process.env.CODEX_HOME, cwd: process.cwd(), pid: process.pid }) + '\n');
const version = text => createHash('sha256').update(text).digest('hex');
const selected = 'selected.fixture@synthetic-market';
const peer = 'other.fixture@synthetic-market';
let written = false, expectedWritten;
const send = (id, result) => process.stdout.write(JSON.stringify({ id, result }) + '\n');
const reject = id => process.stdout.write(JSON.stringify({ id, error: { code: -32600, message: 'PRIVATE_PLUGIN_MARKER' } }) + '\n');
const nativeConfig = text => JSON.parse(JSON.stringify(parse(text, { integersAsBigInt: true }),
  (_, value) => typeof value === 'bigint' ? Number(value) : value));
function tableId(line) {
  const match = /^\[plugins\.("(?:[^"\\]|\\.)*")\]\s*(?:#.*)?$/.exec(line.trim());
  return match ? JSON.parse(match[1]) : null;
}
function disable(text, pluginId) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  let first = lines.findIndex(line => tableId(line) === pluginId);
  if (first === -1) {
    let at = lines.findIndex(line => line === '# retained settings after plugins');
    if (at === -1) at = lines.length - (lines.at(-1) === '' ? 1 : 0);
    lines.splice(at, 0, '', '[plugins.' + JSON.stringify(pluginId) + ']', 'enabled = false', '');
  } else {
    let end = first + 1;
    while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
    const flag = lines.findIndex((line, index) => index > first && index < end && /^\s*enabled\s*=/.test(line));
    if (flag !== -1) lines[flag] = lines[flag].replace(/(enabled\s*=\s*)(true|false)/, '$1false');
    else {
      let at = end;
      while (at > first + 1 && (/^\s*$/.test(lines[at - 1]) || /^\s*#/.test(lines[at - 1]))) at--;
      if (scenario === 'steal-comment') at = lines.findIndex(line => line.startsWith('note = "keep-selected'));
      lines.splice(at, 0, 'enabled = false');
    }
  }
  return lines.join('\n').replace(/\n*$/, '\n');
}
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line);
  await appendFile(record, JSON.stringify(message) + '\n');
  if (message.method === 'initialized' || message.error) continue;
  if (message.method === 'initialize') {
    const fixtureVersion = scenario === 'new-version' ? '0.154.0' : '0.153.4';
    send(message.id, { userAgent: 'Plugin editor fixture/' + fixtureVersion + ' (fixture)',
      codexHome: scenario === 'wrong-home' ? '/synthetic/PRIVATE_PLUGIN_MARKER' : process.env.CODEX_HOME });
  } else if (message.method === 'config/read') {
    const text = await readFile(file, 'utf8');
    const config = nativeConfig(written && scenario === 'file-disagrees' ? expectedWritten : text);
    if (scenario === 'native-null') config.extra = null;
    const layer = { name: { type: 'user', file: scenario === 'wrong-file' ? file + '.other' : file }, version: version(text), config };
    send(message.id, { config, layers: scenario === 'duplicate-layer' ? [layer, structuredClone(layer)] : [layer] });
  } else if (message.method === 'config/batchWrite') {
    const { params } = message;
    const text = await readFile(file, 'utf8');
    if (Object.keys(params).sort().join() !== 'edits,expectedVersion,filePath,reloadUserConfig'
      || params.filePath !== file || params.expectedVersion !== version(text) || params.reloadUserConfig !== false
      || !Array.isArray(params.edits) || !params.edits.length || params.edits.length > 32) process.exit(71);
    if (scenario === 'write-error') { reject(message.id); continue; }
    if (scenario === 'timeout') continue;
    let output = text;
    for (const edit of params.edits) {
      const match = /^plugins\.("(?:[^"\\]|\\.)*")\.enabled$/.exec(edit.keyPath);
      if (!match || edit.value !== false || edit.mergeStrategy !== 'replace'
        || Object.keys(edit).sort().join() !== 'keyPath,mergeStrategy,value') process.exit(72);
      output = disable(output, JSON.parse(match[1]));
    }
    expectedWritten = output;
    if (scenario === 'other-plugin') output = output.replace('[plugins.' + JSON.stringify(peer) + ']\nenabled = false', '[plugins.' + JSON.stringify(peer) + ']\nenabled = true');
    if (scenario === 'selected-metadata') output = output.replace('keep-selected-plugin-metadata', 'tampered-selected-metadata');
    if (scenario === 'retained-root') output = output.replace('model = "fixture-model"', 'model = "PRIVATE_PLUGIN_MARKER"');
    if (scenario === 'drop-comment') output = output.replace('# retained root comment\n', '');
    if (scenario === 'move-comment') output = output.replace('# retained root comment\nmodel = "fixture-model"\n', 'model = "fixture-model"\n# retained root comment\n');
    if (scenario === 'float-to-integer') output = output.replace('precision = 7.0', 'precision = 7');
    if (scenario === 'datetime-to-string') output = output.replace('timestamp = 1979-05-27T07:32:00Z', 'timestamp = "1979-05-27T07:32:00.000Z"');
    if (scenario === 'file-disagrees') output = text;
    written = true;
    await writeFile(file, output);
    send(message.id, { status: 'ok', version: version(output), filePath: file, overriddenMetadata: null });
  } else process.exit(73);
}
