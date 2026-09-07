import { createRpcTransport } from './rpc-transport.mjs';

const READ_METHODS = Object.freeze([
  'initialize',
  'config/read',
  'skills/list',
  'hooks/list',
  'configRequirements/read',
]);

export function createReadOnlyClient({ command, args = [], cwd, timeoutMs = 10000, maxResponseBytes = 8 * 1024 * 1024 }) {
  return createRpcTransport({ command, args, cwd, timeoutMs, maxResponseBytes, allowedMethods: READ_METHODS });
}
