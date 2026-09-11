// This boundary reads the saved Normal and registered capabilities. It does
// not perform an online lookup or infer official origin from a plugin name.
import { activeNormalId, loadNormal } from '../sources/records.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail } from '../sources/errors.mjs';
import { requiredControlSources } from './control-sources.mjs';
import { setupInventoryId } from './inventory.mjs';

export async function captureSetupInventory(w, normalId = activeNormalId(w)) {
  const app = applicationFor(w.reg.context);
  if (app.id !== 'codex') fail('setup-application-unsupported');
  const normal = await loadNormal(w.workspace, w.reg, normalId);
  const control = requiredControlSources(w.reg.skills).sourceIds;
  const skills = [], groups = new Map();
  for (const s of w.reg.skills) {
    const requiredControl = control.includes(s.id);
    let normalAutomatic = false;
    if (s.enabled) {
      if (normal[s.id + ':format'] !== null) fail('setup-inventory-unavailable');
      try {
        const { readSkillInvocationPolicy } = await import('../sources/skill-policy.mjs');
        normalAutomatic = await readSkillInvocationPolicy(normal[s.id + ':policy']?.text ?? null);
      } catch { fail('setup-inventory-unavailable'); }
    }
    // The native plugin cache has no qualified manual-only write route yet.
    // Registration/installation alone must never create that capability.
    const controlAvailable = s.availability.unseal && !s.pluginId && !s.path.includes('/plugins/cache/') && !requiredControl;
    skills.push({ id: s.id, enabled: s.enabled, normalAutomatic,
      manualControl: controlAvailable, automaticControl: controlAvailable, requiredControl });
    if (s.pluginId) groups.set(s.pluginId, [...(groups.get(s.pluginId) ?? []), s.id]);
  }
  const plugins = [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, skillIds]) => ({
    id, eligibility: 'unknown', sourceRevision: null, skillIds: skillIds.sort(), evidence: null,
  }));
  const data = { schemaVersion: 1, scopeId: w.scopeId, normalId, application: app.id,
    runtimeVersion: w.reg.version, skills, plugins };
  return { ...data, inventoryId: setupInventoryId(data) };
}

export async function captureInventoryForSetup(w, schemaVersion, normalId = activeNormalId(w)) {
  if (schemaVersion === 3) {
    const { captureSourceStateInventory } = await import('./inventory-v3-capture.mjs');
    return captureSourceStateInventory(w, normalId);
  }
  return captureSetupInventory(w, normalId);
}
