// Adapter compilation for the explicit v3 ordinary Skill states. The shared
// transaction publishes the returned frozen files; this helper edits only a
// newly owned native configuration copy and never provider package contents.
import { fail } from '../sources/errors.mjs';
import { requiredControlSources } from '../setup/control-sources.mjs';

export async function compileCodexSourceStates({ reg, normal, after, sourceStates, targetFile }) {
  const control = requiredControlSources(reg.skills).sourceIds;
  const optional = reg.skills.filter(s => !control.includes(s.id));
  if (!sourceStates || !Array.isArray(sourceStates.skills) || sourceStates.skills.length !== optional.length
    || new Set(sourceStates.skills.map(s => s.sourceId)).size !== optional.length
    || !Array.isArray(sourceStates.plugins) || sourceStates.plugins.length !== (reg.plugins?.length ?? 0)
    || new Set(sourceStates.plugins.map(p => p.pluginId)).size !== sourceStates.plugins.length) fail('setup-record-invalid');
  const { readSkillInvocationPolicy, makeManualSkillPolicy, makeAutomaticSkillPolicy } = await import('../sources/skill-policy.mjs');
  const changedFlags = [], skillStates = [];
  for (const wanted of sourceStates.skills) {
    const s = optional.find(s => s.id === wanted.sourceId);
    if (!s || s.pluginId || s.path.includes('/plugins/cache/') || !['disabled', 'manual', 'automatic'].includes(wanted.state))
      fail('setup-record-invalid');
    const enabled = wanted.state !== 'disabled', manualOnly = wanted.state === 'manual';
    if (enabled !== s.enabled) changedFlags.push({ path: s.path, enabled });
    if (enabled) {
      const key = s.id + ':policy', original = normal[key]?.text ?? null;
      const implicit = await readSkillInvocationPolicy(original);
      if (implicit === manualOnly) after[key] = await targetFile(key,
        await (manualOnly ? makeManualSkillPolicy : makeAutomaticSkillPolicy)(original));
    }
    skillStates.push({ id: s.id, enabled, manualOnly });
  }
  if (changedFlags.length) {
    const { setSkillStatesConfig } = await import('./config-editor.mjs');
    const compiled = await setSkillStatesConfig({ configText: normal.config?.text ?? '',
      skillStates: changedFlags, executable: reg.context.executable });
    if (compiled.codexVersion !== reg.version) fail('stale-discovery');
    after.config = await targetFile('config', compiled.text);
  }
  const pluginStates = [], disabled = [];
  for (const wanted of sourceStates.plugins) {
    const p = reg.plugins.find(p => p.id === wanted.pluginId);
    if (!p || p.requiredControl || !p.wholePluginControl || !['normal', 'disabled'].includes(wanted.state)
      || wanted.enabled !== (wanted.state === 'normal' && p.normalEnabled)) fail('setup-record-invalid');
    if (wanted.state === 'disabled') disabled.push(p.id);
    pluginStates.push({ pluginId: p.id, state: wanted.state, enabled: wanted.enabled });
  }
  if (disabled.length) {
    const { disablePluginConfig } = await import('./plugin-config-editor.mjs');
    const compiled = await disablePluginConfig({ configText: after.config?.text ?? '',
      pluginIds: disabled, executable: reg.context.executable });
    if (compiled.codexVersion !== reg.version) fail('stale-discovery');
    after.config = await targetFile('config', compiled.text);
  }
  return { after, skillStates, pluginStates };
}
