// A frozen read-only package dependency. It grants no write authority over
// the provider cache and contains hashes, never package bodies or commands.
import { lstat, readdir } from 'node:fs/promises';
import { join, isAbsolute, resolve } from 'node:path';
import { recordId } from '../core/local-store.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';
import { hash } from '../sources/hash.mjs';
import { canonical, parentBinding, checkBinding, equal } from '../sources/platform.mjs';
import { validDirectoryIdentity } from '../platform/directory-identity.mjs';
import { distributionFile } from '../setup/distribution.mjs';
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { validateOfficialPluginEvidence } from '../setup/mode-inheritance.mjs';
import { partitionPluginEnablement } from './plugin-config-selection.mjs';
import { parse } from '../vendor/smol-toml/parse.js';

const failed = () => { throw Object.assign(Error('plugin-dependency-changed'), { kind: 'plugin-dependency-changed' }); };
const exact = (v, keys) => exactKeys(v, keys, [], 'plugin-dependency-changed');
const sha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const pluginToken = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(v);
export const featureKeys = Object.freeze(['skills', 'mcpServers', 'hooks', 'apps', 'appTemplates', 'scheduledTasks']);
export function validatePluginFeatures(features) {
  exact(features, featureKeys);
  for (const k of featureKeys) if (!(k === 'scheduledTasks' && features[k] === null)
    && (!Number.isSafeInteger(features[k]) || features[k] < 0 || features[k] > 2048)) failed();
}
export function validatePluginDependency(d, context) {
  try {
    recordId('input', d);
    exact(d, ['schemaVersion', 'application', 'runtimeVersion', 'plugin', 'root', 'binding', 'files', 'contentId', 'skills', 'features']);
    exact(d.plugin, ['id', 'name', 'marketplaceName', 'remotePluginId', 'version', 'localVersion']);
    const p = d.plugin;
    if (d.schemaVersion !== 1 || d.application !== 'codex' || d.runtimeVersion !== '0.153.4'
      || ![p.name, p.version].every(pluginToken) || p.marketplaceName !== 'openai-curated-remote'
      || p.id !== p.name + '@' + p.marketplaceName || !pluginToken(p.remotePluginId)
      || p.localVersion !== null && p.localVersion !== p.version
      || !isAbsolute(d.root) || resolve(d.root) !== d.root
      || context && d.root !== join(context.codexHome, 'plugins', 'cache', p.marketplaceName, p.name, p.version)
      || !validDirectoryIdentity(d.binding) || d.binding.path !== d.root || !equal(d.binding.missing, [])
      || !Array.isArray(d.files) || !d.files.length || d.files.length > 2048
      || !sha(d.contentId) || d.contentId !== hash(d.files)
      || !Array.isArray(d.skills) || d.skills.length > 2048) failed();
    let previous = '', bytes = 0;
    for (const f of d.files) {
      exact(f, ['path', 'bytes', 'sha256', 'executable']);
      if (typeof f.path !== 'string' || f.path.length > 512 || /[\u0000-\u001f\u007f\\]/.test(f.path)
        || f.path.split('/').some(s => !s || s === '.' || s === '..') || f.path <= previous
        || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || f.bytes > 8 * 1024 * 1024
        || !sha(f.sha256) || typeof f.executable !== 'boolean') failed();
      previous = f.path; bytes += f.bytes;
    }
    if (bytes > 64 * 1024 * 1024 || !d.files.some(f => f.path === '.codex-plugin/plugin.json')) failed();
    const names = new Set();
    for (const s of d.skills) {
      exact(s, ['name', 'path', 'sha256']);
      if (!pluginToken(s.name) || names.has(s.name) || s.path !== 'skills/' + s.name + '/SKILL.md'
        || !d.files.some(f => f.path === s.path && f.sha256 === s.sha256)) failed();
      names.add(s.name);
    }
    validatePluginFeatures(d.features);
    if (d.features.skills !== d.skills.length) failed();
    return structuredClone(d);
  } catch { failed(); }
}
export async function capturePluginPackage(root) {
  try {
    await canonical(root);
    const binding = await parentBinding(join(root, '.unharness-read-only-dependency'));
    const files = [];
    let total = 0, directories = 0;
    async function visit(path, prefix, depth) {
      if (depth > 16 || ++directories > 2048) failed();
      await canonical(path);
      const before = await lstat(path);
      if (!before.isDirectory() || before.isSymbolicLink()) failed();
      const entries = (await readdir(path)).sort();
      for (const name of entries) {
        const selected = join(path, name), relative = prefix ? prefix + '/' + name : name;
        if (relative.length > 512 || /[\u0000-\u001f\u007f\\]/.test(relative)) failed();
        const s = await lstat(selected);
        if (s.isSymbolicLink()) failed();
        if (s.isDirectory()) await visit(selected, relative, depth + 1);
        else {
          if (files.length >= 2048 || s.size > 8 * 1024 * 1024 || (total += s.size) > 64 * 1024 * 1024) failed();
          files.push({ path: relative, ...await distributionFile(selected) });
        }
      }
      const after = await lstat(path);
      if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs
        || !equal(entries, (await readdir(path)).sort())) failed();
    }
    await visit(root, '', 0);
    await checkBinding(binding);
    files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const manifestFile = await distributionFile(join(root, '.codex-plugin/plugin.json'), { textLimit: 128 * 1024 });
    if (!files.some(f => f.path === '.codex-plugin/plugin.json' && f.sha256 === manifestFile.sha256)) failed();
    return { binding, files, contentId: hash(files), manifest: parseStrictJson(manifestFile.text) };
  } catch { failed(); }
}
export async function checkPluginPackage(d, context) {
  validatePluginDependency(d, context);
  const current = await capturePluginPackage(d.root);
  if (!equal(current.binding, d.binding) || !equal(current.files, d.files) || current.contentId !== d.contentId) failed();
  return current;
}

// This validator reads immutable records only. Normal and cancellation do not
// depend on an installed package, a native executable or a network response.
export async function validateRegisteredPlugins(workspace, reg) {
  try {
    if (reg.controlSchemaVersion !== 3 || !Array.isArray(reg.plugins) || !reg.plugins.length || reg.plugins.length > 32
      || reg.version !== '0.153.4' || typeof reg.context.codexHome !== 'string'
      || new Set(reg.plugins.map(p => p?.id)).size !== reg.plugins.length) failed();
    const { loadRecord, loadNormal } = await import('../sources/records.mjs');
    const normal = await loadNormal(workspace, reg);
    const config = parse(normal.config?.text ?? '', { integersAsBigInt: true, maxDepth: 100 });
    const dependencies = [];
    for (const p of reg.plugins) {
      exact(p, ['id', 'label', 'normalEnabled', 'normalSelector', 'eligibility', 'sourceRevision', 'evidence',
        'wholePluginControl', 'requiredControl', 'dependencyId', 'features', 'role']);
      exact(p.role, ['origin', 'reason', 'optional']);
      if (!['self', 'external'].includes(p.role.origin) || p.role.optional !== true || !sha(p.dependencyId)
        || p.wholePluginControl !== true || p.requiredControl !== false || typeof p.normalEnabled !== 'boolean'
        || ![true, false, null].includes(p.normalSelector) || p.normalEnabled !== (p.normalSelector ?? true)) failed();
      boundedText(p.label, 256, false, 'plugin-dependency-changed');
      boundedText(p.role.reason, 600, true, 'plugin-dependency-changed');
      validateOfficialPluginEvidence(p);
      const { kind, role, ...dependency } = await loadRecord(workspace, 'input', p.dependencyId);
      if (kind !== 'unharness-user-source' || role !== 'plugin-dependency') failed();
      validatePluginDependency(dependency, reg.context);
      if (dependency.plugin.id !== p.id || dependency.plugin.version !== p.sourceRevision
        || dependency.plugin.remotePluginId !== p.evidence.distribution || dependency.plugin.marketplaceName !== p.evidence.directoryId
        || dependency.contentId !== p.evidence.contentId || !equal(dependency.features, p.features)
        || partitionPluginEnablement(config, [p.id]).selected[0].enabled !== p.normalSelector) failed();
      dependencies.push(dependency);
    }
    return dependencies;
  } catch { failed(); }
}
