import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { changeDesktopFixture, DESKTOP_CASES, snapshotDesktopFixture } from './desktop-fixture.mjs';

const ADAPTER = 'codex-owned-fixture-v1';
const SOURCES = [
  { id: 'project-instructions', path: 'AGENTS.md', kind: 'instructions', role: 'mixed-fixed-optional' },
  { id: 'fixed-override', path: 'AGENTS.override.md', kind: 'instructions', role: 'fixed-constraint' },
  { id: 'diagnostic-skill', path: '.agents/skills/unharness-desktop-fixture/SKILL.md', kind: 'skill', role: 'optional' },
  { id: 'skill-policy', path: '.agents/skills/unharness-desktop-fixture/agents/openai.yaml', kind: 'skill-metadata', role: 'optional-control' },
];
const HASH = /^[a-f0-9]{64}$/;
const LOADOUT_KEYS = ['schemaVersion', 'adapter', 'binding', 'configuration', 'configurationDigest'];
const digest = value => createHash('sha256').update(value).digest('hex');
const fail = kind => { throw Object.assign(new Error(kind), { kind }); };
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');

function normalizedConfiguration(configuration) {
  return { case: configuration.case, files: SOURCES.map((source, index) => ({ ...source, content: configuration.files[index].content })) };
}

function validateConfigurationPayload(value, keys) {
  if (!exactKeys(value, keys)
    || value.schemaVersion !== 1 || value.adapter !== ADAPTER
    || !exactKeys(value.binding, ['root', 'generation'])
    || typeof value.binding.root !== 'string' || !isAbsolute(value.binding.root) || value.binding.root.includes('\0')
    || !HASH.test(value.binding.generation)
    || !exactKeys(value.configuration, ['case', 'files']) || !DESKTOP_CASES.includes(value.configuration.case)
    || !Array.isArray(value.configuration.files) || value.configuration.files.length !== SOURCES.length) fail('loadout-invalid-snapshot');
  for (const [index, source] of SOURCES.entries()) {
    const file = value.configuration.files[index];
    if (!exactKeys(file, ['id', 'path', 'kind', 'role', 'content'])
      || !Object.keys(source).every(key => file[key] === source[key])
      || !(file.content === null || (typeof file.content === 'string' && Buffer.byteLength(file.content) <= 128 * 1024))) fail('loadout-invalid-snapshot');
  }
  if (digest(JSON.stringify(normalizedConfiguration(value.configuration))) !== value.configurationDigest) fail('loadout-invalid-snapshot');
  return value;
}

// Stable saved settings and live captures intentionally have distinct schemas.
// Preparation metadata belongs only to live captures, checkpoints and receipts.
export function validateLoadout(value) {
  return validateConfigurationPayload(value, LOADOUT_KEYS);
}

export function validateSnapshot(value) {
  validateConfigurationPayload(value, [...LOADOUT_KEYS, 'preparation']);
  if (!exactKeys(value.preparation, ['revision', 'preparedAt', 'stateDigest'])
    || !Number.isSafeInteger(value.preparation.revision) || value.preparation.revision < 0
    || typeof value.preparation.preparedAt !== 'string' || !Number.isFinite(Date.parse(value.preparation.preparedAt))
    || !HASH.test(value.preparation.stateDigest)) fail('loadout-invalid-snapshot');
  return value;
}

export function loadoutFromSnapshot(snapshot) {
  validateSnapshot(snapshot);
  const { preparation, ...loadout } = snapshot;
  return validateLoadout(structuredClone(loadout));
}

function validateTarget(value) {
  return value && Object.hasOwn(value, 'preparation') ? validateSnapshot(value) : validateLoadout(value);
}

export function scopeFromSnapshot(snapshot) {
  validateSnapshot(snapshot);
  return { schemaVersion: 1, adapter: ADAPTER, binding: { ...snapshot.binding }, sources: SOURCES.map(source => ({ ...source })) };
}

export function validateScope(scope) {
  if (!exactKeys(scope, ['schemaVersion', 'adapter', 'binding', 'sources']) || scope.schemaVersion !== 1
    || scope.adapter !== ADAPTER || !exactKeys(scope.binding, ['root', 'generation'])
    || typeof scope.binding.root !== 'string' || !isAbsolute(scope.binding.root) || scope.binding.root.includes('\0')
    || !HASH.test(scope.binding.generation) || !isDeepStrictEqual(scope.sources, SOURCES)) fail('loadout-incompatible-scope');
  return scope;
}

export function assertScopeMatches(scope, snapshot) {
  validateScope(scope);
  validateTarget(snapshot);
  if (!isDeepStrictEqual(scope.binding, snapshot.binding) || scope.adapter !== snapshot.adapter) fail('loadout-incompatible-scope');
}

export async function captureFixture(path) {
  const fixture = await snapshotDesktopFixture(path);
  if (fixture.operationLocked || fixture.state.pending || fixture.state.initializing || fixture.state.cleanup) fail('loadout-source-unready');
  const configuration = { case: fixture.state.condition,
    files: SOURCES.map(source => ({ ...source, content: fixture.files[source.path] })) };
  return validateSnapshot({ schemaVersion: 1, adapter: ADAPTER,
    binding: { root: fixture.root, generation: digest(fixture.state.seed) },
    configuration, configurationDigest: digest(JSON.stringify(configuration)),
    preparation: { revision: fixture.state.revision, preparedAt: fixture.state.preparedAt, stateDigest: digest(fixture.stateText) } });
}

export async function restoreFixture({ scope, target, expected }) {
  assertScopeMatches(scope, target);
  validateSnapshot(expected);
  assertScopeMatches(scope, expected);
  await changeDesktopFixture(scope.binding.root, target.configuration.case, {
    expectedStateDigest: expected.preparation.stateDigest,
    expectedDesiredFiles: Object.fromEntries(target.configuration.files.map(file => [file.path, file.content])),
  });
  const snapshot = await captureFixture(scope.binding.root);
  assertScopeMatches(scope, snapshot);
  if (!isDeepStrictEqual(snapshot.configuration, target.configuration)) fail('loadout-readback-conflict');
  return { snapshot, settingsPrepared: true, runtimeStateVerified: false, modeSwitchingVerified: false };
}

export function expectedFixtureMarkers(snapshot) {
  validateTarget(snapshot);
  return { fixed: 'present', procedure: snapshot.configuration.case === 'fixed-only' ? 'absent-in-record' : 'present',
    skillCatalog: snapshot.configuration.case === 'baseline' ? 'present' : 'absent-in-record', skillBody: 'absent-in-record' };
}
