import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectSourceControlProbe,
  sourceControlProbeSucceeded,
} from '../src/codex/source-controls.mjs';
import { SUBPROCESS_TIMEOUT_MS } from '../test-support/process-timeouts.mjs';

const fixture = fileURLToPath(new URL('./fixtures/source-controls-cli.mjs', import.meta.url));

async function withTempRoot(t, label) {
  const root = await mkdtemp(join(tmpdir(), label));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sentinel = join(root, 'pre-existing.bin');
  await writeFile(sentinel, Buffer.from([0, 17, 34, 255]));
  return { root, sentinel };
}

test('runs the six file-derived cases and removes only its owned fixture', async (t) => {
  const { root, sentinel } = await withTempRoot(t, 'source controls space 日本語 ');
  const report = await collectSourceControlProbe({
    executable: process.execPath,
    executableArgs: [fixture],
    timeoutMs: SUBPROCESS_TIMEOUT_MS,
    tempRoot: root,
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.probeVersion, '0.0.1');
  assert.equal(report.kind, 'codex-fixture-source-controls');
  assert.match(report.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(report.codexCli, { status: 'ok', version: '0.200.1' });
  assert.equal(report.surface, 'cli-debug-prompt-input');
  assert.equal(report.desktopSessionAttached, false);
  assert.equal(report.runtimeStateVerified, false);
  assert.equal(report.modeSwitchingVerified, false);
  assert.equal(report.modelWorkRequested, false);
  assert.equal(report.sourceCoverage, 'fixture-only');
  assert.equal(report.hooksAndMemoriesDisabledForAllCases, true);
  assert.equal(report.configurationWriteScope, 'owned-temporary-fixture');
  assert.deepEqual(report.checks, {
    baselineVisible: true,
    manualCatalogOmitted: true,
    fileDisableEffective: true,
    directoryDisableEffective: false,
    fixedConstraintPreserved: true,
    restored: true,
  });
  assert.deepEqual(Object.fromEntries(Object.entries(report.cases).map(([key, value]) => [key, value.status])), {
    baseline: 'ok',
    manualOnly: 'ok',
    disabledFile: 'ok',
    disabledDirectory: 'ok',
    fixedOnly: 'ok',
    restored: 'ok',
  });
  assert.deepEqual(report.cases.fixedOnly.markers, {
    fixed: true,
    procedure: false,
    skillCatalog: false,
    skillBody: false,
    userPrompt: true,
  });
  assert.equal(report.fixtureCleanup, 'ok');
  assert.equal(sourceControlProbeSucceeded(report), true);
  assert.deepEqual(await readFile(sentinel), Buffer.from([0, 17, 34, 255]));
  assert.deepEqual(await readdir(root), ['pre-existing.bin']);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(root), false);
  assert.equal(serialized.includes('PRIVATE_'), false);
  assert.equal(serialized.includes('FIXED_REQUIREMENT_'), false);
});

test('stops after a command error, marks later cases not-run, and still cleans up', async (t) => {
  const { root, sentinel } = await withTempRoot(t, 'source controls failure ');
  const report = await collectSourceControlProbe({
    executable: process.execPath,
    executableArgs: [fixture, '--fail-manual', 'true'],
    timeoutMs: SUBPROCESS_TIMEOUT_MS,
    tempRoot: root,
  });

  assert.equal(report.cases.baseline.status, 'ok');
  assert.deepEqual(report.cases.manualOnly, { status: 'error', error: { kind: 'process-exit' } });
  assert.deepEqual(report.cases.disabledFile, { status: 'not-run' });
  assert.deepEqual(report.cases.disabledDirectory, { status: 'not-run' });
  assert.deepEqual(report.cases.fixedOnly, { status: 'not-run' });
  assert.deepEqual(report.cases.restored, { status: 'not-run' });
  assert.equal(report.checks.baselineVisible, true);
  assert.equal(report.checks.manualCatalogOmitted, null);
  assert.equal(report.fixtureCleanup, 'ok');
  assert.equal(sourceControlProbeSucceeded(report), false);
  assert.deepEqual(await readFile(sentinel), Buffer.from([0, 17, 34, 255]));
  assert.deepEqual(await readdir(root), ['pre-existing.bin']);
});

test('treats a malformed mid-matrix response as an error and removes its fixture', async (t) => {
  const { root, sentinel } = await withTempRoot(t, 'source controls malformed ');
  const report = await collectSourceControlProbe({
    executable: process.execPath,
    executableArgs: [fixture, '--malformed-manual', 'true'],
    timeoutMs: SUBPROCESS_TIMEOUT_MS,
    tempRoot: root,
  });

  assert.deepEqual(report.cases.manualOnly, { status: 'error', error: { kind: 'invalid-response' } });
  assert.deepEqual(report.cases.disabledFile, { status: 'not-run' });
  assert.equal(report.fixtureCleanup, 'ok');
  assert.deepEqual(await readFile(sentinel), Buffer.from([0, 17, 34, 255]));
  assert.deepEqual(await readdir(root), ['pre-existing.bin']);
});

test('unexpected observations finish the matrix but fail the affected checks', async (t) => {
  const { root } = await withTempRoot(t, 'source controls observation ');
  const report = await collectSourceControlProbe({
    executable: process.execPath,
    executableArgs: [fixture, '--drop-procedure', 'true'],
    timeoutMs: SUBPROCESS_TIMEOUT_MS,
    tempRoot: root,
  });

  assert.equal(Object.values(report.cases).every((value) => value.status === 'ok'), true);
  assert.equal(report.checks.baselineVisible, false);
  assert.equal(report.checks.manualCatalogOmitted, false);
  assert.equal(report.checks.fileDisableEffective, false);
  assert.equal(report.checks.fixedConstraintPreserved, true);
  assert.equal(report.checks.restored, false);
  assert.equal(sourceControlProbeSucceeded(report), false);
});

test('reports setup failure safely when no fixture was created', async (t) => {
  const { root } = await withTempRoot(t, 'source controls setup ');
  const missing = join(root, 'does-not-exist', 'nested');
  const report = await collectSourceControlProbe({
    executable: process.execPath,
    executableArgs: [fixture],
    timeoutMs: SUBPROCESS_TIMEOUT_MS,
    tempRoot: missing,
  });

  assert.deepEqual(report.fixtureSetupError, { kind: 'fixture-setup-error' });
  assert.equal(report.fixtureCleanup, 'not-created');
  assert.equal(Object.values(report.cases).every((value) => value.status === 'not-run'), true);
  assert.equal(Object.values(report.checks).every((value) => value === null), true);
  assert.equal(JSON.stringify(report).includes(missing), false);
  assert.equal(sourceControlProbeSucceeded(report), false);
});

test('success predicate enforces the fixed public evidence boundaries', () => {
  const markerResult = {
    fixed: true,
    procedure: true,
    skillCatalog: false,
    skillBody: false,
    userPrompt: true,
  };
  const report = {
    schemaVersion: 1,
    probeVersion: '0.0.1',
    kind: 'codex-fixture-source-controls',
    observedAt: '2026-09-06T00:00:00.000Z',
    codexCli: { status: 'ok', version: '1.2.3' },
    environment: { platform: 'synthetic', architecture: 'test', nodeVersion: '24.19.0' },
    surface: 'cli-debug-prompt-input',
    desktopSessionAttached: false,
    runtimeStateVerified: false,
    modeSwitchingVerified: false,
    modelWorkRequested: false,
    sourceCoverage: 'fixture-only',
    hooksAndMemoriesDisabledForAllCases: true,
    configurationWriteScope: 'owned-temporary-fixture',
    fixtureCleanup: 'ok',
    cases: Object.fromEntries(['baseline', 'manualOnly', 'disabledFile', 'disabledDirectory', 'fixedOnly', 'restored'].map((key) => [key, { status: 'ok', markers: markerResult }])),
    checks: {
      baselineVisible: true,
      manualCatalogOmitted: true,
      fileDisableEffective: true,
      directoryDisableEffective: false,
      fixedConstraintPreserved: true,
      restored: true,
    },
  };

  assert.equal(sourceControlProbeSucceeded(report), true);
  assert.equal(sourceControlProbeSucceeded({ ...report, desktopSessionAttached: true }), false);
  assert.equal(sourceControlProbeSucceeded({ ...report, cases: { ...report.cases, restored: { status: 'error' } } }), false);
  assert.equal(sourceControlProbeSucceeded({ ...report, checks: { ...report.checks, fileDisableEffective: false } }), false);
  assert.equal(sourceControlProbeSucceeded({ ...report, environment: undefined }), false);
  assert.equal(sourceControlProbeSucceeded({ ...report, cases: { ...report.cases, extra: { status: 'ok', markers: markerResult } } }), false);
  assert.equal(sourceControlProbeSucceeded({
    ...report,
    cases: { ...report.cases, baseline: { status: 'ok', markers: { ...markerResult, userPrompt: 'yes' } } },
  }), false);
});
