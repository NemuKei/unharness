import test from 'node:test';
import assert from 'node:assert/strict';
import { recordId } from '../src/core/local-store.mjs';
import { compileReleasePreset, validatePresetProposal } from '../src/setup/preset.mjs';

const scope = { scopeId: 'a'.repeat(64), normalId: 'b'.repeat(64), application: 'codex', runtimeVersion: '0.153.4',
  instructions: null, skills: ['a', 'b', 'c', 'disabled'].map(id => ({ id, enabled: id !== 'disabled',
    pluginId: id === 'a' ? 'fixture-official' : null, availability: { unseal: true } })) };
function inventory() {
  const data = { schemaVersion: 1, scopeId: scope.scopeId, normalId: scope.normalId, application: 'codex', runtimeVersion: scope.runtimeVersion,
    skills: scope.skills.map(s => ({ id: s.id, enabled: s.enabled, normalAutomatic: s.enabled,
      manualControl: true, automaticControl: true, requiredControl: false })),
    plugins: [{ id: 'fixture-official', eligibility: 'official-confirmed', sourceRevision: 'fixture-v1', skillIds: ['a'],
      evidence: { directoryId: 'fixture-directory', pluginId: 'fixture-official', distribution: 'fixture-source',
        version: 'fixture-v1', contentId: 'f'.repeat(64), checkedAt: '2026-09-10T00:00:00Z' } }] };
  return { ...data, inventoryId: recordId('input', { kind: 'unharness-user-source', role: 'setup-inventory', ...data }) };
}
function proposal(i) {
  return { schemaVersion: 2, scopeId: scope.scopeId, normalId: scope.normalId, inventoryId: i.inventoryId,
    basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
      runtimeVersion: scope.runtimeVersion, references: [{ url: 'https://developers.openai.com/codex/skills', title: 'Official reference',
        checkedAt: '2026-09-10T00:00:00Z' }], rationale: 'Synthetic reviewed condition' },
    roles: scope.skills.map(s => ({ sourceId: s.id, origin: 'external', reason: 'Explicit synthetic role' })),
    unseal: { instructions: 'none', additionalAutomaticSkillIds: ['b'] }, trueform: { retainedOfficialPluginIds: ['fixture-official'] } };
}

test('v2 compiles both inherited sets from the exact internally supplied inventory', () => {
  const i = inventory(), p = proposal(i);
  assert.deepEqual(validatePresetProposal(p, scope), p);
  const z = compileReleasePreset(p, 'trueform', scope, i), u = compileReleasePreset(p, 'unseal', scope, i);
  assert.deepEqual(z.automaticSkillIds, ['a']);
  assert.deepEqual(u.automaticSkillIds, ['a', 'b']);
  assert.deepEqual(z.selection, ['b', 'c', 'disabled']);
  assert.deepEqual(u.selection, ['c', 'disabled']);
  assert.deepEqual(z.inheritance, u.inheritance);
  assert.deepEqual(u.inheritance.additionalSkillIds, ['b']);
  assert.equal(u.skillRelease, 'manual-only');
});

test('v2 cannot use claimed provenance, independent complete lists or an absent inventory', () => {
  const i = inventory(), p = proposal(i);
  for (const extra of [{ evidence: i.plugins[0].evidence }, { plugins: i.plugins }, { approved: true }])
    assert.throws(() => validatePresetProposal({ ...p, ...extra }, scope), { kind: 'setup-proposal-invalid' });
  assert.throws(() => validatePresetProposal({ ...p, unseal: { instructions: 'none', automaticSkillIds: ['b'] } }, scope), { kind: 'setup-proposal-invalid' });
  assert.throws(() => validatePresetProposal({ ...p, trueform: { automaticExternalSkillIds: ['a'] } }, scope), { kind: 'setup-proposal-invalid' });
  assert.throws(() => compileReleasePreset(p, 'unseal', scope), { kind: 'setup-inventory-invalid' });
  assert.throws(() => compileReleasePreset({ ...p, inventoryId: 'f'.repeat(64) }, 'unseal', scope, i), { kind: 'stale-discovery' });
});

test('mutated inventory metadata, crossed registration and changed membership are refused', () => {
  const original = inventory(), p = proposal(original);
  for (const mutate of [i => { i.skills[0].enabled = false; }, i => { i.plugins[0].skillIds.push('c'); },
    i => { i.scopeId = 'c'.repeat(64); }, i => { i.plugins[0].evidence.version = 'changed'; }]) {
    const i = structuredClone(original); mutate(i);
    assert.throws(() => compileReleasePreset(p, 'unseal', scope, i), { kind: 'setup-inventory-invalid' });
  }
});

test('empty TRUEFORM is valid; disabled selections and unknown origin are refused', () => {
  const i = inventory(), p = proposal(i); p.trueform.retainedOfficialPluginIds = [];
  assert.deepEqual(compileReleasePreset(p, 'trueform', scope, i).automaticSkillIds, []);
  assert.deepEqual(compileReleasePreset(p, 'unseal', scope, i).automaticSkillIds, ['b']);
  p.unseal.additionalAutomaticSkillIds.push('disabled');
  assert.throws(() => compileReleasePreset(p, 'unseal', scope, i), { kind: 'mode-inheritance-invalid' });
  p.unseal.additionalAutomaticSkillIds = []; p.roles[0].origin = 'unknown';
  assert.throws(() => compileReleasePreset(p, 'trueform', scope, i), { kind: 'setup-roles-unconfirmed' });
});

test('v1 cannot acquire v2 meaning by mixing either schema or fields', () => {
  const i = inventory(), p = proposal(i);
  assert.throws(() => validatePresetProposal({ ...p, schemaVersion: 1 }, scope), { kind: 'setup-proposal-invalid' });
  assert.throws(() => validatePresetProposal({ ...p, inventoryId: undefined }, scope), { kind: 'setup-proposal-invalid' });
});
