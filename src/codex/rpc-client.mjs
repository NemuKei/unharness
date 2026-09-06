import { spawn } from 'node:child_process';

import { shutDownOwnedProcess, trackOwnedProcess } from './owned-process.mjs';

const READ_METHODS = new Set([
  'initialize',
  'config/read',
  'skills/list',
  'hooks/list',
  'configRequirements/read',
]);

const ERROR_MESSAGES = {
  'forbidden-method': 'Request is not allowed by the read-only probe',
  'forbidden-notification': 'Notification is not allowed by the read-only probe',
  'spawn-error': 'Unable to start the Codex process',
  'write-error': 'Unable to write to the Codex process',
  timeout: 'Codex request timed out',
  'process-exit': 'Codex process exited before responding',
  'malformed-response': 'Codex returned a malformed response',
  'response-too-large': 'Codex returned an oversized response',
  'rpc-error': 'Codex returned an RPC error',
};

function localError(kind, rpcCode) {
  const error = new Error(ERROR_MESSAGES[kind] ?? 'Codex probe failed');
  error.kind = kind;
  if (Number.isFinite(rpcCode)) error.rpcCode = rpcCode;
  return error;
}

function assertReadMethod(method) {
  if (!READ_METHODS.has(method)) throw localError('forbidden-method');
}

export function createReadOnlyClient({
  command,
  args = [],
  cwd,
  timeoutMs = 10000,
  maxResponseBytes = 8 * 1024 * 1024,
}) {
  let child;
  try {
    child = spawn(command, args, {
      cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    const error = localError('spawn-error');
    return failedClient(error);
  }

  let nextId = 1;
  let rejectedServerRequests = 0;
  let sentInitialized = false;
  let initializeSucceeded = false;
  let terminalError = null;
  let buffer = Buffer.alloc(0);
  let closed = false;
  const pending = new Map();
  const closeTracker = trackOwnedProcess(child);

  function rejectPending(error) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }

  function fail(kind) {
    if (terminalError) return;
    terminalError = localError(kind);
    rejectPending(terminalError);
  }

  function writeMessage(message) {
    if (terminalError) throw terminalError;
    try {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    } catch {
      fail('write-error');
      throw terminalError;
    }
  }

  function handleMessage(message) {
    if (message === null || typeof message !== 'object' || Array.isArray(message)) {
      fail('malformed-response');
      return;
    }

    if (typeof message.method === 'string') {
      if (Object.hasOwn(message, 'id')) {
        rejectedServerRequests += 1;
        try {
          writeMessage({
            jsonrpc: '2.0',
            id: message.id,
            error: { code: -32601, message: 'Method not found' },
          });
        } catch {
          // writeMessage already settles pending work with a fixed local error.
        }
      }
      return;
    }

    if (!Number.isSafeInteger(message.id)) return;
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);

    if (Object.hasOwn(message, 'error')) {
      const code = Number.isFinite(message.error?.code) ? message.error.code : undefined;
      item.reject(localError('rpc-error', code));
      return;
    }
    if (!Object.hasOwn(message, 'result')) {
      item.reject(localError('malformed-response'));
      return;
    }
    if (item.method === 'initialize') initializeSucceeded = true;
    item.resolve(message.result);
  }

  function parseChunk(chunk) {
    if (terminalError) return;
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const newline = buffer.indexOf(0x0a);
      if (newline === -1) {
        if (buffer.length > maxResponseBytes) fail('response-too-large');
        return;
      }
      if (newline > maxResponseBytes) {
        fail('response-too-large');
        return;
      }
      let line = buffer.subarray(0, newline);
      buffer = buffer.subarray(newline + 1);
      if (line.length > 0 && line[line.length - 1] === 0x0d) line = line.subarray(0, line.length - 1);
      if (line.length === 0) continue;
      let message;
      try {
        message = JSON.parse(line.toString('utf8'));
      } catch {
        fail('malformed-response');
        return;
      }
      handleMessage(message);
      if (terminalError) return;
    }
  }

  child.stdout.on('data', parseChunk);
  child.stderr.on('data', () => {});
  child.on('error', () => fail('spawn-error'));
  child.stdin.on('error', () => {
    if (!closed) fail('write-error');
  });
  child.on('close', () => {
    if (!closed && pending.size > 0) fail('process-exit');
    else if (!closed && !terminalError) terminalError = localError('process-exit');
  });

  function request(method, params) {
    try {
      assertReadMethod(method);
    } catch (error) {
      return Promise.reject(error);
    }
    if (terminalError) return Promise.reject(terminalError);

    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.delete(id)) return;
        reject(localError('timeout'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer, method });
      try {
        writeMessage({ jsonrpc: '2.0', id, method, params });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  function initialized() {
    if (!initializeSucceeded || sentInitialized) throw localError('forbidden-notification');
    sentInitialized = true;
    writeMessage({ jsonrpc: '2.0', method: 'initialized' });
  }

  async function close() {
    if (closed) return closeTracker.closePromise;
    closed = true;
    rejectPending(localError('process-exit'));
    await shutDownOwnedProcess(child, closeTracker, () => {
      if (!child.stdin.destroyed) child.stdin.end();
    });
  }

  return {
    request,
    initialized,
    close,
    get rejectedServerRequestCount() { return rejectedServerRequests; },
  };
}

function failedClient(error) {
  return {
    request(method) {
      try {
        assertReadMethod(method);
      } catch (methodError) {
        return Promise.reject(methodError);
      }
      return Promise.reject(error);
    },
    initialized() { throw error; },
    async close() {},
    get rejectedServerRequestCount() { return 0; },
  };
}
