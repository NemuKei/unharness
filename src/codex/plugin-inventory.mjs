// Version-qualified native discovery. All requests are enumerated reads;
// selected remote content is compared as data and is never invoked as a Skill.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRpcTransport } from './rpc-transport.mjs';
import { captureFile, canPlanOwnership, equal } from '../sources/platform.mjs';
import { hash } from '../sources/hash.mjs';
import { parse } from '../vendor/smol-toml/parse.js';
import { partitionPluginEnablement, validatePluginIds } from './plugin-config-selection.mjs';
import { capturePluginPackage, checkPluginPackage, validatePluginDependency, pluginToken, featureKeys } from './plugin-dependency.mjs';
import { verification } from '../sources/errors.mjs';

const execute = promisify(execFile);
const productRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const methods = Object.freeze(['initialize', 'config/read', 'plugin/installed', 'plugin/search', 'plugin/read', 'plugin/skill/read', 'skills/list']);
const failed = (kind = 'plugin-inventory-unavailable') => { throw Object.assign(Error(kind), { kind }); };
const digest = text => createHash('sha256').update(text).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const officialMarket = 'openai-curated-remote';
function installations(raw) {
  if (!Array.isArray(raw?.marketplaces) || raw.marketplaces.length > 256
    || !Array.isArray(raw.marketplaceLoadErrors) || raw.marketplaceLoadErrors.length) failed();
  const result = [];
  for (const m of raw.marketplaces) {
    if (typeof m.name !== 'string' || !Array.isArray(m.plugins)) failed();
    for (const p of m.plugins) {
      if (result.length >= 2048 || typeof p?.id !== 'string' || typeof p.name !== 'string'
        || typeof p.enabled !== 'boolean' || typeof p.installed !== 'boolean') failed();
      result.push({ marketplaceName: m.name, marketplacePath: m.path, plugin: p });
    }
  }
  if (new Set(result.map(r => r.plugin.id)).size !== result.length) failed();
  return result;
}
function basicReason(item) {
  const p = item.plugin;
  if (p.source?.path === productRoot) return 'unharness-management-retained';
  if (p.installPolicy !== 'AVAILABLE' || p.installPolicySource !== null) return 'plugin-required-or-managed';
  if (!p.installed || p.availability !== 'AVAILABLE' || p.disabledReason !== null) return 'plugin-unavailable';
  if (item.marketplaceName !== officialMarket || item.marketplacePath !== null || p.source?.type !== 'remote'
    || !pluginToken(p.name) || !pluginToken(p.version) || !pluginToken(p.remotePluginId)
    || p.id !== p.name + '@' + officialMarket) return 'plugin-origin-unverified';
  return null;
}
function selected(items, id) {
  const found = items.filter(i => i.plugin.id === id);
  if (found.length !== 1 || basicReason(found[0])) failed();
  return found[0];
}
function identity(item) {
  const p = item.plugin;
  return { id: p.id, name: p.name, marketplaceName: item.marketplaceName, remotePluginId: p.remotePluginId,
    version: p.version, localVersion: p.localVersion };
}
async function cliInstalled(context) {
  const { stdout } = await execute(context.executable, ['plugin', 'list', '--json'], {
    cwd: context.project, env: { ...process.env, CODEX_HOME: context.codexHome },
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, timeout: 20000,
  });
  const value = JSON.parse(stdout);
  if (!Array.isArray(value?.installed) || value.installed.length > 2048) failed();
  return value.installed;
}
function cliMatches(rows, item) {
  const p = item.plugin, found = rows.filter(row => row?.pluginId === p.id);
  if (found.length !== 1) failed();
  const r = found[0];
  if (r.name !== p.name || r.marketplaceName !== item.marketplaceName || r.version !== p.version
    || r.installed !== true || r.enabled !== p.enabled || r.source?.source !== 'remote'
    || r.source.id !== p.remotePluginId || r.installPolicy !== 'AVAILABLE') failed();
}
// Only the base user selector can contribute. Selected profiles, project,
// policy and runtime layers never become writable through a same-valued flag.
function selectorFor(report, configFile, context, id, enabled) {
  if (!object(report?.config) || !Array.isArray(report.layers) || report.layers.length > 128
    || !canPlanOwnership(configFile)) failed();
  const layers = report.layers.filter(l => l?.name?.type === 'user');
  if (layers.length !== 1 || layers[0].name.file !== join(context.codexHome, 'config.toml')
    || layers[0].name.profile !== null || layers[0].disabledReason != null) failed();
  for (const layer of report.layers) {
    if (!object(layer?.config) || !object(layer.name)) failed();
    const value = partitionPluginEnablement(layer.config, [id]).selected[0].enabled;
    if (layer !== layers[0] && value !== null) failed();
  }
  const own = partitionPluginEnablement(layers[0].config, [id]).selected[0].enabled;
  const parsed = parse(configFile?.text ?? '', { integersAsBigInt: true, maxDepth: 100 });
  if (partitionPluginEnablement(parsed, [id]).selected[0].enabled !== own
    || partitionPluginEnablement(report.config, [id]).selected[0].enabled !== own
    || enabled !== (own ?? true)) failed();
  return own;
}
async function native(context, operation) {
  let client;
  try {
    const { contextOf } = await import('../sources/catalog.mjs');
    context = await contextOf(context);
    client = createRpcTransport({ command: context.executable, args: ['app-server', '--stdio'], cwd: context.project,
      env: { ...process.env, CODEX_HOME: context.codexHome }, timeoutMs: 20000, maxResponseBytes: 8 * 1024 * 1024, allowedMethods: methods });
    const init = await client.request('initialize', { clientInfo: { name: 'unharness_plugin_inventory', version: '0.0.3' },
      capabilities: { experimentalApi: true } });
    if (init.codexHome !== context.codexHome || typeof init.userAgent !== 'string'
      || init.userAgent.match(/^[^/\r\n]{1,80}\/(\d+\.\d+\.\d+)(?=[ (]|$)/)?.[1] !== '0.153.4') failed();
    client.initialized();
    return await operation(client, context);
  } catch { failed(); }
  finally { await client?.close(); }
}
export async function discoverPluginCandidates(context) {
  return native(context, async (client, admitted) => {
    const items = installations(await client.request('plugin/installed', { cwds: [admitted.project] }));
    const plugins = items.filter(i => i.plugin.installed).map(i => ({ id: i.plugin.id,
      label: (i.plugin.interface?.displayName ?? i.plugin.name).slice(0, 256), enabled: i.plugin.enabled,
      available: basicReason(i) === null, reason: basicReason(i) })).sort((a, b) => a.id.localeCompare(b.id));
    const data = { version: '0.153.4', plugins };
    return { ...data, discoveryId: hash({ context: admitted, items: items.map(i => ({ ...identity(i), enabled: i.plugin.enabled,
      reason: basicReason(i) })) }), verification };
  });
}
async function localSelected(client, context, id) {
  const configFile = await captureFile(join(context.codexHome, 'config.toml'));
  const [raw, cli, config, catalog] = await Promise.all([
    client.request('plugin/installed', { cwds: [context.project] }), cliInstalled(context),
    client.request('config/read', { cwd: context.project, includeLayers: true }),
    client.request('skills/list', { cwds: [context.project], forceReload: true }),
  ]);
  const item = selected(installations(raw), id), p = item.plugin;
  cliMatches(cli, item);
  const selector = selectorFor(config, configFile, context, id, p.enabled);
  if (!Array.isArray(catalog?.data) || catalog.data.length !== 1 || catalog.data[0].cwd !== context.project
    || !Array.isArray(catalog.data[0].skills) || catalog.data[0].skills.length > 2048 || catalog.data[0].errors?.length) failed();
  const root = join(context.codexHome, 'plugins', 'cache', item.marketplaceName, p.name, p.version);
  if (root === productRoot) failed();
  const pkg = await capturePluginPackage(root);
  const m = pkg.manifest;
  if (m.name !== p.name || m.version !== p.version || m.skills !== './skills/'
    || p.localVersion !== null && p.localVersion !== m.version) failed();
  const skills = pkg.files.filter(f => /^skills\/[^/]+\/SKILL\.md$/.test(f.path)).map(f => ({
    name: f.path.split('/')[1], path: f.path, sha256: f.sha256,
  })).sort((a, b) => a.name.localeCompare(b.name));
  const loaded = catalog.data[0].skills.filter(s => s.pluginId === id);
  // Disabled plugins may have no catalog entries. Their exact package remains
  // bound to the installed native ID, version and CLI local-version evidence.
  if (loaded.length && loaded.length !== skills.length || p.enabled && loaded.length !== skills.length) failed();
  for (const s of loaded) if (!skills.some(k => s.path === join(root, k.path) && s.name === p.name + ':' + k.name)) failed();
  if (!equal(configFile, await captureFile(join(context.codexHome, 'config.toml')))) failed();
  return { item, plugin: identity(item), root, pkg, skills, selector, configFile };
}
export async function capturePluginCandidate(context, pluginId) {
  validatePluginIds([pluginId]);
  return native(context, async (client, admitted) => {
    const local = await localSelected(client, admitted, pluginId), p = local.item.plugin;
    const search = await client.request('plugin/search', { searchTerm: p.name, scope: 'global', limit: 100 });
    if (!Array.isArray(search?.data) || search.data.length > 100) failed();
    const found = search.data.filter(i => i?.plugin?.id === p.id);
    if (found.length !== 1 || found[0].marketplaceName !== officialMarket || found[0].marketplacePath !== null
      || found[0].plugin.source?.type !== 'remote' || !equal(identity(found[0]), local.plugin)) failed();
    const response = await client.request('plugin/read', { remoteMarketplaceName: officialMarket, pluginName: p.name });
    const detail = response?.plugin;
    if (!detail || detail.marketplaceName !== officialMarket || detail.marketplacePath !== null
      || !equal(identity({ ...detail, plugin: detail.summary }), local.plugin)
      || !Array.isArray(detail.skills) || detail.skills.length !== local.skills.length) failed();
    const features = {};
    for (const key of featureKeys) {
      if (key === 'scheduledTasks' && detail[key] === null) { features[key] = null; continue; }
      if (!Array.isArray(detail[key]) || detail[key].length > 2048) failed();
      features[key] = detail[key].length;
    }
    if (new Set(detail.skills.map(s => s.name)).size !== local.skills.length) failed();
    for (const s of local.skills) {
      if (!detail.skills.some(r => r.name === s.name)) failed();
      const remote = await client.request('plugin/skill/read', { remoteMarketplaceName: officialMarket,
        remotePluginId: p.remotePluginId, skillName: s.name });
      if (typeof remote?.contents !== 'string' || Buffer.byteLength(remote.contents) > 128 * 1024 || digest(remote.contents) !== s.sha256) failed();
    }
    const dependency = { schemaVersion: 1, application: 'codex', runtimeVersion: '0.153.4', plugin: local.plugin,
      root: local.root, binding: local.pkg.binding, files: local.pkg.files, contentId: local.pkg.contentId, skills: local.skills, features };
    validatePluginDependency(dependency, admitted);
    const second = await localSelected(client, admitted, pluginId);
    if (!equal(local.plugin, second.plugin) || !equal(local.pkg, second.pkg) || !equal(local.skills, second.skills)
      || local.selector !== second.selector || !equal(local.configFile, second.configFile)) failed();
    return { candidate: { id: p.id, label: (p.interface?.displayName ?? p.name).slice(0, 256),
      normalEnabled: p.enabled, normalSelector: local.selector, eligibility: 'official-confirmed', sourceRevision: p.version,
      evidence: { directoryId: officialMarket, pluginId: p.id, distribution: p.remotePluginId, version: p.version,
        contentId: local.pkg.contentId, checkedAt: new Date().toISOString() }, wholePluginControl: true, requiredControl: false, features }, dependency };
  });
}
export async function assertPluginDependency(context, dependency) {
  try {
    validatePluginDependency(dependency, context);
    await checkPluginPackage(dependency, context);
    await native(context, async (client, admitted) => {
      const local = await localSelected(client, admitted, dependency.plugin.id);
      if (!equal(local.plugin, dependency.plugin) || !equal(local.skills, dependency.skills)
        || local.pkg.contentId !== dependency.contentId || !equal(local.pkg.binding, dependency.binding)) failed();
    });
  } catch { failed('plugin-dependency-changed'); }
}
