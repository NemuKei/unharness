#!/usr/bin/env node

import { createInterface } from 'node:readline';

const scenarioIndex = process.argv.indexOf('--scenario');
const scenario = scenarioIndex === -1 ? 'all-ok' : process.argv[scenarioIndex + 1];
const expectedCwdIndex = process.argv.indexOf('--expected-cwd');
const expectedCwd = expectedCwdIndex === -1 ? process.cwd() : process.argv[expectedCwdIndex + 1];

// `node --test` may discover helpers below test/. Running without the explicit
// fixture control is therefore a harmless no-op.
if (scenarioIndex === -1) process.exit(0);

if (process.argv.includes('--version')) {
  if (scenario.endsWith('invalid-semver')) {
    process.stdout.write('codex-cli 1.2.3-invalid. SECRET_MARKER\n');
    process.exit(0);
  }
  if (scenario.endsWith('bad-version')) {
    process.stdout.write('SECRET_MARKER\n');
    process.exit(0);
  }
  process.stdout.write('codex-cli 0.153.4\n');
  process.exit(0);
}

if (!process.argv.includes('app-server') || !process.argv.includes('--stdio')) {
  process.exit(64);
}

if (scenario === 'early-exit') {
  process.exit(23);
}

let initialized = false;
let clientInitialized = false;
const deferred = [];
let strictStep = 0;
const strictMethods = ['initialize', 'config/read', 'skills/list', 'hooks/list', 'configRequirements/read'];

function send(value, fragmented = false) {
  const line = `${JSON.stringify(value)}\n`;
  if (!fragmented) {
    process.stdout.write(line);
    return;
  }
  const middle = Math.floor(line.length / 2);
  process.stdout.write(line.slice(0, middle));
  setTimeout(() => process.stdout.write(line.slice(middle)), 5);
}

function resultFor(method) {
  if (method === 'initialize') return { serverInfo: { name: 'SECRET_MARKER' } };
  if (method === 'config/read') {
    return {
      config: { instructions: 'SECRET_MARKER', unexpected: '/private/SECRET_MARKER' },
      origins: { model: { name: { type: 'user', file: '/private/SECRET_MARKER' }, version: 'SECRET_MARKER' } },
      layers: [
        {
          name: { type: 'user', file: '/private/SECRET_MARKER' },
          config: { skills: {}, instructions: 'SECRET_MARKER' },
          version: 'SECRET_MARKER',
          disabledReason: null,
        },
        {
          name: { type: 'futureSource', identity: 'SECRET_MARKER' },
          config: { hooks: [], mcp_servers: {}, developer_instructions: 'SECRET_MARKER' },
          version: 'SECRET_MARKER',
          disabledReason: 'SECRET_MARKER',
        },
      ],
    };
  }
  if (method === 'skills/list') {
    return { data: [{
      cwd: '/private/SECRET_MARKER',
      skills: [
        { name: 'SECRET_MARKER', enabled: true, scope: 'repo', pluginId: 'SECRET_MARKER' },
        { name: 'SECRET_MARKER', enabled: false, scope: 'futureScope' },
      ],
      errors: [{ message: 'SECRET_MARKER' }],
    }] };
  }
  if (method === 'hooks/list') {
    return { data: [{
      cwd: '/private/SECRET_MARKER',
      hooks: [{ command: 'SECRET_MARKER' }],
      warnings: [{ message: 'SECRET_MARKER' }],
      errors: [],
    }] };
  }
  if (method === 'configRequirements/read') {
    return { requirements: { rules: ['SECRET_MARKER'] }, unexpected: 'SECRET_MARKER' };
  }
  return null;
}

function handleRequest(message) {
  if (message.method === 'initialized' && message.id === undefined) {
    clientInitialized = true;
    return;
  }

  if (typeof message.method === 'string' && !['initialized', ...strictMethods].includes(message.method)) process.exit(65);
  if (!Number.isSafeInteger(message.id) || typeof message.method !== 'string') return;
  if (!['initialize', 'config/read', 'skills/list', 'hooks/list', 'configRequirements/read'].includes(message.method)) {
    process.exit(65);
  }

  if (scenario.startsWith('strict-')) {
    if (message.method !== strictMethods[strictStep]) process.exit(69);
    strictStep += 1;
    const validParams = message.method === 'initialize'
      ? message.params?.clientInfo?.name === 'unharness_probe'
        && message.params?.clientInfo?.version === '0.0.1'
        && message.params?.capabilities?.experimentalApi === true
      : message.method === 'config/read'
        ? message.params?.cwd === expectedCwd && message.params?.includeLayers === true
        : message.method === 'skills/list'
          ? message.params?.cwds?.length === 1 && message.params.cwds[0] === expectedCwd && message.params?.forceReload === true
          : message.method === 'hooks/list'
            ? message.params?.cwds?.length === 1 && message.params.cwds[0] === expectedCwd
            : Object.keys(message.params ?? {}).length === 0;
    if (!validParams) process.exit(70);
  }

  if (scenario === 'timeout') return;
  if (scenario === 'malformed') {
    process.stdout.write('{SECRET_MARKER invalid json}\n');
    return;
  }
  if (scenario === 'oversized') {
    process.stdout.write('x'.repeat(4096));
    return;
  }
  if (scenario === 'rpc-error') {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32001, message: 'SECRET_MARKER', data: '/private/SECRET_MARKER' } });
    return;
  }
  if (scenario.endsWith('partial') && message.method === 'skills/list') {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32002, message: 'SECRET_MARKER', data: 'SECRET_MARKER' } });
    return;
  }
  if (scenario.endsWith('partial') && message.method === 'hooks/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { data: [{ hooks: [] }] } });
    return;
  }
  if (scenario === 'out-of-order' && message.method !== 'initialize') {
    deferred.push(message);
    if (deferred.length === 2) {
      for (const item of deferred.reverse()) {
        send({ jsonrpc: '2.0', id: item.id, result: resultFor(item.method) });
      }
    }
    return;
  }
  if (scenario === 'server-request' && message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: 900, method: 'account/read', params: { marker: 'SECRET_MARKER' } });
    initialized = true;
    send({ jsonrpc: '2.0', id: message.id, result: resultFor(message.method) }, true);
    return;
  }
  if (message.method !== 'initialize' && (!initialized || !clientInitialized)) {
    process.exit(66);
  }
  if (message.method === 'initialize') initialized = true;
  send({ jsonrpc: '2.0', id: message.id, result: resultFor(message.method) }, message.method === 'initialize');
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    process.exit(67);
  }
  if (scenario === 'server-request' && message.id === 900) {
    if (message.error?.code !== -32601 || 'result' in message) process.exit(68);
    return;
  }
  handleRequest(message);
});
