import { isAbsolute, join, normalize } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createReadOnlyClient } from './rpc-client.mjs';
import { contextOf } from '../sources/catalog.mjs';
import { hash } from '../sources/capture.mjs';
import { fail } from '../sources/errors.mjs';
import { validUtc } from '../sources/observation-record.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { replayRelativePath } from '../experiments/variant.mjs';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const unavailable = () => fail('replay-native-conditions-unavailable');
const absolute = x => typeof x === 'string' && !/[\0\r\n]/.test(x) && isAbsolute(x) && normalize(x) === x;
function validateReport(report) {
  exactKeys(report, ['kind', 'schemaVersion', 'version', 'context', 'observedAt', 'config', 'layers', 'skills', 'hooks', 'requirements'], [], 'replay-native-conditions-unavailable');
  if (report.kind !== 'unharness-replay-conditions' || report.schemaVersion !== 1 || report.version !== '0.153.4'
    || !validUtc(report.observedAt) || !object(report.context) || !absolute(report.context.project)
    || !absolute(report.context.codexHome) || typeof report.context.executable !== 'string' || !report.context.executable
    || !object(report.config) || !['approval_policy', 'sandbox_mode', 'memories', 'model'].every(k => Object.hasOwn(report.config, k))
    || !Array.isArray(report.layers) || !report.layers.length || report.layers.length > 128
    || !Array.isArray(report.skills) || report.skills.length > 2048 || !Array.isArray(report.hooks)
    || !object(report.requirements) || !Object.hasOwn(report.requirements, 'requirements')
    || Buffer.byteLength(JSON.stringify(report)) > 768 * 1024) unavailable();
  const paths = new Set();
  for (const s of report.skills) {
    if (!object(s) || !absolute(s.path) || typeof s.name !== 'string' || !s.name
      || typeof s.scope !== 'string' || !s.scope || typeof s.enabled !== 'boolean'
      || !(s.pluginId == null || typeof s.pluginId === 'string') || paths.has(s.path)) unavailable();
    paths.add(s.path);
  }
  for (const layer of report.layers) {
    if (!object(layer) || !object(layer.name) || typeof layer.name.type !== 'string'
      || !object(layer.config) || typeof layer.version !== 'string' || !layer.version
      || layer.disabledReason != null) unavailable();
    if (layer.name.type === 'project' && !absolute(layer.name.dotCodexFolder)) unavailable();
  }
  return report;
}
function catalogData(value, project, key) {
  if (!Array.isArray(value?.data) || value.data.length !== 1) unavailable();
  const data = value.data[0];
  if (data?.cwd !== project || !Array.isArray(data[key]) || !Array.isArray(data.errors) || data.errors.length
    || key === 'hooks' && (!Array.isArray(data.warnings) || data.warnings.length)) unavailable();
  return data[key];
}
// Private preparation evidence, never a desktop-loaded-state assertion. Raw
// settings/hook commands stay in the registered local store, not GUI summaries.
export async function readReplayConditions(context) {
  let client;
  try {
    context = await contextOf(context);
    client = createReadOnlyClient({ command: context.executable, args: ['app-server', '--stdio'], cwd: context.project,
      env: { ...process.env, CODEX_HOME: context.codexHome } });
    const init = await client.request('initialize', { clientInfo: { name: 'unharness_replay_preflight', version: '0.1.0' }, capabilities: { experimentalApi: true } });
    const version = typeof init?.userAgent === 'string' ? init.userAgent.match(/^[^/\r\n]{1,80}\/(\d+\.\d+\.\d+)(?=[ (]|$)/)?.[1] : null;
    if (version !== '0.153.4' || init.codexHome !== context.codexHome) unavailable();
    client.initialized();
    const params = { cwd: context.project, includeLayers: true };
    const before = await client.request('config/read', params);
    const skills = catalogData(await client.request('skills/list', { cwds: [context.project], forceReload: true }), context.project, 'skills');
    const hooks = catalogData(await client.request('hooks/list', { cwds: [context.project], forceReload: true }), context.project, 'hooks');
    const requirements = await client.request('configRequirements/read', {});
    const after = await client.request('config/read', params);
    if (!isDeepStrictEqual(before, after)) unavailable();
    return validateReport({ kind: 'unharness-replay-conditions', schemaVersion: 1, version, context,
      observedAt: new Date().toISOString(), config: before.config, layers: before.layers, skills, hooks, requirements });
  } catch { unavailable(); }
  finally { if (client) await client.close(); }
}
function retainedProjection(report, omitted) {
  const { project } = report.context;
  return { version: report.version, context: { codexHome: report.context.codexHome, executable: report.context.executable },
    // Config values, commands, absolute references and the shared trust registry
    // remain literal. Only native layer/catalog identity paths are relocated.
    config: report.config,
    layers: report.layers.map(layer => ({ ...layer, name: layer.name.type === 'project'
      ? { ...layer.name, dotCodexFolder: { projectRelative: replayRelativePath(project, layer.name.dotCodexFolder) } } : layer.name })),
    skills: report.skills.filter(s => !omitted.has(s.path)).map(s => ({ ...s,
      path: s.scope === 'repo' ? { projectRelative: replayRelativePath(project, s.path) } : { absolute: s.path }
    })).sort((a, b) => JSON.stringify(a.path).localeCompare(JSON.stringify(b.path))),
    hooks: report.hooks, requirements: report.requirements };
}
export function replayConditionsIdentity(report) {
  validateReport(report);
  const { observedAt, ...value } = report;
  return hash(value);
}
export function compareReplayConditions({ original, derived, sourceMappings, expectedSources }) {
  validateReport(original); validateReport(derived);
  if (original.context.codexHome !== derived.context.codexHome || original.context.executable !== derived.context.executable
    || original.context.project === derived.context.project || !Array.isArray(sourceMappings) || !Array.isArray(expectedSources)) unavailable();
  // Resolve every repo source before comparing selected identities; otherwise
  // an unmapped ancestor can disappear behind an apparently absent selection.
  for (const r of [original, derived]) for (const s of r.skills)
    if (s.scope === 'repo') replayRelativePath(r.context.project, s.path);
  for (const expected of expectedSources.filter(s => s.category === 'skill')) {
    const matches = original.skills.filter(s => s.path === expected.path && s.name === expected.name);
    if (!['disabled', 'manual-only', 'automatic-catalog'].includes(expected.expected) || matches.length !== 1
      || matches[0].enabled !== (expected.expected !== 'disabled')) fail('replay-source-state-unavailable');
  }
  const omitted = new Set(), seen = new Set();
  for (const mapping of sourceMappings) {
    if (!object(mapping) || seen.has(mapping.sourceId)) unavailable();
    seen.add(mapping.sourceId);
    const expected = expectedSources.find(s => s.sourceId === mapping.sourceId && s.category === 'skill');
    if (!expected || expected.path !== mapping.sourcePath || expected.expected !== mapping.expected
      || join(derived.context.project, replayRelativePath(original.context.project, mapping.sourcePath)) !== mapping.path
      || mapping.strategy !== (mapping.expected === 'disabled' ? 'omit-entrypoints' : 'copy-entrypoints')) fail('replay-source-unmapped');
    if (mapping.expected === 'disabled') {
      if (derived.skills.some(s => s.path === mapping.path || s.scope === 'repo' && s.name === expected.name)) fail('replay-source-state-unavailable');
      omitted.add(mapping.sourcePath);
    }
  }
  const a = retainedProjection(original, omitted), b = retainedProjection(derived, new Set());
  if (!isDeepStrictEqual(a, b)) fail('replay-retained-conditions-changed');
  return { status: 'matched', version: original.version, mappedSkills: sourceMappings.length,
    omittedSkills: omitted.size, retainedConditionsDigest: hash(a), desktopRuntimeVerified: false };
}
