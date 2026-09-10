import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../src/setup/mode-inheritance.mjs', import.meta.url);
const modes = await import(moduleUrl).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
});
const skill = (id, overrides = {}) => ({ id, enabled: true, normalAutomatic: true,
  manualControl: true, automaticControl: true, requiredControl: false, ...overrides });
// Positive provenance here is synthetic internal data, not native qualification.
const plugin = (id, skillIds, overrides = {}) => ({ id, eligibility: 'official-confirmed',
  sourceRevision: 'fixture-v1', skillIds, evidence: { directoryId: 'fixture-directory', pluginId: id,
    distribution: 'fixture-distribution', version: 'fixture-v1', contentId: 'f'.repeat(64),
    checkedAt: '2026-09-10T00:00:00Z' }, ...overrides });
const input = () => ({ plugins: [plugin('official-a', ['a'])],
  skills: [skill('a'), skill('b'), skill('c')],
  retainedOfficialPluginIds: ['official-a'], additionalAutomaticSkillIds: ['b', 'c'] });
function resolve(value) {
  assert.equal(typeof modes.resolveModeSkillSets, 'function', 'the shared inheritance resolver is implemented');
  return modes.resolveModeSkillSets(value);
}

test('UNSEAL inherits every TRUEFORM Skill before adding its reviewed extras', () => {
  assert.deepEqual(resolve(input()), {
    trueformAutomaticSkillIds: ['a'], unsealAutomaticSkillIds: ['a', 'b', 'c'],
    inheritedSkillIds: ['a'], additionalSkillIds: ['b', 'c'],
  });
});

test('an empty optional TRUEFORM selection is valid and does not select all official plugins', () => {
  const value = input(); value.retainedOfficialPluginIds = [];
  assert.deepEqual(resolve(value), { trueformAutomaticSkillIds: [], unsealAutomaticSkillIds: ['b', 'c'],
    inheritedSkillIds: [], additionalSkillIds: ['b', 'c'] });
});

test('empty registered sources yield empty optional sets', () => {
  assert.deepEqual(resolve({ plugins: [], skills: [], retainedOfficialPluginIds: [], additionalAutomaticSkillIds: [] }), {
    trueformAutomaticSkillIds: [], unsealAutomaticSkillIds: [], inheritedSkillIds: [], additionalSkillIds: [],
  });
});

test('multiple plugins and overlapping selections yield canonical sets without repeated additions', () => {
  const value = input(); value.plugins.push(plugin('official-b', ['c', 'b']));
  value.retainedOfficialPluginIds = ['official-b', 'official-a', 'official-b'];
  value.additionalAutomaticSkillIds = ['b', 'a', 'a']; value.skills.reverse();
  assert.deepEqual(resolve(value), { trueformAutomaticSkillIds: ['a', 'b', 'c'],
    unsealAutomaticSkillIds: ['a', 'b', 'c'], inheritedSkillIds: ['a', 'b', 'c'], additionalSkillIds: [] });
});

test('removing a baseline selection does not silently revive it as an addition', () => {
  const value = input(), before = resolve(value); value.retainedOfficialPluginIds = [];
  assert.deepEqual(resolve(value).unsealAutomaticSkillIds, ['b', 'c']);
  value.additionalAutomaticSkillIds.push('a');
  assert.deepEqual(resolve(value).additionalSkillIds, ['a', 'b', 'c']);
  assert.deepEqual(before.inheritedSkillIds, ['a']);
});

test('a selected plugin does not enable its disabled Skill or count it as automatic', () => {
  const value = input(); value.skills[0] = skill('a', { enabled: false, normalAutomatic: false });
  assert.deepEqual(resolve(value), { trueformAutomaticSkillIds: [], unsealAutomaticSkillIds: ['b', 'c'],
    inheritedSkillIds: [], additionalSkillIds: ['b', 'c'] });
});

test('explicit additions cannot bypass a separately required Skill enablement', () => {
  const value = input(); value.skills[1] = skill('b', { enabled: false, normalAutomatic: false });
  assert.throws(() => resolve(value), { kind: 'mode-inheritance-invalid' });
});

test('unselected required controls are retained outside the optional sets and their capability checks', () => {
  const value = input(); value.skills.push(skill('manager', { requiredControl: true,
    manualControl: false, automaticControl: false }));
  assert.deepEqual(resolve(value).unsealAutomaticSkillIds, ['a', 'b', 'c']);
});

for (const selection of ['plugin', 'addition']) test(`required controls cannot enter the optional ${selection} selection`, () => {
  const value = input(); value.skills[0].requiredControl = true;
  if (selection === 'addition') { value.retainedOfficialPluginIds = []; value.additionalAutomaticSkillIds.push('a'); }
  assert.throws(() => resolve(value), { kind: 'setup-required-control' });
});

test('retaining an already automatic baseline does not require editing its policy', () => {
  const value = input(); value.skills[0].manualControl = false; value.skills[0].automaticControl = false;
  assert.deepEqual(resolve(value).inheritedSkillIds, ['a']);
});

test('TRUEFORM manual-only control is required even for a Skill added automatically in UNSEAL', () => {
  const value = input(); value.skills[1].manualControl = false;
  assert.throws(() => resolve(value), { kind: 'setup-manual-control-unavailable' });
});

test('removing a plugin from TRUEFORM cannot substitute disablement for manual-only control', () => {
  const value = input(); value.skills[0].manualControl = false; value.retainedOfficialPluginIds = [];
  assert.throws(() => resolve(value), { kind: 'setup-manual-control-unavailable' });
});

test('a confirmed already manual Skill needs no policy edit to remain manual', () => {
  const value = input(); value.skills[1] = skill('b', { normalAutomatic: false,
    manualControl: false, automaticControl: false }); value.additionalAutomaticSkillIds = ['c'];
  assert.deepEqual(resolve(value).unsealAutomaticSkillIds, ['a', 'c']);
});

test('automatic selection cannot silently keep a Normal-manual Skill manual or claim an unsupported edit', () => {
  const value = input(); value.skills[0] = skill('a', { normalAutomatic: false, automaticControl: false });
  assert.throws(() => resolve(value), { kind: 'setup-automatic-control-unavailable' });
  value.skills[0].automaticControl = true;
  assert.deepEqual(resolve(value).inheritedSkillIds, ['a']);
});

for (const eligibility of ['unknown', 'not-official']) test(`${eligibility} provenance cannot qualify a plugin for TRUEFORM`, () => {
  const value = input(); value.plugins[0].eligibility = eligibility; value.plugins[0].evidence = null;
  assert.throws(() => resolve(value), { kind: 'plugin-origin-unverified' });
  value.retainedOfficialPluginIds = []; value.additionalAutomaticSkillIds = ['a'];
  assert.deepEqual(resolve(value).unsealAutomaticSkillIds, ['a']);
});

for (const [name, edit] of [
  ['missing evidence', p => { p.evidence = null; }],
  ['another plugin', p => { p.evidence.pluginId = 'other'; }],
  ['changed revision', p => { p.sourceRevision = 'fixture-v2'; }],
  ['missing content identity', p => { delete p.evidence.contentId; }],
  ['invalid content identity', p => { p.evidence.contentId = 'unverified'; }],
  ['non-string content identity', p => { p.evidence.contentId = ['f'.repeat(64)]; }],
  ['invalid observation time', p => { p.evidence.checkedAt = 'sometime'; }],
]) test(`a confirmed label with ${name} does not authorize a baseline selection`, () => {
  const value = input(); edit(value.plugins[0]);
  assert.throws(() => resolve(value), { kind: 'plugin-origin-unverified' });
});

for (const [name, edit] of [
  ['unknown plugin', x => { x.retainedOfficialPluginIds = ['not-installed']; }],
  ['unregistered plugin Skill', x => { x.plugins[0].skillIds.push('not-registered'); }],
  ['unregistered addition', x => { x.additionalAutomaticSkillIds.push('not-registered'); }],
  ['ambiguous plugin identity', x => { x.plugins.push(plugin('official-a', ['b'])); }],
  ['ambiguous Skill identity', x => { x.skills.push(skill('a')); }],
  ['missing actual invocation state', x => { delete x.skills[0].normalAutomatic; }],
  ['unrelated automatic list', x => { x.unsealAutomaticSkillIds = ['b']; }],
  ['caller supplied paths', x => { x.paths = ['/private/arbitrary']; }],
  ['invalid source state', x => { x.skills[0].enabled = false; }],
]) test(`inheritance rejects ${name}`, () => {
  const value = input(); edit(value);
  assert.throws(() => resolve(value), { kind: 'mode-inheritance-invalid' });
});

test('input and returned collections cannot mutate a previous version', () => {
  const value = input(), original = structuredClone(value);
  function freeze(x) { for (const v of Object.values(x)) if (v && typeof v === 'object') freeze(v); return Object.freeze(x); }
  freeze(value); const result = resolve(value);
  result.unsealAutomaticSkillIds.push('new'); result.inheritedSkillIds.push('new');
  assert.deepEqual(value, original); assert.deepEqual(resolve(value).unsealAutomaticSkillIds, ['a', 'b', 'c']);
});

test('invalid executable data is rejected without invoking it or exposing private input', () => {
  let invoked = false; const value = input();
  Object.defineProperty(value.skills[0], 'enabled', { enumerable: true, get() { invoked = true; throw Error('private text'); } });
  assert.throws(() => resolve(value), { kind: 'mode-inheritance-invalid', message: 'mode-inheritance-invalid' });
  assert.equal(invoked, false);
});
