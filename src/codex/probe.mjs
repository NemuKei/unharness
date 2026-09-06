import { spawn } from 'node:child_process';
import { arch, platform } from 'node:os';

import { createReadOnlyClient } from './rpc-client.mjs';
import { shutDownOwnedProcess, trackOwnedProcess } from './owned-process.mjs';
import { summarizeQuery } from './summarize.mjs';

const QUERY_SPECS = [
  ['config', 'config/read', (cwd) => ({ cwd, includeLayers: true })],
  ['skills', 'skills/list', (cwd) => ({ cwds: [cwd], forceReload: true })],
  ['hooks', 'hooks/list', (cwd) => ({ cwds: [cwd] })],
  ['requirements', 'configRequirements/read', () => ({})],
];

const SAFE_ERROR_KINDS = new Set([
  'forbidden-method',
  'forbidden-notification',
  'spawn-error',
  'write-error',
  'timeout',
  'process-exit',
  'malformed-response',
  'response-too-large',
  'rpc-error',
  'invalid-version',
]);

function safeError(error) {
  const kind = SAFE_ERROR_KINDS.has(error?.kind) ? error.kind : 'unknown-error';
  const result = { kind };
  if (Number.isFinite(error?.rpcCode)) result.rpcCode = error.rpcCode;
  return result;
}

function semanticVersion(text) {
  const numeric = '(?:0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  const core = `${numeric}\\.${numeric}\\.${numeric}`;
  const prerelease = `(?:-${identifier}(?:\\.${identifier})*)?`;
  const build = '(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?';
  const match = text.match(new RegExp(`(?:^|[^0-9A-Za-z.+-])(${core}${prerelease}${build})(?=$|[^0-9A-Za-z.+-])`));
  return match?.[1] ?? null;
}

export function readVersion({ executable, executableArgs, cwd, timeoutMs }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(executable, [...executableArgs, '--version'], {
        cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      resolve({ status: 'error', error: { kind: 'spawn-error' } });
      return;
    }

    const chunks = [];
    let bytes = 0;
    let active = true;
    const closeTracker = trackOwnedProcess(child);
    const finish = (value) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      resolve(value);
    };
    const stopAndFinish = async (value) => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      await shutDownOwnedProcess(child, closeTracker, () => child.kill());
      resolve(value);
    };
    const timer = setTimeout(() => {
      void stopAndFinish({ status: 'error', error: { kind: 'timeout' } });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      if (!active) return;
      bytes += chunk.length;
      if (bytes <= 64 * 1024) chunks.push(chunk);
      else {
        void stopAndFinish({ status: 'error', error: { kind: 'response-too-large' } });
      }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => finish({ status: 'error', error: { kind: 'spawn-error' } }));
    child.on('close', (code) => {
      if (!active) return;
      if (code !== 0) {
        finish({ status: 'error', error: { kind: 'process-exit' } });
        return;
      }
      const version = semanticVersion(Buffer.concat(chunks).toString('utf8'));
      finish(version
        ? { status: 'ok', version }
        : { status: 'error', error: { kind: 'invalid-version' } });
    });
  });
}

function baseReport(codexCli) {
  return {
    schemaVersion: 1,
    probeVersion: '0.0.1',
    observedAt: new Date().toISOString(),
    kind: 'codex-read-only-inventory',
    codexCli,
    environment: {
      platform: platform(),
      architecture: arch(),
      nodeVersion: process.versions.node,
    },
    connection: {
      surface: 'standalone-app-server',
      desktopSessionAttached: false,
      runtimeStateVerified: false,
      initialized: false,
    },
    sourceCoverage: 'unknown',
    modeSwitchingVerified: false,
    queries: {
      config: { status: 'not-run' },
      skills: { status: 'not-run' },
      hooks: { status: 'not-run' },
      requirements: { status: 'not-run' },
    },
    transport: { rejectedServerRequestCount: 0 },
  };
}

export async function collectProbe({
  executable = 'codex',
  executableArgs = [],
  cwd = process.cwd(),
  timeoutMs = 10000,
} = {}) {
  const codexCli = await readVersion({ executable, executableArgs, cwd, timeoutMs });
  const report = baseReport(codexCli);
  let client;

  try {
    client = createReadOnlyClient({
      command: executable,
      args: [...executableArgs, 'app-server', '--stdio'],
      cwd,
      timeoutMs,
    });
    await client.request('initialize', {
      clientInfo: { name: 'unharness_probe', version: '0.0.1' },
      capabilities: { experimentalApi: true },
    });
    client.initialized();
    report.connection.initialized = true;
  } catch (error) {
    report.initializationError = safeError(error);
  }

  if (report.connection.initialized) {
    for (const [label, method, params] of QUERY_SPECS) {
      try {
        const rawResult = await client.request(method, params(cwd));
        report.queries[label] = summarizeQuery(method, rawResult);
      } catch (error) {
        report.queries[label] = { status: 'error', error: safeError(error) };
      }
    }
  }

  if (client) {
    report.transport.rejectedServerRequestCount = client.rejectedServerRequestCount;
    await client.close();
    report.transport.rejectedServerRequestCount = client.rejectedServerRequestCount;
  }
  return report;
}

export function probeSucceeded(report) {
  return report?.codexCli?.status === 'ok'
    && report?.connection?.initialized === true
    && Object.values(report?.queries ?? {}).every((query) => query?.status === 'ok');
}
