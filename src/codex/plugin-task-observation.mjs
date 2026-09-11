// Native 0.153.4 records the initial Skill catalog, but no per-plugin enabled,
// MCP, hook, app or scheduled-task runtime state. Keep those evidence separate.
// Frozen readers use only saved records; they never inspect today's package.
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from '../vendor/smol-toml/parse.js';
import { partitionPluginEnablement } from './plugin-config-selection.mjs';
import { parseSkillCatalog } from './skill-listing.mjs';
import { samePath } from '../sources/paths.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';

export const PLUGIN_OBSERVATION_REASONS = Object.freeze([
  'plugin-input-state-mismatch', 'plugin-input-state-unavailable', 'plugin-runtime-state-unavailable',
]);
const unavailableComponents = Object.freeze(['plugin-enablement', 'mcp-servers', 'hooks', 'apps', 'app-templates', 'scheduled-tasks']);
const recordStatuses = ['matched-record', 'not-matched-record', 'unknown-record', 'unqualified-record'];
const invalid = () => { throw Error('observation-invalid'); };
const exact = (v, keys) => exactKeys(v, keys, [], 'observation-invalid');

export async function frozenPluginInputBindings(w, snapshotId = w.state.snapshotId) {
  if (!w.reg.plugins?.length) return [];
  const { loadRecord, loadSnapshot } = await import('../sources/records.mjs');
  const snapshot = await loadSnapshot(w.workspace, w.reg, snapshotId);
  let selectors = null;
  try {
    selectors = partitionPluginEnablement(parse(snapshot.config?.text ?? '', { integersAsBigInt: true, maxDepth: 100 }),
      w.reg.plugins.map(p => p.id)).selected;
  } catch { /* A saved configuration with unknown grammar proves no selector. */ }
  const result = [];
  for (const p of w.reg.plugins) {
    const dependency = await loadRecord(w.workspace, 'input', p.dependencyId);
    result.push({ pluginId: p.id, dependencyId: p.dependencyId, sourceRevision: p.sourceRevision,
      configuration: selectors === null ? 'unavailable' : 'saved-snapshot',
      expectedEnabled: selectors === null ? null : selectors.find(s => s.pluginId === p.id).enabled ?? true,
      features: structuredClone(p.features), skills: dependency.skills.map(s => ({
        name: dependency.plugin.name + ':' + s.name, path: join(dependency.root, s.path),
      })) });
  }
  return result;
}

function inputStatus(expectedEnabled, catalog) {
  if (!catalog.available || expectedEnabled === null) return 'unknown';
  if (expectedEnabled === false && catalog.matchedCount > 0) return 'not-matched';
  if (catalog.identityConflict || catalog.expectedCount === 0) return 'unknown';
  if (expectedEnabled === false) return 'matched';
  // Normal enablement does not promise automatic invocation for every Skill:
  // an omitted member may be manual. Never call that omission a mismatch.
  return catalog.matchedCount === catalog.expectedCount ? 'matched' : 'unknown';
}

export function projectPluginInputs(bindings, state, runtimeVersion) {
  const catalog = runtimeVersion === '0.153.4' ? parseSkillCatalog(state?.host_skills) : null;
  return bindings.map(b => {
    const expected = b.skills;
    const matchedCount = catalog === null ? null : expected.filter(s => catalog.some(e => e.name === s.name && samePath(e.path, s.path))).length;
    const identityConflict = catalog === null ? null : catalog.some(e => {
      const related = expected.filter(s => e.name === s.name || samePath(e.path, s.path));
      return related.some(s => e.name !== s.name || !samePath(e.path, s.path))
        || e.name.startsWith(b.pluginId.split('@')[0] + ':') && related.length === 0;
    });
    const skillCatalog = { fieldPresent: Boolean(state && Object.hasOwn(state, 'host_skills')), available: catalog !== null,
      expectedCount: expected.length, matchedCount, identityConflict };
    return { pluginId: b.pluginId, dependencyId: b.dependencyId, sourceRevision: b.sourceRevision,
      configuration: b.configuration, expectedEnabled: b.expectedEnabled, features: structuredClone(b.features),
      skillCatalog, inputStatus: inputStatus(b.expectedEnabled, skillCatalog), runtimeStatus: 'unknown' };
  });
}

export function withPluginEvidence(base, plugins) {
  if (!plugins.length) return base;
  const reasons = [...base.reasons];
  if (plugins.some(p => p.inputStatus === 'not-matched')) reasons.push('plugin-input-state-mismatch');
  if (plugins.some(p => p.inputStatus === 'unknown')) reasons.push('plugin-input-state-unavailable');
  reasons.push('plugin-runtime-state-unavailable');
  const mismatch = base.status === 'not-matched-record' || plugins.some(p => p.inputStatus === 'not-matched');
  const unknown = base.status !== 'matched-record' || plugins.some(p => p.inputStatus === 'unknown');
  const input = base.status === 'unqualified-record' ? 'unknown' : mismatch ? 'not-matched' : unknown ? 'unknown' : 'matched';
  return { ...base, sourceStatus: base.status, plugins,
    coverage: { scope: 'initial-recorded-inputs', inputStatus: input, runtimeStatus: 'unknown',
      skillCatalogSource: 'initial-world-state-host-skills', unobservedComponents: [...unavailableComponents] },
    status: base.status === 'unqualified-record' ? 'unqualified-record' : mismatch ? 'not-matched-record' : 'unknown-record', reasons };
}

export function validatePluginEvidence(value, registered) {
  try {
    if (!registered?.length || !Array.isArray(value.plugins) || value.plugins.length !== registered.length
      || !recordStatuses.includes(value.sourceStatus) || !Array.isArray(value.reasons)
      || new Set(value.plugins.map(p => p?.pluginId)).size !== registered.length) invalid();
    for (const [i, p] of value.plugins.entries()) {
      const reg = registered[i];
      exact(p, ['pluginId', 'dependencyId', 'sourceRevision', 'configuration', 'expectedEnabled', 'features',
        'skillCatalog', 'inputStatus', 'runtimeStatus']);
      if (p.pluginId !== reg.id || p.dependencyId !== reg.dependencyId || p.sourceRevision !== reg.sourceRevision
        || !isDeepStrictEqual(p.features, reg.features) || p.runtimeStatus !== 'unknown'
        || !['saved-snapshot', 'unavailable'].includes(p.configuration)
        || (p.configuration === 'unavailable' ? p.expectedEnabled !== null : typeof p.expectedEnabled !== 'boolean')) invalid();
      const c = p.skillCatalog;
      exact(c, ['fieldPresent', 'available', 'expectedCount', 'matchedCount', 'identityConflict']);
      if (typeof c.fieldPresent !== 'boolean' || typeof c.available !== 'boolean' || c.available && !c.fieldPresent
        || c.expectedCount !== reg.features.skills || !Number.isSafeInteger(c.expectedCount) || c.expectedCount < 0
        || (c.available ? !Number.isSafeInteger(c.matchedCount) || c.matchedCount < 0 || c.matchedCount > c.expectedCount
          || typeof c.identityConflict !== 'boolean' : c.matchedCount !== null || c.identityConflict !== null)
        || p.inputStatus !== inputStatus(p.expectedEnabled, c)) invalid();
    }
    const base = { status: value.sourceStatus, reasons: value.reasons.filter(r => !PLUGIN_OBSERVATION_REASONS.includes(r)) };
    const expected = withPluginEvidence(base, value.plugins);
    if (value.status !== expected.status || !isDeepStrictEqual(value.reasons, expected.reasons)
      || !isDeepStrictEqual(value.coverage, expected.coverage)) invalid();
    return { sourceStatus: value.sourceStatus, plugins: structuredClone(value.plugins), coverage: structuredClone(value.coverage),
      status: value.status, reasons: [...value.reasons] };
  } catch { invalid(); }
}
