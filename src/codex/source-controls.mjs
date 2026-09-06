import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import { arch, platform, tmpdir } from 'node:os';
import { join } from 'node:path';

import { readPromptInput } from './prompt-input.mjs';
import { readVersion } from './probe.mjs';

const CASE_KEYS = ['baseline', 'manualOnly', 'disabledFile', 'disabledDirectory', 'fixedOnly', 'restored'];
const MARKER_KEYS = ['fixed', 'procedure', 'skillCatalog', 'skillBody', 'userPrompt'];
const PROMPT_ERROR_KINDS = new Set([
  'spawn-error',
  'process-exit',
  'timeout',
  'response-too-large',
  'invalid-response',
]);

function safePromptError(error) {
  return { kind: PROMPT_ERROR_KINDS.has(error?.kind) ? error.kind : 'unknown-error' };
}

function makeMarkers() {
  const nonce = randomBytes(16).toString('hex').toUpperCase();
  return {
    fixed: `FIXED_REQUIREMENT_${nonce}`,
    procedure: `OPTIONAL_PROCEDURE_${nonce}`,
    skillCatalog: `SKILL_CATALOG_${nonce}`,
    skillBody: `SKILL_BODY_${nonce}`,
    userPrompt: `LITERAL_USER_PROMPT_${nonce}`,
  };
}

function baseReport(codexCli) {
  return {
    schemaVersion: 1,
    probeVersion: '0.0.1',
    kind: 'codex-fixture-source-controls',
    observedAt: new Date().toISOString(),
    codexCli,
    environment: {
      platform: platform(),
      architecture: arch(),
      nodeVersion: process.versions.node,
    },
    surface: 'cli-debug-prompt-input',
    desktopSessionAttached: false,
    runtimeStateVerified: false,
    modeSwitchingVerified: false,
    modelWorkRequested: false,
    sourceCoverage: 'fixture-only',
    hooksAndMemoriesDisabledForAllCases: true,
    configurationWriteScope: 'owned-temporary-fixture',
    cases: Object.fromEntries(CASE_KEYS.map((key) => [key, { status: 'not-run' }])),
    fixtureCleanup: 'not-created',
    checks: {
      baselineVisible: null,
      manualCatalogOmitted: null,
      fileDisableEffective: null,
      directoryDisableEffective: null,
      fixedConstraintPreserved: null,
      restored: null,
    },
  };
}

function hasMarkers(value, expected) {
  return value?.status === 'ok'
    && MARKER_KEYS.every((key) => value.markers[key] === expected[key]);
}

function updateChecks(report) {
  report.checks.baselineVisible = checkCase(report.cases.baseline, {
    fixed: true, procedure: true, skillCatalog: true, skillBody: false, userPrompt: true,
  });
  report.checks.manualCatalogOmitted = checkCase(report.cases.manualOnly, {
    fixed: true, procedure: true, skillCatalog: false, skillBody: false, userPrompt: true,
  });
  report.checks.fileDisableEffective = checkCase(report.cases.disabledFile, {
    fixed: true, procedure: true, skillCatalog: false, skillBody: false, userPrompt: true,
  });
  report.checks.directoryDisableEffective = checkCase(report.cases.disabledDirectory, {
    fixed: true, procedure: true, skillCatalog: false, skillBody: false, userPrompt: true,
  });
  report.checks.fixedConstraintPreserved = checkCase(report.cases.fixedOnly, {
    fixed: true, procedure: false, skillCatalog: false, skillBody: false, userPrompt: true,
  });
  report.checks.restored = checkCase(report.cases.restored, {
    fixed: true, procedure: true, skillCatalog: true, skillBody: false, userPrompt: true,
  });
}

function checkCase(value, expected) {
  if (value?.status !== 'ok') return null;
  return hasMarkers(value, expected);
}

function tomlDisabledConfig(path) {
  return `skills.config=[{path=${JSON.stringify(path)},enabled=false}]`;
}

async function writeFixture(root, markers) {
  const skillDirectory = join(root, '.agents', 'skills', 'unharness-source-probe');
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(join(root, 'AGENTS.md'), [
    '# Synthetic source-control fixture',
    `Fixed requirement: ${markers.fixed}`,
    `Optional procedure: ${markers.procedure}`,
    '',
  ].join('\n'), 'utf8');
  await writeFile(join(skillDirectory, 'SKILL.md'), [
    '---',
    'name: unharness-source-probe',
    `description: Synthetic catalog evidence ${markers.skillCatalog}`,
    '---',
    '',
    '# Synthetic source probe',
    '',
    `Body-only evidence ${markers.skillBody}`,
    '',
  ].join('\n'), 'utf8');
  return {
    skillDirectory,
    skillPath: join(skillDirectory, 'SKILL.md'),
    yamlDirectory: join(skillDirectory, 'agents'),
    yamlPath: join(skillDirectory, 'agents', 'openai.yaml'),
    overridePath: join(root, 'AGENTS.override.md'),
  };
}

async function runCase(report, key, options, fixture) {
  try {
    const markers = await readPromptInput({
      executable: options.executable,
      executableArgs: options.executableArgs,
      cwd: fixture.root,
      timeoutMs: options.timeoutMs,
      markers: fixture.markers,
      configOverride: options.configOverride,
    });
    report.cases[key] = { status: 'ok', markers };
    return true;
  } catch (error) {
    report.cases[key] = { status: 'error', error: safePromptError(error) };
    return false;
  }
}

export async function collectSourceControlProbe({
  executable = 'codex',
  executableArgs = [],
  timeoutMs = 10000,
  tempRoot = tmpdir(),
} = {}) {
  const codexCli = await readVersion({ executable, executableArgs, cwd: tempRoot, timeoutMs });
  const report = baseReport(codexCli);
  const markers = makeMarkers();
  let ownedRoot;
  let fixtureReady = false;

  try {
    try {
      ownedRoot = await mkdtemp(join(tempRoot, 'unharness-source-controls-'));
      ownedRoot = await realpath(ownedRoot);
      report.fixtureCleanup = 'ok';
      const paths = await writeFixture(ownedRoot, markers);
      fixtureReady = true;
      const fixture = { root: ownedRoot, markers, ...paths };

      if (!await runCase(report, 'baseline', { executable, executableArgs, timeoutMs }, fixture)) return report;

      await mkdir(paths.yamlDirectory, { recursive: true });
      await writeFile(paths.yamlPath, 'policy:\n  allow_implicit_invocation: false\n', 'utf8');
      if (!await runCase(report, 'manualOnly', { executable, executableArgs, timeoutMs }, fixture)) return report;

      await unlink(paths.yamlPath);
      if (!await runCase(report, 'disabledFile', {
        executable,
        executableArgs,
        timeoutMs,
        configOverride: tomlDisabledConfig(paths.skillPath),
      }, fixture)) return report;

      if (!await runCase(report, 'disabledDirectory', {
        executable,
        executableArgs,
        timeoutMs,
        configOverride: tomlDisabledConfig(paths.skillDirectory),
      }, fixture)) return report;

      await writeFile(paths.overridePath, `${markers.fixed}\n`, 'utf8');
      if (!await runCase(report, 'fixedOnly', {
        executable,
        executableArgs,
        timeoutMs,
        configOverride: tomlDisabledConfig(paths.skillPath),
      }, fixture)) return report;

      await unlink(paths.overridePath);
      await runCase(report, 'restored', { executable, executableArgs, timeoutMs }, fixture);
    } catch {
      if (!fixtureReady) {
        report.fixtureSetupError = { kind: 'fixture-setup-error' };
      } else {
        const firstNotRun = CASE_KEYS.find((key) => report.cases[key].status === 'not-run');
        if (firstNotRun) {
          report.cases[firstNotRun] = { status: 'error', error: { kind: 'fixture-setup-error' } };
        } else {
          report.fixtureSetupError = { kind: 'fixture-setup-error' };
        }
      }
    }
  } finally {
    if (ownedRoot) {
      try {
        await rm(ownedRoot, { recursive: true });
        report.fixtureCleanup = 'ok';
      } catch {
        report.fixtureCleanup = 'error';
        report.fixtureCleanupError = { kind: 'fixture-cleanup-error' };
      }
    }
    updateChecks(report);
  }

  return report;
}

export function sourceControlProbeSucceeded(report) {
  const hasExactKeys = (value, keys) => value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
  const casesAreComplete = hasExactKeys(report?.cases, CASE_KEYS)
    && CASE_KEYS.every((key) => report.cases[key]?.status === 'ok'
      && hasExactKeys(report.cases[key].markers, MARKER_KEYS)
      && MARKER_KEYS.every((marker) => typeof report.cases[key].markers[marker] === 'boolean'));
  const checksAreComplete = hasExactKeys(report?.checks, [
    'baselineVisible',
    'manualCatalogOmitted',
    'fileDisableEffective',
    'directoryDisableEffective',
    'fixedConstraintPreserved',
    'restored',
  ]);
  const boundariesMatch = report?.schemaVersion === 1
    && report?.probeVersion === '0.0.1'
    && report?.kind === 'codex-fixture-source-controls'
    && typeof report?.observedAt === 'string'
    && !Number.isNaN(Date.parse(report.observedAt))
    && typeof report?.environment?.platform === 'string'
    && typeof report?.environment?.architecture === 'string'
    && typeof report?.environment?.nodeVersion === 'string'
    && report?.surface === 'cli-debug-prompt-input'
    && report?.desktopSessionAttached === false
    && report?.runtimeStateVerified === false
    && report?.modeSwitchingVerified === false
    && report?.modelWorkRequested === false
    && report?.sourceCoverage === 'fixture-only'
    && report?.hooksAndMemoriesDisabledForAllCases === true
    && report?.configurationWriteScope === 'owned-temporary-fixture';
  return boundariesMatch
    && report?.codexCli?.status === 'ok'
    && typeof report?.codexCli?.version === 'string'
    && report?.fixtureCleanup === 'ok'
    && casesAreComplete
    && checksAreComplete
    && report?.checks?.baselineVisible === true
    && report?.checks?.manualCatalogOmitted === true
    && report?.checks?.fileDisableEffective === true
    && typeof report?.checks?.directoryDisableEffective === 'boolean'
    && report?.checks?.fixedConstraintPreserved === true
    && report?.checks?.restored === true;
}
