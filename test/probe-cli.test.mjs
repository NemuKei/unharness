import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { main } from '../bin/unharness.mjs';
import { collectProbe, probeSucceeded } from '../src/codex/probe.mjs';

const fixture = fileURLToPath(new URL('./fixtures/codex-server.mjs', import.meta.url));
const SECRET = 'SECRET_MARKER';

function capture() {
  const stream = new PassThrough();
  let text = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => { text += chunk; });
  return { stream, value: () => text };
}

test('collects a complete sanitized report with fixed evidence limits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'probe space 日本語 '));
  const cwd = join(root, 'work dir 日本語');
  await mkdir(cwd);
  const report = await collectProbe({ executable: process.execPath, executableArgs: [fixture, '--scenario', 'strict-ok', '--expected-cwd', cwd], cwd, timeoutMs: 1000 });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.probeVersion, '0.0.1');
  assert.equal(report.kind, 'codex-read-only-inventory');
  assert.match(report.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(report.codexCli, { status: 'ok', version: '0.153.4' });
  assert.deepEqual(report.connection, {
    surface: 'standalone-app-server',
    desktopSessionAttached: false,
    runtimeStateVerified: false,
    initialized: true,
  });
  assert.equal(report.sourceCoverage, 'unknown');
  assert.equal(report.modeSwitchingVerified, false);
  assert.equal(report.queries.config.status, 'ok');
  assert.equal(report.queries.skills.summary.total, 2);
  assert.equal(report.queries.hooks.summary.total, 1);
  assert.equal(report.queries.requirements.summary.present, true);
  assert.equal(probeSucceeded(report), true);
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes('/private/'), false);
  assert.equal(serialized.includes(cwd), false);
  await rm(root, { recursive: true, force: true });
});

test('returns safe partial results and preserves failures as errors', async () => {
  const report = await collectProbe({
    executable: process.execPath,
    executableArgs: [fixture, '--scenario', 'strict-partial', '--expected-cwd', process.cwd()],
    timeoutMs: 1000,
  });
  assert.equal(report.connection.initialized, true);
  assert.equal(report.queries.config.status, 'ok');
  assert.deepEqual(report.queries.skills, { status: 'error', error: { kind: 'rpc-error', rpcCode: -32002 } });
  assert.deepEqual(report.queries.hooks, { status: 'error', error: { kind: 'invalid-response' } });
  assert.equal(report.queries.requirements.status, 'ok');
  assert.equal(probeSucceeded(report), false);
  assert.equal(JSON.stringify(report).includes(SECRET), false);
});

test('does not run inventory requests when initialization fails', async () => {
  const report = await collectProbe({
    executable: process.execPath,
    executableArgs: [fixture, '--scenario', 'rpc-error'],
    timeoutMs: 1000,
  });
  assert.equal(report.connection.initialized, false);
  assert.deepEqual(report.queries, {
    config: { status: 'not-run' },
    skills: { status: 'not-run' },
    hooks: { status: 'not-run' },
    requirements: { status: 'not-run' },
  });
  assert.deepEqual(report.initializationError, { kind: 'rpc-error', rpcCode: -32001 });
  assert.equal(JSON.stringify(report).includes(SECRET), false);
});

test('reports invalid version output without copying it', async () => {
  const report = await collectProbe({
    executable: process.execPath,
    executableArgs: [fixture, '--scenario', 'strict-bad-version', '--expected-cwd', process.cwd()],
    timeoutMs: 1000,
  });
  assert.deepEqual(report.codexCli, { status: 'error', error: { kind: 'invalid-version' } });
  assert.equal(probeSucceeded(report), false);
  assert.equal(JSON.stringify(report).includes(SECRET), false);
});

test('rejects strings that only resemble semantic versions', async () => {
  const report = await collectProbe({
    executable: process.execPath,
    executableArgs: [fixture, '--scenario', 'strict-invalid-semver', '--expected-cwd', process.cwd()],
    timeoutMs: 1000,
  });
  assert.deepEqual(report.codexCli, { status: 'error', error: { kind: 'invalid-version' } });
  assert.equal(JSON.stringify(report).includes(SECRET), false);
});

test('CLI help and invalid usage do not start collection or echo unknown input', async () => {
  let calls = 0;
  const fakeCollect = async () => { calls += 1; throw new Error('must not run'); };

  const helpOut = capture();
  const helpErr = capture();
  assert.equal(await main(['--help'], { stdout: helpOut.stream, stderr: helpErr.stream, collect: fakeCollect }), 0);
  assert.match(helpOut.value(), /unharness\.mjs inspect/);
  assert.equal(helpErr.value(), '');

  const badOut = capture();
  const badErr = capture();
  assert.equal(await main(['inspect', '--timeout-ms', '99', '--unknown', SECRET], {
    stdout: badOut.stream, stderr: badErr.stream, collect: fakeCollect,
  }), 2);
  assert.equal(badOut.value(), '');
  assert.equal(badErr.value().includes(SECRET), false);
  assert.equal(calls, 0);
});

test('CLI writes identical JSON once for a spaces and Unicode path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unharness probe 日本語 '));
  try {
    const cwd = join(root, 'work dir 日本語');
    await mkdir(cwd);
    const output = join(root, 'nested output', 'report 日本語.json');
    const stdout = capture();
    const stderr = capture();
    const code = await main(['inspect', '--cwd', cwd, '--codex', process.execPath, '--output', output, '--timeout-ms', '1000'], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      executableArgs: [fixture, '--scenario', 'strict-ok', '--expected-cwd', cwd],
    });
    assert.equal(code, 0);
    assert.equal(stderr.value(), '');
    assert.equal(await readFile(output, 'utf8'), stdout.value());
    assert.equal(JSON.stringify(JSON.parse(stdout.value())).includes(cwd), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI never overwrites an existing output and still prints the report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unharness collision '));
  try {
    const output = join(root, 'report.json');
    await writeFile(output, 'KEEP_ME', 'utf8');
    const stdout = capture();
    const stderr = capture();
    const code = await main(['inspect', '--codex', process.execPath, '--output', output], {
      stdout: stdout.stream,
      stderr: stderr.stream,
      executableArgs: [fixture, '--scenario', 'strict-ok', '--expected-cwd', process.cwd()],
    });
    assert.equal(code, 1);
    assert.equal(await readFile(output, 'utf8'), 'KEEP_ME');
    assert.equal(JSON.parse(stdout.value()).schemaVersion, 1);
    assert.equal(stderr.value().includes(output), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI rejects command wrappers without echoing their path', async () => {
  const stdout = capture();
  const stderr = capture();
  const code = await main(['inspect', '--codex', `C:\\Users\\${SECRET}\\codex.cmd`], {
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  assert.equal(code, 2);
  assert.equal(stdout.value(), '');
  assert.match(stderr.value(), /native codex\.exe/);
  assert.equal(stderr.value().includes(SECRET), false);
});
