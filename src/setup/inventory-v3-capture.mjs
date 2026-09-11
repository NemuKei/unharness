import { loadNormal, activeNormalId } from '../sources/records.mjs';
import { canPlanOwnership } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { applicationFor } from '../apps/index.mjs';
import { requiredControlSources } from './control-sources.mjs';
import { setupInventoryId } from './inventory.mjs';
import { sourceStatePluginInventory } from './inventory-v3.mjs';

export async function captureSourceStateInventory(w, normalId = activeNormalId(w)) {
  if (applicationFor(w.reg.context).id !== 'codex' || w.reg.version !== '0.153.4') fail('setup-application-unsupported');
  const normal = await loadNormal(w.workspace, w.reg, normalId);
  if (w.reg.plugins?.length) {
    const { validateRegisteredPlugins } = await import('../codex/plugin-dependency.mjs');
    const { assertPluginDependency } = await import('../codex/plugin-inventory.mjs');
    if (!canPlanOwnership(normal.config)) fail('setup-plugin-control-unavailable');
    for (const dependency of await validateRegisteredPlugins(w.workspace, w.reg))
      await assertPluginDependency(w.reg.context, dependency);
  }
  const control = requiredControlSources(w.reg.skills).sourceIds, skills = [];
  const { readSkillInvocationPolicy } = await import('../sources/skill-policy.mjs');
  for (const s of w.reg.skills) {
    if (s.pluginId || s.path.includes('/plugins/cache/') || normal[s.id + ':format'] !== null) fail('setup-inventory-unavailable');
    const implicit = await readSkillInvocationPolicy(normal[s.id + ':policy']?.text ?? null);
    const requiredControl = control.includes(s.id), availableStates = [];
    if (!requiredControl) {
      const canEnable = s.availability.trueform && canPlanOwnership(normal.config);
      const canPolicy = s.availability.unseal && canPlanOwnership(normal[s.id + ':policy']);
      if (canEnable) availableStates.push('disabled');
      if ((s.enabled || canEnable) && (!implicit || canPolicy)) availableStates.push('manual');
      if ((s.enabled || canEnable) && (implicit || canPolicy)) availableStates.push('automatic');
    }
    skills.push({ id: s.id, normalState: s.enabled ? implicit ? 'automatic' : 'manual' : 'disabled', availableStates, requiredControl });
  }
  const data = { schemaVersion: 2, scopeId: w.scopeId, normalId, application: 'codex', runtimeVersion: w.reg.version,
    skills, plugins: (w.reg.plugins ?? []).map(sourceStatePluginInventory) };
  return { ...data, inventoryId: setupInventoryId(data) };
}
