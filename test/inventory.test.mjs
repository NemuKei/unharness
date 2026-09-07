import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { inspectInstructionCandidates, collectSourceInventory } from '../src/codex/inventory.mjs';
import { collectProbe } from '../src/codex/probe.mjs';
import { SUBPROCESS_TIMEOUT_MS } from '../test-support/process-timeouts.mjs';
import { main } from '../bin/unharness.mjs';
import { createGuiInventory } from '../src/gui/inventory.mjs';

async function workspace(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-inventory-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const project = join(parent, 'project');
  const codexHome = join(parent, 'profile');
  await mkdir(project);
  await mkdir(codexHome);
  return { parent, project, codexHome };
}

test('instruction census preserves both candidates and never promotes existence into loaded or removable state', async t => {
  const { project, codexHome } = await workspace(t);
  const child = join(project, 'child');
  await mkdir(join(project, '.git'));
  await mkdir(child);
  await writeFile(join(codexHome, 'AGENTS.override.md'), 'GLOBAL_PRIVATE keep permissions\n');
  await writeFile(join(codexHome, 'AGENTS.md'), 'HIDDEN_PRIVATE optional procedures\n');
  await writeFile(join(project, 'AGENTS.md'), 'PROJECT_PRIVATE run an arbitrary command\n');
  await writeFile(join(child, 'AGENTS.override.md'), '   \n');
  const report = await inspectInstructionCandidates({ cwd: child, codexHome });
  assert.equal(report.status, 'ok');
  assert.equal(report.boundary, 'git-root');
  assert.equal(report.coverage, 'standard-candidates-only');
  assert.equal(report.loadedState, 'unknown');
  assert.equal(report.classification, 'not-reviewed');
  assert.deepEqual(report.files.map(({ scope, depth, name, state }) => [scope, depth, name, state]), [
    ['user', 0, 'AGENTS.override.md', 'present'],
    ['user', 0, 'AGENTS.md', 'present'],
    ['project', 0, 'AGENTS.override.md', 'absent'],
    ['project', 0, 'AGENTS.md', 'present'],
    ['project', 1, 'AGENTS.override.md', 'empty'],
    ['project', 1, 'AGENTS.md', 'absent'],
  ]);
  assert.match(report.files[0].digest, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(join(project, 'AGENTS.md'), 'utf8'), 'PROJECT_PRIVATE run an arbitrary command\n');
  assert.doesNotMatch(JSON.stringify(report), /GLOBAL_PRIVATE|HIDDEN_PRIVATE|PROJECT_PRIVATE|keep permissions|arbitrary command/);
  assert.ok(!JSON.stringify(report).includes(project));
  assert.ok(!JSON.stringify(report).includes(codexHome));
});

test('without a Git root instruction candidates are limited to the selected directory', async t => {
  const { parent, project, codexHome } = await workspace(t);
  await writeFile(join(parent, 'AGENTS.md'), 'OUTSIDE_SCOPE_PRIVATE');
  await writeFile(join(project, 'AGENTS.md'), 'inside');
  const report = await inspectInstructionCandidates({ cwd: project, codexHome });
  assert.equal(report.boundary, 'cwd-only');
  assert.equal(report.files.filter(item => item.scope === 'project').length, 2);
  assert.equal(report.files.filter(item => item.state === 'present').length, 1);
});

test('linked, oversized, and non-file instruction candidates are unresolved and never read as text', async t => {
  const { parent, project, codexHome } = await workspace(t);
  const target = join(parent, 'private-source');
  await writeFile(target, 'LINKED_PRIVATE_TEXT');
  // A directory link can be created without file-symlink privileges on native Windows.
  const linkedDirectory = join(parent, 'linked-source');
  await mkdir(linkedDirectory);
  await symlink(linkedDirectory, join(codexHome, 'AGENTS.md'), process.platform === 'win32' ? 'junction' : 'dir');
  await writeFile(join(project, 'AGENTS.md'), 'x'.repeat(1024 * 1024 + 1));
  await mkdir(join(project, 'AGENTS.override.md'));
  const report = await inspectInstructionCandidates({ cwd: project, codexHome });
  assert.equal(report.status, 'partial');
  assert.equal(report.files.find(item => item.scope === 'user' && item.name === 'AGENTS.md').state, 'link');
  assert.equal(report.files.find(item => item.scope === 'project' && item.name === 'AGENTS.md').state, 'too-large');
  assert.equal(report.files.find(item => item.scope === 'project' && item.name === 'AGENTS.override.md').state, 'not-file');
  assert.ok(report.files.every(item => item.digest === undefined));
  assert.equal(await readFile(target, 'utf8'), 'LINKED_PRIVATE_TEXT');
  assert.doesNotMatch(JSON.stringify(report), /LINKED_PRIVATE_TEXT/);
});

test('combined inventory keeps failed queries unknown while retaining independent instruction evidence', async t => {
  const { project, codexHome } = await workspace(t);
  await writeFile(join(project, 'AGENTS.md'), 'PRIVATE_MIXED_REQUIRED_AND_OPTIONAL');
  const report = await collectSourceInventory({ cwd: project }, {
    probe: options => collectProbe({
      ...options, executable: process.execPath,
      executableArgs: [resolve('test/fixtures/codex-server.mjs'), '--scenario', 'strict-partial', '--expected-cwd', project],
      timeoutMs: SUBPROCESS_TIMEOUT_MS,
    }),
    instructions: options => inspectInstructionCandidates({ ...options, codexHome }),
  });
  assert.equal(report.kind, 'codex-source-inventory');
  assert.equal(report.probe.queries.hooks.status, 'error');
  assert.equal(report.probe.queries.hooks.summary, undefined);
  assert.equal(report.instructions.files.filter(item => item.state === 'present').length, 1);
  assert.deepEqual(report.management, {
    personalSourcesRegistered: false, classification: 'not-reviewed',
    control: 'unverified', runtimeStateVerified: false, modeSwitchingVerified: false,
  });
  assert.doesNotMatch(JSON.stringify(report), /SECRET_MARKER|PRIVATE_MIXED/);
});

test('the source inventory CLI exposes the same read-only report and fails visibly on partial collection', async t => {
  const { project, codexHome } = await workspace(t);
  await writeFile(join(project, 'AGENTS.md'), 'CLI_PRIVATE_BODY');
  for (const [scenario, expectedExit] of [['strict-ok', 0], ['strict-partial', 1]]) {
    let stdout = '', stderr = '';
    const result = await main(['inspect-sources', '--cwd', project, '--codex', process.execPath], {
      stdout: { write(value) { stdout += value; } }, stderr: { write(value) { stderr += value; } },
      collectSources: options => collectSourceInventory(options, {
        probe: args => collectProbe({ ...args, executableArgs: [resolve('test/fixtures/codex-server.mjs'),
          '--scenario', scenario, '--expected-cwd', project], timeoutMs: SUBPROCESS_TIMEOUT_MS }),
        instructions: args => inspectInstructionCandidates({ ...args, codexHome }),
      }),
    });
    assert.equal(result, expectedExit, stderr);
    assert.equal(JSON.parse(stdout).kind, 'codex-source-inventory');
    assert.equal(JSON.parse(stdout).instructions.loadedState, 'unknown');
    assert.doesNotMatch(stdout, /CLI_PRIVATE_BODY|SECRET_MARKER/);
  }
});

test('replacing the selected directory invalidates inventory before launching the reader', async t => {
  const { parent, project } = await workspace(t);
  let reads = 0;
  const reader = await createGuiInventory({ cwd: project }, { collect: async () => { reads += 1; return null; } });
  const nextLaunch = await createGuiInventory({ cwd: project });
  assert.notEqual(nextLaunch.state().launchId, reader.state().launchId);
  await rename(project, join(parent, 'previous-project'));
  await mkdir(project);
  await assert.rejects(reader.inspect(), { kind: 'gui-inventory-target-changed' });
  assert.equal(reads, 0);
  assert.equal(reader.state().report, null);
});

test('concurrent inventory requests share a collection, while a later explicit read collects again', async t => {
  const { project } = await workspace(t);
  let finish;
  let began;
  let reads = 0;
  const started = new Promise(resolveStarted => { began = resolveStarted; });
  const gate = new Promise(resolveFinished => { finish = resolveFinished; });
  t.after(() => finish());
  const reader = await createGuiInventory({ cwd: project }, { collect: async () => {
    reads += 1;
    began();
    await gate;
    return { observation: reads };
  } });
  const first = reader.inspect();
  await started;
  const second = reader.inspect();
  finish();
  const results = await Promise.all([first, second]);
  assert.equal(reads, 1);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await reader.inspect()).report.observation, 2);
});

test('relative CLI context names refer to the same absolute project in both readers', async t => {
  const { project, codexHome } = await workspace(t);
  await writeFile(join(project, 'AGENTS.md'), 'RELATIVE_PRIVATE_SOURCE');
  const report = await collectSourceInventory({ cwd: relative(process.cwd(), project) }, {
    probe: options => collectProbe({ ...options, executable: process.execPath,
      executableArgs: [resolve('test/fixtures/codex-server.mjs'), '--scenario', 'strict-ok', '--expected-cwd', project],
      timeoutMs: SUBPROCESS_TIMEOUT_MS,
    }),
    instructions: options => inspectInstructionCandidates({ ...options, codexHome }),
  });
  assert.equal(report.probe.queries.config.status, 'ok');
  assert.equal(report.probe.queries.skills.status, 'ok');
  assert.equal(report.instructions.files.filter(file => file.state === 'present').length, 1);
});
