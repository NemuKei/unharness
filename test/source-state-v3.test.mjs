import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSourceStatesV3 } from '../src/setup/source-state-v3.mjs';

const skill = (id, normalState = 'automatic', availableStates = ['disabled', 'manual', 'automatic']) =>
  ({ id, normalState, availableStates, requiredControl: false });
const plugin = (id, normalEnabled = true) => ({ id, normalEnabled, wholePluginControl: true,
  requiredControl: false, eligibility: 'official-confirmed', sourceRevision: '1.0.0',
  evidence: { directoryId: 'public', pluginId: id, distribution: 'remote-synthetic', version: '1.0.0',
    contentId: 'a'.repeat(64), checkedAt: '2026-09-11T00:00:00Z' } });
const input = () => ({ skills: [skill('a'), skill('b', 'manual'), skill('c', 'disabled')],
  plugins: [plugin('one'), plugin('two')],
  trueformSkillStates: [{ sourceId: 'a', state: 'disabled' }, { sourceId: 'b', state: 'manual' },
    { sourceId: 'c', state: 'disabled' }],
  unsealSkillElevations: [{ sourceId: 'a', state: 'manual' }, { sourceId: 'b', state: 'automatic' }],
  retainedOfficialPluginIds: ['one'], additionalPluginIds: ['two'] });
const rejects = (edit, kind = 'source-state-v3-invalid') => {
  const value = input(); edit(value);
  assert.throws(() => resolveSourceStatesV3(value), { kind });
};

test('mixed ordinary states and whole-plugin choices produce one inherited pair', () => {
  const value = input(), before = structuredClone(value), result = resolveSourceStatesV3(value);
  assert.deepEqual(result, {
    trueform: { skills: [{ sourceId: 'a', state: 'disabled' }, { sourceId: 'b', state: 'manual' },
      { sourceId: 'c', state: 'disabled' }], plugins: [{ pluginId: 'one', state: 'normal', enabled: true },
      { pluginId: 'two', state: 'disabled', enabled: false }] },
    unseal: { skills: [{ sourceId: 'a', state: 'manual' }, { sourceId: 'b', state: 'automatic' },
      { sourceId: 'c', state: 'disabled' }], plugins: [{ pluginId: 'one', state: 'normal', enabled: true },
      { pluginId: 'two', state: 'normal', enabled: true }] },
    inheritedPluginIds: ['one'], additionalPluginIds: ['two'],
    skillElevations: [{ sourceId: 'a', state: 'manual' }, { sourceId: 'b', state: 'automatic' }],
    enabledFromNormal: { trueform: [], unseal: [] },
  });
  assert.deepEqual(value, before);
});

test('empty source and selection sets are an explicit valid pair', () => {
  const result = resolveSourceStatesV3({ skills: [], plugins: [], trueformSkillStates: [],
    unsealSkillElevations: [], retainedOfficialPluginIds: [], additionalPluginIds: [] });
  assert.deepEqual(result.trueform, { skills: [], plugins: [] });
  assert.deepEqual(result.unseal, result.trueform);
});

test('disabled Normal plugins stay disabled even when retained or added', () => {
  const value = input(); value.plugins.forEach(p => { p.normalEnabled = false; p.wholePluginControl = false; });
  const result = resolveSourceStatesV3(value);
  for (const mode of ['trueform', 'unseal']) assert.ok(result[mode].plugins.every(p => !p.enabled));
  assert.equal(result.unseal.plugins[1].state, 'normal');
});

test('ordinary disabled Normal requires an explicit selected state and reports activation', () => {
  const value = input(); value.trueformSkillStates[2].state = 'manual';
  value.unsealSkillElevations.push({ sourceId: 'c', state: 'automatic' });
  const result = resolveSourceStatesV3(value);
  assert.deepEqual(result.enabledFromNormal, { trueform: ['c'], unseal: ['c'] });
  assert.equal(result.trueform.skills[2].state, 'manual');
  assert.equal(result.unseal.skills[2].state, 'automatic');
});

test('Normal states can be preserved without claiming unavailable transitions', () => {
  const value = input(); value.skills[1].availableStates = [];
  value.unsealSkillElevations = value.unsealSkillElevations.filter(s => s.sourceId !== 'b');
  assert.equal(resolveSourceStatesV3(value).unseal.skills[1].state, 'manual');
});

test('required controls stay outside optional choices and counts', () => {
  const value = input(); value.skills.push({ ...skill('manager'), requiredControl: true });
  value.plugins.push({ ...plugin('management'), requiredControl: true, wholePluginControl: false });
  const result = resolveSourceStatesV3(value);
  assert.equal(result.trueform.skills.length, 3); assert.equal(result.trueform.plugins.length, 2);
  rejects(v => { v.skills[0].requiredControl = true; }, 'setup-required-control');
  rejects(v => { v.plugins[0].requiredControl = true; }, 'setup-required-control');
});

test('unsupported changes fail separately from provenance', () => {
  rejects(v => { v.skills[0].availableStates = ['automatic']; }, 'setup-skill-state-unavailable');
  rejects(v => { v.skills[1].availableStates = ['manual', 'disabled']; }, 'setup-skill-state-unavailable');
  rejects(v => { v.plugins[1].wholePluginControl = false; }, 'setup-plugin-control-unavailable');
  const value = input(); value.plugins[0].wholePluginControl = false;
  assert.equal(resolveSourceStatesV3(value).trueform.plugins[0].enabled, true);
});

test('unverified plugins can be explicitly disabled and added only to UNSEAL', () => {
  const value = input(); value.plugins[1].eligibility = 'unknown'; value.plugins[1].evidence = null;
  const result = resolveSourceStatesV3(value);
  assert.equal(result.trueform.plugins[1].enabled, false);
  assert.equal(result.unseal.plugins[1].enabled, true);
  rejects(v => { v.plugins[0].eligibility = 'unknown'; }, 'plugin-origin-unverified');
  rejects(v => { v.plugins[0].eligibility = 'not-official'; }, 'plugin-origin-unverified');
  rejects(v => { v.plugins[0].evidence.version = '2.0.0'; }, 'plugin-origin-unverified');
  rejects(v => { v.plugins[0].evidence.pluginId = 'different'; }, 'plugin-origin-unverified');
});

for (const [label, edit] of [
  ['automatic TRUEFORM ordinary Skill', v => { v.trueformSkillStates[0].state = 'automatic'; }],
  ['lowering inherited manual', v => { v.unsealSkillElevations[1].state = 'disabled'; }],
  ['repeating inherited state', v => { v.unsealSkillElevations[1].state = 'manual'; }],
  ['missing base state', v => { v.trueformSkillStates.pop(); }],
  ['unknown base source', v => { v.trueformSkillStates[0].sourceId = 'unknown'; }],
  ['unknown extra source', v => { v.unsealSkillElevations[0].sourceId = 'unknown'; }],
  ['duplicate base source', v => { v.trueformSkillStates[2] = v.trueformSkillStates[0]; }],
  ['duplicate extra source', v => { v.unsealSkillElevations.push(v.unsealSkillElevations[0]); }],
  ['duplicate registered Skill', v => { v.skills.push(v.skills[0]); }],
  ['unknown plugin', v => { v.additionalPluginIds.push('unknown'); }],
  ['duplicate plugin choice', v => { v.retainedOfficialPluginIds.push('one'); }],
  ['overlapping plugin choices', v => { v.additionalPluginIds.push('one'); }],
  ['duplicate registered plugin', v => { v.plugins.push(v.plugins[0]); }],
  ['invented capability', v => { v.skills[0].availableStates.push('force'); }],
  ['extra target path', v => { v.trueformSkillStates[0].path = '/arbitrary'; }],
  ['oversized inventory', v => { v.skills = Array.from({ length: 33 }, (_, i) => skill('s' + i)); }],
]) test('rejects ' + label, () => rejects(edit));

test('ordering is deterministic and proposal data cannot run getters', () => {
  const value = input(), expected = resolveSourceStatesV3(value);
  value.skills.reverse(); value.plugins.reverse(); value.trueformSkillStates.reverse(); value.unsealSkillElevations.reverse();
  assert.deepEqual(resolveSourceStatesV3(value), expected);
  let accessed = false;
  Object.defineProperty(value, 'skills', { enumerable: true, get() { accessed = true; return []; } });
  assert.throws(() => resolveSourceStatesV3(value), { kind: 'source-state-v3-invalid' });
  assert.equal(accessed, false);
});
