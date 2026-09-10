import test from 'node:test';
import assert from 'node:assert/strict';
const presets = await import('../src/setup/preset.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const id = digit => digit.repeat(64);
const scope = { scopeId: id('a'), normalId: id('b'), application: 'codex',
  instructions: { id: 'instructions-' + id('c'), availability: { unseal: true, trueform: true } },
  skills: ['1', '2', '3'].map(d => ({ id: 'skill-' + id(d), enabled: true, availability: { unseal: true, trueform: true } })) };
const proposal = { schemaVersion: 1, scopeId: scope.scopeId, normalId: scope.normalId,
  basis: { application: 'codex', modelId: 'gpt-6-astra', modelSource: 'user-specified', desktopVersion: null, runtimeVersion: '0.153.4',
    references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model', title: 'Official model guidance', checkedAt: '2026-09-09T00:00:00.000Z' }],
    rationale: 'A starting proposal for the declared work, to be compared after use.' },
  roles: scope.skills.map((s, i) => ({ sourceId: s.id, origin: i < 2 ? 'self' : 'external', reason: 'Explicitly reviewed source role' })),
  unseal: { instructions: 'minimal', automaticSkillIds: [scope.skills[0].id, scope.skills[2].id] },
  trueform: { automaticExternalSkillIds: [scope.skills[2].id] } };

test('the two release definitions keep selected automatic use in UNSEAL and require every self-authored Skill to be manual in TRUEFORM', () => {
  assert.equal(typeof presets.compileReleasePreset, 'function');
  const p = presets.validatePresetProposal(proposal, scope);
  assert.deepEqual(p, proposal);
  assert.deepEqual(presets.compileReleasePreset(p, 'unseal', scope), { instructionStyle: 'minimal', skillRelease: 'manual-only',
    selection: [scope.instructions.id, scope.skills[1].id] });
  assert.deepEqual(presets.compileReleasePreset(p, 'trueform', scope), { instructionStyle: 'none', skillRelease: 'manual-only',
    selection: [scope.instructions.id, scope.skills[0].id, scope.skills[1].id] });
  assert.equal(proposal.unseal.instructions, 'minimal');
});

test('external releases also retain explicit invocation and UNSEAL may use no additional instruction text', () => {
  const p = structuredClone(proposal); p.unseal.instructions = 'none'; p.trueform.automaticExternalSkillIds = [];
  assert.equal(presets.compileReleasePreset(p, 'unseal', scope).instructionStyle, 'none');
  assert.deepEqual(presets.compileReleasePreset(p, 'trueform', scope).selection, [scope.instructions.id, ...scope.skills.map(s => s.id)]);
  assert.equal(presets.compileReleasePreset(p, 'trueform', scope).skillRelease, 'manual-only');
});

test('source roles are complete explicit data; an unknown classification cannot be compiled into a release', () => {
  const unknown = structuredClone(proposal); unknown.roles[0].origin = 'unknown';
  assert.equal(presets.validatePresetProposal(unknown, scope).roles[0].origin, 'unknown');
  assert.throws(() => presets.compileReleasePreset(unknown, 'trueform', scope), { kind: 'setup-roles-unconfirmed' });
  const invalid = [
    { ...proposal, roles: proposal.roles.slice(1) },
    { ...proposal, roles: [...proposal.roles, proposal.roles[0]] },
    { ...proposal, trueform: { automaticExternalSkillIds: [scope.skills[0].id] } },
    { ...proposal, unseal: { ...proposal.unseal, automaticSkillIds: ['skill-' + id('f')] } },
    { ...proposal, scopeId: id('f') }, { ...proposal, normalId: id('f') },
    { ...proposal, paths: ['/arbitrary'] }, { ...proposal, approved: true },
  ];
  for (const value of invalid) assert.throws(() => presets.validatePresetProposal(value, scope), { kind: 'setup-proposal-invalid' });
});

test('a disabled-only control cannot be silently substituted for a requested manual control', () => {
  const limited = structuredClone(scope); limited.skills[1].availability.unseal = false;
  assert.throws(() => presets.compileReleasePreset(proposal, 'trueform', limited), { kind: 'setup-manual-control-unavailable' });
  limited.skills[1].enabled = false;
  assert.ok(presets.compileReleasePreset(proposal, 'trueform', limited).selection.includes(limited.skills[1].id));
  const absent = { ...scope, instructions: null }, p = structuredClone(proposal); p.unseal.instructions = 'none';
  assert.deepEqual(presets.compileReleasePreset(p, 'trueform', absent).selection, [scope.skills[0].id, scope.skills[1].id]);
});

test('model and official-reference provenance is bounded and cannot carry credential URLs or invented source roots', () => {
  for (const url of ['http://developers.openai.com/guide', 'https://example.com/guide', 'https://token@developers.openai.com/guide', 'https://developers.openai.com/?api_key=secret']) {
    const p = structuredClone(proposal); p.basis.references[0].url = url;
    assert.throws(() => presets.validatePresetProposal(p, scope), { kind: 'setup-proposal-invalid' });
  }
  const p = structuredClone(proposal); p.basis.modelId = '';
  assert.throws(() => presets.validatePresetProposal(p, scope), { kind: 'setup-proposal-invalid' });
  p.basis.modelId = 'gpt-6-astra'; p.basis.references[0].checkedAt = 'sometime';
  assert.throws(() => presets.validatePresetProposal(p, scope), { kind: 'setup-proposal-invalid' });
});
