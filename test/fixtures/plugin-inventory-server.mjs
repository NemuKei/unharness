// An owned read-only native peer. No plugin contents are executed.
import { createInterface } from 'node:readline';
import { readFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from '../../src/vendor/smol-toml/parse.js';
if (!process.env.CODEX_HOME || !process.argv.includes('app-server') && !(process.argv.includes('plugin') && process.argv.includes('list'))) process.exit(0);
const home = process.env.CODEX_HOME;
const data = JSON.parse(await readFile(join(home, '.fixture-plugin.json'), 'utf8'));
const name = 'fixture-plugin', market = 'openai-curated-remote', id = name + '@' + market;
const config = parse(await readFile(join(home, 'config.toml'), 'utf8'));
const originalEnabled = config.plugins?.[id]?.enabled ?? true;
for (let i = 0; i < process.argv.length - 1; i++) if (process.argv[i] === '-c') {
  const override = parse(process.argv[++i]);
  config.plugins = { ...config.plugins, ...override.plugins };
}
const enabled = data.ignorePluginOverrides ? originalEnabled : config.plugins?.[id]?.enabled ?? true;
const summary = { id, name, remotePluginId: 'plugins~fixture-native-id', version: '1.2.3', localVersion: null,
  installed: true, enabled, source: { type: 'remote' }, installPolicy: 'AVAILABLE', installPolicySource: null,
  availability: 'AVAILABLE', disabledReason: null, interface: { displayName: 'Fixture plugin' }, ...data.summary };
const cli = { pluginId: id, name, marketplaceName: market, version: '1.2.3', installed: true, enabled,
  source: { source: 'remote', id: 'plugins~fixture-native-id' }, installPolicy: 'AVAILABLE', ...data.cli };
const root = join(home, 'plugins', 'cache', market, name, '1.2.3');
if (process.argv.includes('list')) {
  process.stdout.write(JSON.stringify({ installed: [cli], available: [] }));
} else {
  const send = (id, result) => process.stdout.write(JSON.stringify({ id, result }) + '\n');
  for await (const line of createInterface({ input: process.stdin })) {
    const q = JSON.parse(line);
    await appendFile(join(home, '.fixture-requests.jsonl'), JSON.stringify({ method: q.method, params: q.params }) + '\n');
    if (q.method === 'initialized' || q.error) continue;
    if (q.method === 'initialize') send(q.id, { codexHome: home, userAgent: 'Fixture/' + (data.runtimeVersion ?? '0.153.4') + ' (fixture)' });
    else if (q.method === 'plugin/installed') send(q.id, { marketplaces: [{ name: market, path: null,
      plugins: data.duplicate ? [summary, summary] : [summary] }], marketplaceLoadErrors: [] });
    else if (q.method === 'config/read') send(q.id, { config, layers: [
      { name: { type: 'user', file: join(home, 'config.toml'), profile: null }, disabledReason: null, config },
      ...(data.layer ? [data.layer] : [])] });
    else if (q.method === 'skills/list') send(q.id, { data: [{ cwd: process.cwd(), errors: [], skills: [
      { pluginId: id, name: name + ':fixture', path: join(root, 'skills', 'fixture', 'SKILL.md'), scope: 'user', enabled } ] }] });
    else if (q.method === 'plugin/search') send(q.id, { data: [{ marketplaceName: market, marketplacePath: null,
      plugin: { ...summary, installed: false, enabled: false, ...data.search } }], nextCursor: null });
    else if (q.method === 'plugin/read') send(q.id, { plugin: { marketplaceName: market, marketplacePath: null,
      summary, skills: [{ name: 'fixture', path: null, enabled: true }], hooks: [], mcpServers: [], apps: [], appTemplates: [],
      scheduledTasks: null } });
    else if (q.method === 'plugin/skill/read') send(q.id, { contents: data.markdown ?? '# Fixture\nA local fixture.\n' });
    else process.exit(72);
  }
}
