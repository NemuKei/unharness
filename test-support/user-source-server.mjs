#!/usr/bin/env node
// Hermetic synthetic native executable; only supports this test profile's TOML.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
if (!process.argv.includes('app-server')) process.exit(0);
const home = process.env.CODEX_HOME,
  file = join(home, 'config.toml');
let text = '';
try {
  text = await readFile(file, 'utf8');
} catch {}
const config = {};
let target = config;
for (const line of text.split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  if (line === '[[skills.config]]') {
    config.skills ??= {};
    config.skills.config ??= [];
    target = {};
    config.skills.config.push(target);
    continue;
  }
  const table = line.match(/^\[([a-z_]+)\]$/);
  if (table) {
    target = config[table[1]] ??= {};
    continue;
  }
  const kv = line.match(/^([a-z_]+) = (.+)$/);
  if (!kv) process.exit(73);
  target[kv[1]] = JSON.parse(kv[2]);
}
let version = 'one';
for await (const line of createInterface({ input: process.stdin })) {
  const msg = JSON.parse(line);
  if (msg.method === 'initialized') continue;
  let result;
  if (msg.method === 'initialize')
    result = { codexHome: home, userAgent: 'Codex/0.153.4 synthetic' };
  else if (msg.method === 'config/read')
    result = {
      config,
      layers: [{ name: { type: 'user', file }, config, version }]
    };
  else if (msg.method === 'skills/list') {
    const skills = [];
    let names = [];
    try {
      names = await readdir(join(home, 'skills'));
    } catch {}
    for (const name of names) {
      const path = join(home, 'skills', name, 'SKILL.md');
      try {
        await readFile(path);
      } catch {
        continue;
      }
      skills.push({
        name,
        path,
        scope: name === '.system' ? 'system' : 'user',
        pluginId: null,
        enabled: !(config.skills?.config ?? []).some(
          (c) => c.path === path && c.enabled === false
        )
      });
    }
    try {
      skills.push(
        ...JSON.parse(await readFile(join(home, 'catalog-extra.json'), 'utf8'))
      );
    } catch {}
    try {
      skills.splice(
        0,
        skills.length,
        ...JSON.parse(
          await readFile(join(home, 'catalog-override.json'), 'utf8')
        )
      );
    } catch {}
    result = { data: [{ cwd: msg.params.cwds[0], skills, errors: [] }] };
  } else if (msg.method === 'config/batchWrite') {
    if (
      msg.params.filePath !== file ||
      msg.params.reloadUserConfig !== false ||
      msg.params.expectedVersion !== version ||
      msg.params.edits.length !== 1 ||
      msg.params.edits[0].keyPath !== 'skills.config'
    )
      process.exit(72);
    config.skills ??= {};
    config.skills.config = msg.params.edits[0].value;
    version = 'two';
    text =
      text.split('[[skills.config]]')[0] +
      config.skills.config
        .map(
          (c) =>
            '[[skills.config]]\n' +
            Object.entries(c)
              .map(([k, v]) => `${k} = ${JSON.stringify(v)}\n`)
              .join('')
        )
        .join('');
    await writeFile(file, text);
    result = { status: 'ok', version, filePath: file };
  } else process.exit(71);
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n'
  );
}
