// Pure selection rules. The service supplies registered source capabilities
// and internally verified provenance; this function does not authenticate a
// directory response, discover sources, publish records or change settings.
import { recordId } from '../core/local-store.mjs';
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { validUtc } from '../sources/observation-record.mjs';
import { fail } from '../sources/errors.mjs';

const invalid = 'mode-inheritance-invalid';
const retainedErrors = new Set([invalid, 'plugin-origin-unverified', 'setup-required-control',
  'setup-manual-control-unavailable', 'setup-automatic-control-unavailable']);
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._@~-]{0,255}$/.test(v);
const shape = (value, fields) => exactKeys(value, fields, [], invalid);
function list(value, limit) {
  if (!Array.isArray(value) || value.length > limit) fail(invalid);
  return value;
}
function ids(value, limit) {
  if (list(value, limit).some(v => !identifier(v))) fail(invalid);
  return [...new Set(value)].sort();
}
function confirmed(plugin) {
  try {
    if (plugin.eligibility !== 'official-confirmed') throw Error();
    const e = plugin.evidence;
    shape(e, ['directoryId', 'pluginId', 'distribution', 'version', 'contentId', 'checkedAt']);
    if (!identifier(e.directoryId) || e.pluginId !== plugin.id || plugin.sourceRevision !== e.version
      || typeof e.contentId !== 'string' || !/^[a-f0-9]{64}$/.test(e.contentId) || !validUtc(e.checkedAt)) throw Error();
    boundedText(e.version, 256, false, invalid);
    boundedText(e.distribution, 2048, false, invalid);
  } catch { fail('plugin-origin-unverified'); }
}

export function resolveModeSkillSets(value) {
  try {
    // The existing canonical validator rejects accessors, proxies, executable
    // values, cycles and oversized payloads before any property is interpreted.
    recordId('input', value);
    shape(value, ['plugins', 'skills', 'retainedOfficialPluginIds', 'additionalAutomaticSkillIds']);
    const skills = new Map();
    for (const skill of list(value.skills, 32)) {
      shape(skill, ['id', 'enabled', 'normalAutomatic', 'manualControl', 'automaticControl', 'requiredControl']);
      if (!identifier(skill.id) || skills.has(skill.id)
        || ['enabled', 'normalAutomatic', 'manualControl', 'automaticControl', 'requiredControl'].some(k => typeof skill[k] !== 'boolean')
        || !skill.enabled && skill.normalAutomatic) fail(invalid);
      skills.set(skill.id, skill);
    }
    const plugins = new Map();
    for (const plugin of list(value.plugins, 2048)) {
      shape(plugin, ['id', 'eligibility', 'sourceRevision', 'skillIds', 'evidence']);
      if (!identifier(plugin.id) || plugins.has(plugin.id)
        || !['official-confirmed', 'not-official', 'unknown'].includes(plugin.eligibility)) fail(invalid);
      if (plugin.sourceRevision !== null) boundedText(plugin.sourceRevision, 256, false, invalid);
      plugins.set(plugin.id, { ...plugin, skillIds: ids(plugin.skillIds, 32) });
    }
    const getSkill = id => {
      const skill = skills.get(id);
      if (!skill) fail(invalid);
      if (skill.requiredControl) fail('setup-required-control');
      return skill;
    };
    const inherited = new Set();
    for (const id of ids(value.retainedOfficialPluginIds, 2048)) {
      const plugin = plugins.get(id);
      if (!plugin) fail(invalid);
      confirmed(plugin);
      for (const skillId of plugin.skillIds) {
        if (getSkill(skillId).enabled) inherited.add(skillId);
      }
    }
    const additional = new Set();
    for (const id of ids(value.additionalAutomaticSkillIds, 32)) {
      if (!getSkill(id).enabled) fail(invalid);
      if (!inherited.has(id)) additional.add(id);
    }
    for (const skill of skills.values()) {
      if (!skill.enabled || skill.requiredControl) continue;
      // UNSEAL-only additions still need to become manual in TRUEFORM.
      if (!inherited.has(skill.id) && skill.normalAutomatic && !skill.manualControl)
        fail('setup-manual-control-unavailable');
      if ((inherited.has(skill.id) || additional.has(skill.id)) && !skill.normalAutomatic && !skill.automaticControl)
        fail('setup-automatic-control-unavailable');
    }
    return {
      trueformAutomaticSkillIds: [...inherited].sort(),
      unsealAutomaticSkillIds: [...inherited, ...additional].sort(),
      inheritedSkillIds: [...inherited].sort(),
      additionalSkillIds: [...additional].sort(),
    };
  } catch (e) { fail(retainedErrors.has(e?.kind) ? e.kind : invalid); }
}
