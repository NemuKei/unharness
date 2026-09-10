// Frozen inventory validation stays available to node-only offline readers.
// It authenticates no directory: positive provenance can only originate in a
// qualified adapter, never in a setup proposal or transport argument.
import { recordId } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { equal } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { requiredControlSources } from './control-sources.mjs';

export const setupInventoryId = data => recordId('input', { kind: 'unharness-user-source', role: 'setup-inventory', ...data });
const shape = (v, keys) => exactKeys(v, keys, [], 'setup-inventory-invalid');

export function validateSetupInventory(value, scope) {
  try {
    recordId('input', value);
    shape(value, ['inventoryId', 'schemaVersion', 'scopeId', 'normalId', 'application', 'runtimeVersion', 'skills', 'plugins']);
    const { inventoryId, ...data } = value;
    if (inventoryId !== setupInventoryId(data) || data.schemaVersion !== 1 || data.scopeId !== scope.scopeId
      || data.normalId !== scope.normalId || data.application !== scope.application
      || data.runtimeVersion !== scope.runtimeVersion || !Array.isArray(data.skills) || data.skills.length !== scope.skills.length
      || data.skills.length > 32 || !Array.isArray(data.plugins) || data.plugins.length > 32) fail('setup-inventory-invalid');
    const controls = requiredControlSources(scope.skills).sourceIds;
    for (const [index, skill] of data.skills.entries()) {
      shape(skill, ['id', 'enabled', 'normalAutomatic', 'manualControl', 'automaticControl', 'requiredControl']);
      const source = scope.skills[index];
      if (skill.id !== source.id || skill.enabled !== source.enabled || skill.requiredControl !== controls.includes(source.id)
        || ['enabled', 'normalAutomatic', 'manualControl', 'automaticControl', 'requiredControl'].some(k => typeof skill[k] !== 'boolean')
        || !skill.enabled && skill.normalAutomatic
        || (skill.manualControl || skill.automaticControl) && !source.availability.unseal) fail('setup-inventory-invalid');
    }
    const groups = new Map();
    for (const s of scope.skills) if (s.pluginId) groups.set(s.pluginId, [...(groups.get(s.pluginId) ?? []), s.id]);
    if (data.plugins.length !== groups.size || new Set(data.plugins.map(p => p.id)).size !== groups.size) fail('setup-inventory-invalid');
    for (const plugin of data.plugins) {
      shape(plugin, ['id', 'eligibility', 'sourceRevision', 'skillIds', 'evidence']);
      if (!groups.has(plugin.id) || !equal(plugin.skillIds, groups.get(plugin.id).sort())
        || !['unknown', 'not-official', 'official-confirmed'].includes(plugin.eligibility)) fail('setup-inventory-invalid');
    }
    return structuredClone(value);
  } catch { fail('setup-inventory-invalid'); }
}
