import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDesktopFixture, changeDesktopFixture, readDesktopFixture } from '../src/codex/desktop-fixture.mjs';
import { captureFixture, loadoutFromSnapshot, scopeFromSnapshot, restoreFixture, validateLoadout, validateSnapshot } from '../src/codex/fixture-loadout.mjs';

async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-loadout-adapter-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  return { parent, fixture: await createDesktopFixture({ parent }) };
}

test('captures immutable source content/absence and restores exact saved fixture settings', async t => {
  const { fixture } = await setup(t);
  const baseline = await captureFixture(fixture.fixture);
  const frozen = JSON.stringify(baseline);
  const scope = scopeFromSnapshot(baseline);
  assert.equal(scope.sources.length, 4);
  assert.equal(scope.sources[0].role, 'mixed-fixed-optional');
  assert.equal(baseline.configuration.files[1].content, null);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const manual = await captureFixture(fixture.fixture);
  assert.notEqual(manual.configurationDigest, baseline.configurationDigest);
  const result = await restoreFixture({ scope, target: baseline, expected: manual });
  assert.equal(result.snapshot.configurationDigest, baseline.configurationDigest);
  assert.equal(result.runtimeStateVerified, false);
  assert.equal(JSON.stringify(baseline), frozen);
});

test('a stable loadout restores settings but cannot replace the expected live preparation', async t => {
  const { fixture } = await setup(t);
  const baseline = await captureFixture(fixture.fixture);
  const { preparation, ...target } = baseline;
  const scope = scopeFromSnapshot(baseline);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  const current = await captureFixture(fixture.fixture);
  const before = (await readDesktopFixture(fixture.fixture)).stateText;
  await assert.rejects(restoreFixture({ scope, target, expected: target }), { kind: 'loadout-invalid-snapshot' });
  assert.equal((await readDesktopFixture(fixture.fixture)).stateText, before);
  const restored = await restoreFixture({ scope, target, expected: current });
  assert.deepEqual(restored.snapshot.configuration, target.configuration);
  assert.ok(restored.snapshot.preparation.revision > preparation.revision);
  assert.equal(restored.runtimeStateVerified, false);
  assert.equal(restored.modeSwitchingVerified, false);
});

test('stable loadout validation rejects preparation metadata and altered source payloads', async t => {
  const { fixture } = await setup(t);
  const snapshot = await captureFixture(fixture.fixture);
  const loadout = loadoutFromSnapshot(snapshot);
  assert.deepEqual(loadout.configuration, snapshot.configuration);
  assert.throws(() => validateLoadout(snapshot), { kind: 'loadout-invalid-snapshot' });
  assert.throws(() => validateSnapshot(loadout), { kind: 'loadout-invalid-snapshot' });
  const malformed = [
    { ...loadout, preparation: null },
    { ...loadout, configurationDigest: '0'.repeat(64) },
    { ...loadout, binding: { ...loadout.binding, root: 'relative/path' } },
  ];
  const alteredSource = structuredClone(loadout);
  alteredSource.configuration.files[0].path = '../unowned';
  malformed.push(alteredSource);
  for (const value of malformed) assert.throws(() => validateLoadout(value), { kind: 'loadout-invalid-snapshot' });
});

test('stale captured state and independent edits block restore', async t => {
  const { fixture } = await setup(t);
  const baseline = await captureFixture(fixture.fixture), scope = scopeFromSnapshot(baseline);
  await changeDesktopFixture(fixture.fixture, 'manual-only');
  await assert.rejects(restoreFixture({ scope, target: baseline, expected: baseline }), { kind: 'fixture-changed' });
  const manual = await captureFixture(fixture.fixture);
  const path = join(fixture.project, 'AGENTS.md');
  await writeFile(path, 'independent edit');
  await assert.rejects(restoreFixture({ scope, target: baseline, expected: manual }), { kind: 'fixture-conflict' });
  assert.equal(await readFile(path, 'utf8'), 'independent edit');
});

test('a different fixture generation cannot inherit a registered scope', async t => {
  const { parent, fixture } = await setup(t);
  const a = await captureFixture(fixture.fixture);
  const other = await createDesktopFixture({ parent });
  const b = await captureFixture(other.fixture);
  await assert.rejects(restoreFixture({ scope: scopeFromSnapshot(a), target: a, expected: b }), { kind: 'loadout-incompatible-scope' });
});

test('a self-consistent older or modified payload is rejected before even a same-case restore writes', async t => {
  const { fixture } = await setup(t);
  const original = await captureFixture(fixture.fixture);
  const target = structuredClone(original);
  target.configuration.files[0].content += '\nChanged historical format\n';
  target.configurationDigest = createHash('sha256').update(JSON.stringify(target.configuration)).digest('hex');
  const before = (await readDesktopFixture(fixture.fixture)).stateText;
  await assert.rejects(restoreFixture({ scope: scopeFromSnapshot(original), target, expected: original }), { kind: 'fixture-incompatible-snapshot' });
  await assert.rejects(restoreFixture({ scope: scopeFromSnapshot(original), target: loadoutFromSnapshot(target), expected: original }), { kind: 'fixture-incompatible-snapshot' });
  assert.equal((await readDesktopFixture(fixture.fixture)).stateText, before);
});
