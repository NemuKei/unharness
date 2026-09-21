import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePresetProposal, compileReleasePreset } from '../src/setup/preset.mjs';
import { setupInventoryId } from '../src/setup/inventory.mjs';

const id = value => value.repeat(64);
const scope = { scopeId: id('a'), normalId: id('b'), application: 'codex', runtimeVersion: '0.153.4',
  instructions: { id: 'instructions-' + id('c'), availability: { normal: true, unseal: true, trueform: true } },
  skills: [{ id: 'skill-' + id('d'), enabled: true, availability: { normal: true, unseal: true, trueform: true } }], plugins: [] };
const data = { schemaVersion: 2, scopeId: scope.scopeId, normalId: scope.normalId, application: 'codex',
  runtimeVersion: '0.153.4', skills: [{ id: scope.skills[0].id, normalState: 'automatic',
    availableStates: ['disabled', 'manual', 'automatic'], requiredControl: false }], plugins: [] };
const inventory = { ...data, inventoryId: setupInventoryId(data) };
const content = '# 私の限定解除\n\n- 必要な手順だけを使う。\n- 同じ条件の検証結果を再利用する。\n';
const proposal = () => ({ schemaVersion: 4, scopeId: scope.scopeId, normalId: scope.normalId, inventoryId: inventory.inventoryId,
  basis: { application: 'codex', modelId: 'synthetic-model', modelSource: 'user-specified', desktopVersion: null,
    runtimeVersion: '0.153.4', references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model',
      title: 'Fixture reference', checkedAt: '2026-09-20T00:00:00.000Z' }], rationale: 'Synthetic user-approved custom instructions.' },
  roles: [{ sourceId: scope.skills[0].id, origin: 'self', reason: 'Owned optional fixture' }],
  trueform: { skillStates: [{ sourceId: scope.skills[0].id, state: 'disabled' }], retainedOfficialPluginIds: [] },
  unseal: { instructions: 'custom', customInstructions: content,
    skillElevations: [{ sourceId: scope.skills[0].id, state: 'manual' }], additionalPluginIds: [] } });

test('v4 compiles exact custom instructions only into UNSEAL while preserving v3 Skill inheritance', () => {
  const input = proposal(), original = structuredClone(input);
  assert.deepEqual(validatePresetProposal(input, scope), original);
  const unseal = compileReleasePreset(input, 'unseal', scope, inventory);
  const trueform = compileReleasePreset(input, 'trueform', scope, inventory);
  assert.equal(unseal.instructionStyle, 'custom');
  assert.equal(unseal.customInstructions, content);
  assert.equal(unseal.sourceStates.skills[0].state, 'manual');
  assert.equal(trueform.instructionStyle, 'none');
  assert.equal(Object.hasOwn(trueform, 'customInstructions'), false);
  assert.equal(trueform.sourceStates.skills[0].state, 'disabled');
  assert.deepEqual(input, original);
});

test('v4 supports minimal and none without attaching unused custom text', () => {
  for (const instructions of ['minimal', 'none']) {
    const p = proposal(); p.unseal.instructions = instructions; delete p.unseal.customInstructions;
    assert.equal(compileReleasePreset(p, 'unseal', scope, inventory).instructionStyle, instructions);
    p.unseal.customInstructions = content;
    assert.throws(() => validatePresetProposal(p, scope), { kind: 'setup-proposal-invalid' });
  }
});

test('custom instructions have a UTF-8 byte bound and preserve exact accepted text', () => {
  const p = proposal();
  for (const text of ['a'.repeat(8192), 'あ'.repeat(2730) + 'ab', '本文\r\n\t箇条書き\n']) {
    p.unseal.customInstructions = text;
    assert.equal(validatePresetProposal(p, scope).unseal.customInstructions, text);
  }
  for (const text of ['', ' \n\t ', 'a'.repeat(8193), 'あ'.repeat(2731), 'x\u0000y', 'x\u0085y', '\ud800', { path: '/tmp/rules' }]) {
    p.unseal.customInstructions = text;
    assert.throws(() => validatePresetProposal(p, scope), { kind: 'setup-proposal-invalid' });
  }
});

test('v4 refuses missing text, foreign fields, TRUEFORM text, and an unregistered instruction source', () => {
  const missing = proposal(); delete missing.unseal.customInstructions;
  const foreign = proposal(); foreign.unseal.path = '/tmp/rules';
  const zero = proposal(); zero.trueform.customInstructions = content;
  for (const input of [missing, foreign, zero])
    assert.throws(() => validatePresetProposal(input, scope), { kind: 'setup-proposal-invalid' });
  assert.throws(() => validatePresetProposal(proposal(), { ...scope, instructions: null }), { kind: 'setup-proposal-invalid' });
});

test('historical v3 accepts its original minimal guide but never reinterprets custom text', () => {
  const p = proposal(); p.schemaVersion = 3;
  assert.throws(() => validatePresetProposal(p, scope), { kind: 'setup-proposal-invalid' });
  p.unseal.instructions = 'minimal'; delete p.unseal.customInstructions;
  const compiled = compileReleasePreset(p, 'unseal', scope, inventory);
  assert.equal(compiled.instructionStyle, 'minimal');
  assert.equal(Object.hasOwn(compiled, 'customInstructions'), false);
});
