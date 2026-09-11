// V3 rules over a locally captured, frozen capability inventory. This pure
// resolver does not establish ownership/provenance or obtain write authority.
// Ordinary Skill invocation and whole-plugin enablement stay distinct.
import { recordId } from '../core/local-store.mjs';
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { validateOfficialPluginEvidence } from './mode-inheritance.mjs';

const invalid = 'source-state-v3-invalid';
const retainedErrors = new Set([invalid, 'plugin-origin-unverified', 'setup-required-control',
  'setup-skill-state-unavailable', 'setup-plugin-control-unavailable']);
const states = ['disabled', 'manual', 'automatic'];
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._@~-]{0,255}$/.test(v);
const shape = (v, keys) => exactKeys(v, keys, [], invalid);
function list(v) {
  if (!Array.isArray(v) || v.length > 32) fail(invalid);
  return v;
}
function unique(v, predicate = identifier) {
  if (list(v).some(id => !predicate(id)) || new Set(v).size !== v.length) fail(invalid);
  return [...v].sort();
}
function required(map, id) {
  const item = map.get(id);
  if (!identifier(id) || !item) fail(invalid);
  if (item.requiredControl) fail('setup-required-control');
  return item;
}
function stateSelections(values, skills, allowed) {
  const result = new Map();
  for (const value of list(values)) {
    shape(value, ['sourceId', 'state']);
    required(skills, value.sourceId);
    if (!allowed.includes(value.state) || result.has(value.sourceId)) fail(invalid);
    result.set(value.sourceId, value.state);
  }
  return result;
}

export function resolveSourceStatesV3(value) {
  try {
    recordId('input', value);
    shape(value, ['skills', 'plugins', 'trueformSkillStates', 'unsealSkillElevations',
      'retainedOfficialPluginIds', 'additionalPluginIds']);
    const skills = new Map(), plugins = new Map();
    for (const s of list(value.skills)) {
      shape(s, ['id', 'normalState', 'availableStates', 'requiredControl']);
      if (!identifier(s.id) || skills.has(s.id) || !states.includes(s.normalState)
        || typeof s.requiredControl !== 'boolean') fail(invalid);
      unique(s.availableStates, state => states.includes(state));
      skills.set(s.id, s);
    }
    for (const p of list(value.plugins)) {
      shape(p, ['id', 'normalEnabled', 'wholePluginControl', 'requiredControl',
        'eligibility', 'sourceRevision', 'evidence']);
      if (!identifier(p.id) || plugins.has(p.id)
        || ['normalEnabled', 'wholePluginControl', 'requiredControl'].some(k => typeof p[k] !== 'boolean')
        || !['official-confirmed', 'not-official', 'unknown'].includes(p.eligibility)) fail(invalid);
      if (p.sourceRevision !== null) boundedText(p.sourceRevision, 256, false, invalid);
      plugins.set(p.id, p);
    }
    const base = stateSelections(value.trueformSkillStates, skills, ['disabled', 'manual']);
    if (base.size !== [...skills.values()].filter(s => !s.requiredControl).length) fail(invalid);
    const elevations = stateSelections(value.unsealSkillElevations, skills, ['manual', 'automatic']);
    for (const [id, state] of elevations) {
      if (states.indexOf(state) <= states.indexOf(base.get(id))) fail(invalid);
    }
    const inheritedPluginIds = unique(value.retainedOfficialPluginIds);
    const additionalPluginIds = unique(value.additionalPluginIds);
    for (const id of inheritedPluginIds) validateOfficialPluginEvidence(required(plugins, id));
    for (const id of additionalPluginIds) {
      required(plugins, id);
      if (inheritedPluginIds.includes(id)) fail(invalid);
    }
    const pair = {}, enabledFromNormal = {};
    for (const mode of ['trueform', 'unseal']) {
      enabledFromNormal[mode] = [];
      const skillStates = [...base].sort(([a], [b]) => a.localeCompare(b)).map(([sourceId, initial]) => {
        const source = skills.get(sourceId), state = mode === 'unseal' ? elevations.get(sourceId) ?? initial : initial;
        if (state !== source.normalState && !source.availableStates.includes(state)) fail('setup-skill-state-unavailable');
        if (source.normalState === 'disabled' && state !== 'disabled') enabledFromNormal[mode].push(sourceId);
        return { sourceId, state };
      });
      const kept = new Set([...inheritedPluginIds, ...(mode === 'unseal' ? additionalPluginIds : [])]);
      const pluginStates = [...plugins.values()].filter(p => !p.requiredControl)
        .sort((a, b) => a.id.localeCompare(b.id)).map(p => {
          const state = kept.has(p.id) ? 'normal' : 'disabled';
          if (state === 'disabled' && p.normalEnabled && !p.wholePluginControl) fail('setup-plugin-control-unavailable');
          return { pluginId: p.id, state, enabled: state === 'normal' && p.normalEnabled };
        });
      pair[mode] = { skills: skillStates, plugins: pluginStates };
    }
    return { ...pair, inheritedPluginIds, additionalPluginIds,
      skillElevations: [...elevations].sort(([a], [b]) => a.localeCompare(b)).map(([sourceId, state]) => ({ sourceId, state })),
      enabledFromNormal };
  } catch (e) { fail(retainedErrors.has(e?.kind) ? e.kind : invalid); }
}
