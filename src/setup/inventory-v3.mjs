// Offline validation of the v3 state inventory. Runtime collection and
// ownership/provenance decisions remain at the application boundary.
import { recordId } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { requiredControlSources } from './control-sources.mjs';
import { setupInventoryId } from './inventory.mjs';
import { isDeepStrictEqual } from 'node:util';

export const sourceStatePluginInventory = p => ({ id: p.id, normalEnabled: p.normalEnabled,
  wholePluginControl: p.wholePluginControl, requiredControl: p.requiredControl, eligibility: p.eligibility,
  sourceRevision: p.sourceRevision, evidence: structuredClone(p.evidence) });

export function validateSourceStateInventory(value, scope) {
  try {
    recordId('input', value);
    exactKeys(value, ['inventoryId', 'schemaVersion', 'scopeId', 'normalId', 'application', 'runtimeVersion', 'skills', 'plugins'], [], 'setup-inventory-invalid');
    const { inventoryId, ...data } = value;
    if (data.schemaVersion !== 2 || inventoryId !== setupInventoryId(data) || data.scopeId !== scope.scopeId
      || data.normalId !== scope.normalId || data.application !== 'codex' || data.application !== scope.application
      || data.runtimeVersion !== scope.runtimeVersion || data.runtimeVersion !== '0.153.4'
      || !Array.isArray(data.skills) || data.skills.length !== scope.skills.length || data.skills.length > 32
      || !Array.isArray(data.plugins) || data.plugins.length > 32
      || !isDeepStrictEqual(data.plugins, (scope.plugins ?? []).map(sourceStatePluginInventory))) fail('setup-inventory-invalid');
    const control = requiredControlSources(scope.skills).sourceIds;
    for (const [i, s] of data.skills.entries()) {
      exactKeys(s, ['id', 'normalState', 'availableStates', 'requiredControl'], [], 'setup-inventory-invalid');
      const source = scope.skills[i];
      if (s.id !== source.id || source.pluginId || s.requiredControl !== control.includes(s.id)
        || !['disabled', 'manual', 'automatic'].includes(s.normalState) || (s.normalState !== 'disabled') !== source.enabled
        || !Array.isArray(s.availableStates) || new Set(s.availableStates).size !== s.availableStates.length
        || s.availableStates.some(state => !['disabled', 'manual', 'automatic'].includes(state))
        || s.requiredControl && s.availableStates.length) fail('setup-inventory-invalid');
    }
    return structuredClone(value);
  } catch { fail('setup-inventory-invalid'); }
}
