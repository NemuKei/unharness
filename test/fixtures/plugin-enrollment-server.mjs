#!/usr/bin/env node
// Owned profile peer used only by plugin-enrollment tests. Package text is data.
import { createInterface } from 'node:readline';
import { readFile, readdir, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parse } from '../../src/vendor/smol-toml/parse.js';
if (!process.env.CODEX_HOME || !process.argv.includes('app-server') && !(process.argv.includes('plugin') && process.argv.includes('list'))) process.exit(0);

const home = process.env.CODEX_HOME, market = 'openai-curated-remote';
const data = await readFile(join(home, '.fixture-plugins.json'), 'utf8').then(JSON.parse, e => {
  if (e.code !== 'ENOENT') throw e;
  return { names: [] }; // Exclusively owned native config editor copy.
});
const file = join(home, 'config.toml');
let text = await readFile(file, 'utf8'), config = parse(text);
const originalPlugins = structuredClone(config.plugins ?? {});
for (let i = 0; i < process.argv.length - 1; i++) if (process.argv[i] === '-c') {
  const override = parse(process.argv[++i]);
  config.plugins = { ...config.plugins, ...override.plugins };
}
const version = () => createHash('sha256').update(text).digest('hex');
function setSkill(path, enabled) {
  let found = false;
  text = text.replace(/\[\[skills\.config\]\][\s\S]*?(?=\n\[|$)/g, block => {
    if (parse(block).skills.config[0].path !== path) return block;
    found = true; return block.replace(/enabled\s*=\s*(?:true|false)/, 'enabled = ' + enabled);
  });
  if (!found) text += '\n[[skills.config]]\npath = ' + JSON.stringify(path) + '\nenabled = ' + enabled + '\n';
}
function disablePlugin(id) {
  let found = false;
  text = text.replace(/\[plugins\."[^"\n]+"\][\s\S]*?(?=\n\[|$)/g, block => {
    if (!Object.hasOwn(parse(block).plugins, id)) return block;
    found = true;
    return /enabled\s*=/.test(block) ? block.replace(/enabled\s*=\s*(?:true|false)/, 'enabled = false')
      : block.replace(/^(\[[^\n]+\]\n)/, '$1enabled = false\n');
  });
  if (!found) text += '\n[plugins.' + JSON.stringify(id) + ']\nenabled = false\n';
}
const rows = data.names.map(name => {
  const id = name + '@' + market, enabled = (data.ignorePluginOverrides ? originalPlugins : config.plugins)?.[id]?.enabled ?? true;
  return { id, name, remotePluginId: 'plugins~' + name, version: '1.2.3', localVersion: null,
    installed: true, enabled, source: { type: 'remote' }, installPolicy: 'AVAILABLE', installPolicySource: null,
    availability: 'AVAILABLE', disabledReason: null, interface: { displayName: name }, ...data.summary };
});
if (process.argv.includes('list')) {
  process.stdout.write(JSON.stringify({ installed: rows.map(p => ({ pluginId: p.id, name: p.name,
    marketplaceName: market, version: p.version, installed: true, enabled: p.enabled,
    source: { source: 'remote', id: p.remotePluginId }, installPolicy: p.installPolicy })), available: [] }));
} else {
  for await (const line of createInterface({ input: process.stdin })) {
    const q = JSON.parse(line);
    await appendFile(join(home, '.fixture-plugin-requests.jsonl'), JSON.stringify({ method: q.method }) + '\n');
    if (q.method === 'initialized' || q.error) continue;
    let result;
    if (q.method === 'initialize') result = { codexHome: home, userAgent: 'Fixture/0.153.4 (synthetic)' };
    else if (q.method === 'config/read') result = { config, layers: [
      { name: { type: 'user', file: join(home, 'config.toml'), profile: null }, disabledReason: null, config, version: version() }] };
    else if (q.method === 'plugin/installed') result = { marketplaces: [{ name: market, path: null, plugins: rows }], marketplaceLoadErrors: [] };
    else if (q.method === 'skills/list') {
      const skills = [];
      for (const name of await readdir(join(home, 'skills')).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
        const path = join(home, 'skills', name, 'SKILL.md');
        try { await readFile(path); } catch { continue; }
        skills.push({ name, path, scope: 'user', pluginId: null,
          enabled: !(config.skills?.config ?? []).some(s => s.path === path && s.enabled === false) });
      }
      for (const p of rows) skills.push({ pluginId: p.id, name: p.name + ':fixture',
        path: join(home, 'plugins/cache', market, p.name, p.version, 'skills/fixture/SKILL.md'), scope: 'user', enabled: p.enabled });
      result = { data: [{ cwd: process.cwd(), errors: [], skills }] };
    } else if (q.method === 'hooks/list') result = { data: [{ cwd: process.cwd(), hooks: [], warnings: [], errors: [] }] };
    else if (q.method === 'configRequirements/read') result = { requirements: null };
    else if (q.method === 'plugin/search') result = { data: rows.map(plugin => ({ marketplaceName: market,
      marketplacePath: null, plugin: { ...plugin, installed: false, enabled: false } })), nextCursor: null };
    else if (q.method === 'plugin/read') result = { plugin: { marketplaceName: market, marketplacePath: null,
      summary: rows.find(p => p.name === q.params.pluginName), skills: [{ name: 'fixture', path: null, enabled: true }],
      hooks: [], mcpServers: [], apps: [], appTemplates: [], scheduledTasks: null } };
    else if (q.method === 'plugin/skill/read') result = { contents: '# Fixture\nA local fixture.\n' };
    else if (q.method === 'skills/config/write') {
      if (typeof q.params.path !== 'string' || typeof q.params.enabled !== 'boolean'
        || Object.keys(q.params).sort().join() !== 'enabled,path') process.exit(73);
      setSkill(q.params.path, q.params.enabled);
      config = parse(text); await writeFile(file, text); result = { effectiveEnabled: q.params.enabled };
    } else if (q.method === 'config/batchWrite') {
      if (q.params.filePath !== file || q.params.expectedVersion !== version() || q.params.reloadUserConfig !== false
        || !Array.isArray(q.params.edits)) process.exit(74);
      for (const e of q.params.edits) {
        const match = /^plugins\.("(?:[^"\\]|\\.)*")\.enabled$/.exec(e.keyPath);
        if (!match || e.value !== false || e.mergeStrategy !== 'replace') process.exit(75);
        disablePlugin(JSON.parse(match[1]));
      }
      config = parse(text); await writeFile(file, text); result = { status: 'ok', filePath: file, version: version() };
    }
    else process.exit(72);
    process.stdout.write(JSON.stringify({ id: q.id, result }) + '\n');
  }
}
