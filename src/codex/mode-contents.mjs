import { requiredControlSources } from '../setup/control-sources.mjs';
import { readSkillInvocationPolicy } from '../sources/skill-policy.mjs';

// Describe immutable saved files, without a native catalog call or config write.
export async function describeCodexMode({ reg, snapshot, mode, preset }) {
  const controls = new Set(requiredControlSources(reg.skills).sourceIds);
  const skills = [];
  for (const source of reg.skills) {
    const saved = preset?.skillStates.find(s => s.id === source.id);
    const enabled = saved?.enabled ?? source.enabled;
    let state = 'disabled';
    if (enabled) {
      if (saved) state = saved.manualOnly ? 'manual' : 'automatic';
      else {
        try {
          state = snapshot[source.id + ':format'] !== null ? 'unknown'
            : await readSkillInvocationPolicy(snapshot[source.id + ':policy']?.text ?? null) ? 'automatic' : 'manual';
        } catch { state = 'unknown'; }
      }
    }
    skills.push({ id: source.id, label: source.label, state, requiredControl: controls.has(source.id) });
  }
  const style = !reg.instructions ? 'unmanaged' : mode === 'normal' ? 'saved' : preset.instructionStyle;
  return { instructions: { sourceId: reg.instructions?.id ?? null, label: 'AGENTS.md', style,
    readable: ['saved', 'minimal', 'custom'].includes(style) }, skills,
    plugins: (reg.plugins ?? []).map(p => ({ id: p.id, label: p.label,
      enabled: preset?.pluginStates?.find(s => s.pluginId === p.id)?.enabled ?? p.normalEnabled,
      requiredControl: p.requiredControl })) };
}
export function codexModeSource({ reg, snapshot, mode, sourceId }) {
  if (sourceId === reg.instructions?.id) return snapshot[mode === 'normal' ? reg.instructions.effective : 'override']?.text ?? '';
  if (reg.skills.some(s => s.id === sourceId)) return snapshot[sourceId + ':body']?.text ?? '';
  return null;
}
