import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createRpcTransport } from './rpc-transport.mjs';

import { MAX_CONFIG_BYTES, configTransformFailed } from './config-transform-contract.mjs';
export { MAX_CONFIG_BYTES, configTransformFailed } from './config-transform-contract.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const READ_METHODS = Object.freeze(['initialize', 'config/read']);
const EDIT_METHODS = Object.freeze([...READ_METHODS, 'skills/config/write', 'config/batchWrite']);

function userLayer(report, file) {
  const layers = report?.layers?.filter(layer => layer?.name?.type === 'user');
  if (!Array.isArray(layers) || layers.length !== 1) throw configTransformFailed();
  const layer = layers[0];
  if (layer.name.file !== file || typeof layer.version !== 'string' || !layer.version || !object(layer.config)) {
    throw configTransformFailed();
  }
  return layer;
}

export async function withPrivateNativeConfig({
  configText,
  executable,
  executableArgs = [],
  timeoutMs = 10000,
  editing = false,
  clientName,
}, operation) {
  let root;
  let client;
  try {
    if (
      typeof configText !== 'string'
      || Buffer.byteLength(configText, 'utf8') > MAX_CONFIG_BYTES
      || typeof executable !== 'string'
      || !executable
      || !Array.isArray(executableArgs)
      || executableArgs.some(arg => typeof arg !== 'string')
      || !Number.isFinite(timeoutMs)
      || timeoutMs < 1
      || timeoutMs > 120000
      || typeof editing !== 'boolean'
      || typeof clientName !== 'string'
      || !clientName
      || typeof operation !== 'function'
    ) throw configTransformFailed();

    // Preserve the existing private-copy identity used by observation conflict
    // checks; both editing and read-only validation operate on the same kind of
    // owned configuration copy.
    root = await mkdtemp(join(tmpdir(), 'unharness-config-edit-'));
    root = await realpath(root);
    const profile = join(root, 'profile');
    const project = join(root, 'project');
    await mkdir(profile, { mode: 0o700 });
    await mkdir(project, { mode: 0o700 });
    await mkdir(join(project, '.git'), { mode: 0o700 });
    const file = join(profile, 'config.toml');
    await writeFile(file, configText, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    client = createRpcTransport({
      command: executable,
      args: [...executableArgs, 'app-server', '--stdio'],
      cwd: project,
      env: { ...process.env, CODEX_HOME: profile },
      timeoutMs,
      maxResponseBytes: 8 * 1024 * 1024,
      allowedMethods: editing ? EDIT_METHODS : READ_METHODS,
    });
    const initialization = await client.request('initialize', {
      clientInfo: { name: clientName, version: '0.0.1' },
      capabilities: { experimentalApi: true },
    });
    const codexVersion = typeof initialization?.userAgent === 'string'
      ? initialization.userAgent.match(/^[^/\r\n]{1,80}\/(\d{1,8}\.\d{1,8}\.\d{1,8})(?=[ (]|$)/)?.[1]
      : null;
    if (!codexVersion || initialization.codexHome !== profile) throw configTransformFailed();
    client.initialized();
    const read = async () => userLayer(
      await client.request('config/read', { cwd: project, includeLayers: true }),
      file,
    );
    const layer = await read();
    return await operation({ client, codexVersion, file, layer, read });
  } catch {
    throw configTransformFailed();
  } finally {
    try {
      if (client) await client.close();
      if (root) await rm(root, { recursive: true, force: true });
    } catch {
      throw configTransformFailed();
    }
  }
}
