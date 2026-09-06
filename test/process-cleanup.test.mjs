import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverFixture = fileURLToPath(new URL('./fixtures/codex-server.mjs', import.meta.url));
const runnerFixture = fileURLToPath(new URL('./fixtures/probe-runner.mjs', import.meta.url));

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function within(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(null);
    }, timeoutMs);
    promise.then((value) => {
      if (settled) return;
      clearTimeout(timer);
      settled = true;
      resolve(value);
    });
  });
}

async function readPid(path) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      return Number(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(25);
    }
  }
  throw new Error('Synthetic child did not publish its process ID');
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

async function runScenario(t, scenario) {
  const root = await mkdtemp(join(tmpdir(), 'unharness cleanup '));
  const pidFile = join(root, 'owned-child.pid');

  const runner = spawn(process.execPath, [
    runnerFixture,
    '--fixture', serverFixture,
    '--scenario', scenario,
    '--pid-file', pidFile,
    '--timeout-ms', '100',
  ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  let stdout = '';
  runner.stdout.setEncoding('utf8');
  runner.stdout.on('data', (chunk) => { stdout += chunk; });
  runner.stderr.resume();
  const closed = new Promise((resolve) => runner.once('close', (code, signal) => resolve({ code, signal })));
  t.after(async () => {
    try {
      const pid = Number(await readFile(pidFile, 'utf8'));
      if (isRunning(pid)) process.kill(pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (runner.exitCode === null && runner.signalCode === null) runner.kill('SIGKILL');
    await within(closed, 1000);
    await rm(root, { recursive: true, force: true });
  });
  const outcome = await within(closed, 1800);
  const ownedPid = await readPid(pidFile);

  if (outcome === null) {
    if (isRunning(ownedPid)) process.kill(ownedPid, 'SIGKILL');
    const cleaned = await within(closed, 1000);
    if (cleaned === null && runner.exitCode === null && runner.signalCode === null) runner.kill('SIGKILL');
    await closed;
  }

  assert.notEqual(outcome, null, 'caller remained alive after its shutdown deadline');
  assert.equal(outcome.code, 0);
  const childSurvived = isRunning(ownedPid);
  if (childSurvived) process.kill(ownedPid, 'SIGKILL');
  assert.equal(childSurvived, false, 'owned child survived collection');
  return JSON.parse(stdout);
}

test('version timeout force-terminates its owned child and lets the caller exit', async (t) => {
  const report = await runScenario(t, 'ignore-version-timeout');
  assert.deepEqual(report.codexCli, { status: 'error', error: { kind: 'timeout' } });
});

test('oversized version output force-terminates its owned child and lets the caller exit', async (t) => {
  const report = await runScenario(t, 'ignore-version-oversize');
  assert.deepEqual(report.codexCli, { status: 'error', error: { kind: 'response-too-large' } });
});

test('app-server close force-terminates its owned child and lets the caller exit', async (t) => {
  const report = await runScenario(t, 'ignore-app-shutdown');
  assert.deepEqual(report.initializationError, { kind: 'timeout' });
});
