import type { PluginObservation, PluginCoverage } from './sources';
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= 2048;
const input = (v: unknown) => typeof v === 'string' && ['matched', 'not-matched', 'unknown'].includes(v);
export function validPluginEvidence(value: unknown): value is { plugins?: PluginObservation[]; coverage?: PluginCoverage } {
  if (!object(value)) return false;
  if (value.plugins === undefined && value.coverage === undefined) return true;
  if (!Array.isArray(value.plugins) || value.plugins.length === 0 || value.plugins.length > 32
    || !object(value.coverage) || value.coverage.scope !== 'initial-recorded-inputs' || !input(value.coverage.inputStatus)
    || value.coverage.runtimeStatus !== 'unknown' || value.coverage.skillCatalogSource !== 'initial-world-state-host-skills'
    || !Array.isArray(value.coverage.unobservedComponents) || !value.coverage.unobservedComponents.every(s => typeof s === 'string')) return false;
  return new Set(value.plugins.map(p => p?.pluginId)).size === value.plugins.length && value.plugins.every(p => {
    if (!object(p) || typeof p.pluginId !== 'string' || typeof p.dependencyId !== 'string' || typeof p.sourceRevision !== 'string'
      || !['saved-snapshot', 'unavailable'].includes(p.configuration as string) || ![null, true, false].includes(p.expectedEnabled as boolean | null)
      || !input(p.inputStatus) || p.runtimeStatus !== 'unknown' || !object(p.features) || !object(p.skillCatalog)) return false;
    const c = p.skillCatalog, f = p.features;
    return ['skills', 'mcpServers', 'hooks', 'apps', 'appTemplates'].every(k => count(f[k]))
      && (f.scheduledTasks === null || count(f.scheduledTasks)) && typeof c.fieldPresent === 'boolean' && typeof c.available === 'boolean'
      && count(c.expectedCount) && c.expectedCount === f.skills && (c.matchedCount === null || count(c.matchedCount) && c.matchedCount <= c.expectedCount)
      && (c.identityConflict === null || typeof c.identityConflict === 'boolean');
  });
}
