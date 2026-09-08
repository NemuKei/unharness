import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const preflight = await import('../src/codex/replay-conditions.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const originalProject = resolve('/synthetic/source'), derivedProject = resolve('/synthetic/replay');
const skillPath = '.agents/skills/optional/SKILL.md';
function report(project) {
  const config = { approval_policy: 'never', sandbox_mode: 'read-only', model: 'gpt-5', model_reasoning_effort: 'high',
    memories: { use_memories: true }, projects: { [originalProject]: { trust_level: 'trusted' } }, skills: null };
  return { kind: 'unharness-replay-conditions', schemaVersion: 1, version: '0.153.4',
    context: { codexHome: resolve('/synthetic/profile'), project, executable: 'codex' },
    observedAt: '2026-09-09T00:00:00.000Z', config,
    layers: [{ name: { type: 'project', dotCodexFolder: join(project, '.codex') }, version: 'sha256:fixture', config: { model_reasoning_effort: 'high' } },
      { name: { type: 'user', file: resolve('/synthetic/profile/config.toml'), profile: null }, version: 'sha256:global', config: { projects: config.projects } }],
    skills: [{ name: 'optional', description: 'Synthetic Skill', path: join(project, skillPath), enabled: true, scope: 'repo', pluginId: null },
      { name: 'retained', description: 'Retained Skill', path: resolve('/synthetic/profile/skills/retained/SKILL.md'), enabled: false, scope: 'user', pluginId: null }],
    hooks: [], requirements: { requirements: null } };
}
function mapping(expected = 'automatic-catalog') {
  return { sourceId: 'skill-' + 'a'.repeat(64), sourcePath: join(originalProject, skillPath), path: join(derivedProject, skillPath),
    expected, strategy: expected === 'disabled' ? 'omit-entrypoints' : 'copy-entrypoints' };
}
function compare(original, derived, expected = 'automatic-catalog') {
  assert.equal(typeof preflight.compareReplayConditions, 'function');
  const sourceMappings = [mapping(expected)];
  return preflight.compareReplayConditions({ original, derived, sourceMappings,
    expectedSources: [{ sourceId: sourceMappings[0].sourceId, category: 'skill', path: sourceMappings[0].sourcePath, name: 'optional', expected }] });
}
test('retained conditions match across a relocated repo Skill while the global trust registry stays literal', () => {
  const result = compare(report(originalProject), report(derivedProject));
  assert.equal(result.status, 'matched');
  assert.equal(result.desktopRuntimeVerified, false);
  assert.equal(result.mappedSkills, 1);
  assert.equal(typeof result.retainedConditionsDigest, 'string');
  assert.equal(JSON.stringify(result).includes('/synthetic'), false);
});
test('disabled registered entrypoints qualify only when the original is disabled and the derived catalog omits them', () => {
  const original = report(originalProject), derived = report(derivedProject); original.skills[0].enabled = false;
  derived.skills.shift();
  assert.equal(compare(original, derived, 'disabled').status, 'matched');
  const reenabled = report(derivedProject);
  assert.throws(() => compare(original, reenabled, 'disabled'), { kind: 'replay-source-state-unavailable' });
  original.skills[0].enabled = true;
  assert.throws(() => compare(original, derived, 'disabled'), { kind: 'replay-source-state-unavailable' });
});
test('changed execution permission, memory, retained selector or non-path command cannot be normalized away', () => {
  for (const mutate of [d => { d.config.sandbox_mode = 'workspace-write'; }, d => { d.config.memories.use_memories = false; },
    d => { d.skills[1].enabled = true; }, d => { d.config.notify = ['run', join(derivedProject, 'notify')]; }]) {
    const original = report(originalProject), derived = report(derivedProject); mutate(derived);
    assert.throws(() => compare(original, derived), { kind: 'replay-retained-conditions-changed' });
  }
});
test('a disabled project layer and relocated ancestor source prevent a ready handoff', () => {
  const derived = report(derivedProject); derived.layers[0].disabledReason = 'Untrusted project';
  assert.throws(() => compare(report(originalProject), derived), { kind: 'replay-native-conditions-unavailable' });
  const original = report(originalProject); original.skills[0].path = resolve('/synthetic/ancestor/SKILL.md');
  assert.throws(() => compare(original, report(derivedProject)), { kind: 'replay-source-unmapped' });
});
test('version changes, changed requirements and missing registered source evidence are unavailable', () => {
  const version = report(derivedProject); version.version = '0.154.0';
  assert.throws(() => compare(report(originalProject), version), { kind: 'replay-native-conditions-unavailable' });
  const requirements = report(derivedProject); requirements.requirements = { requirements: { allowedApprovalPolicies: ['on-request'] } };
  assert.throws(() => compare(report(originalProject), requirements), { kind: 'replay-retained-conditions-changed' });
  const missing = report(originalProject); missing.skills.shift();
  assert.throws(() => compare(missing, report(derivedProject)), { kind: 'replay-source-state-unavailable' });
});
async function fixture(t, overrides = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-native-conditions-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project'), codexHome = join(parent, 'profile');
  await mkdir(project); await mkdir(codexHome);
  const native = report(project);
  native.context = { project, codexHome, executable: resolve('test-support/replay-conditions-server.mjs') };
  native.layers[1].name.file = join(codexHome, 'config.toml');
  await writeFile(join(codexHome, 'replay-native.json'), JSON.stringify({ native, ...overrides }));
  return native.context;
}
test('native reader uses only read methods, verifies both config reads, and projects request-scoped catalogs', async t => {
  assert.equal(typeof preflight.readReplayConditions, 'function');
  const context = await fixture(t);
  const value = await preflight.readReplayConditions(context);
  assert.equal(value.version, '0.153.4');
  assert.deepEqual(value.context, context);
  assert.equal(value.config.memories.use_memories, true);
  assert.equal(value.hooks.length, 0);
});
test('native reader rejects concurrent configuration edits, catalog errors, missing policy and unsupported versions without leaking raw values', async t => {
  assert.equal(typeof preflight.readReplayConditions, 'function');
  for (const override of [{ changeAfterRead: true }, { skillErrors: ['PRIVATE_DIAGNOSTIC'] }, { omitPolicy: true }, { version: '0.154.0' }]) {
    const context = await fixture(t, override);
    await assert.rejects(preflight.readReplayConditions(context), e => e.kind === 'replay-native-conditions-unavailable' && !String(e).includes('PRIVATE'));
  }
});
