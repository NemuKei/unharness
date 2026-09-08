import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, win32 } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { createRpcTransport } from './rpc-transport.mjs';
import { preservesTomlComments } from './toml-comments.mjs';

const MAX_BYTES = 128 * 1024;
const failed = () => Object.assign(new Error('Codex configuration could not be safely transformed'), { kind: 'config-transform-failed' });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function userLayer(report, file) {
  const layers = report?.layers?.filter(layer => layer?.name?.type === 'user');
  if (!Array.isArray(layers) || layers.length !== 1) throw failed();
  const layer = layers[0];
  if (layer.name.file !== file || typeof layer.version !== 'string' || !layer.version || !object(layer.config)) throw failed();
  return layer;
}

// RPC JSON numbers cannot establish the exact original TOML numeric value.
// Extra numeric metadata is conservatively unavailable when editing Skill config;
// the exact-byte no-op path below remains available without serialization.
function containsNumber(value) {
  if (typeof value === 'number') return true;
  if (value && typeof value === 'object') return Object.values(value).some(containsNumber);
  return false;
}

function disabledConfig(config, paths) {
  if (Object.hasOwn(config, 'skills') && !object(config.skills)) throw failed();
  const entries = config.skills?.config ?? [];
  if (!Array.isArray(entries) || entries.some(entry => !object(entry) || typeof entry.path !== 'string' || typeof entry.enabled !== 'boolean')) throw failed();
  const selected = new Set(paths);
  const next = entries.map(entry => selected.has(entry.path) ? { ...entry, enabled: false } : entry);
  for (const path of paths) {
    if (!entries.some(entry => entry.path === path)) next.push({ path, enabled: false });
  }
  return { ...config, skills: { ...config.skills, config: next } };
}

// Stages native TOML edits in a new private profile. This API never accepts a
// destination path, a generic write operation, or a browser-controlled command.
// executableArgs is an internal synthetic-executable seam, not a GUI input.
async function selectedConfig({ configText, skillPaths, executable, executableArgs = [], timeoutMs = 10000 }, editing) {
  let root;
  let client;
  try {
    if (typeof configText !== 'string' || Buffer.byteLength(configText, 'utf8') > MAX_BYTES || !Array.isArray(skillPaths) || skillPaths.length > 32 || new Set(skillPaths).size !== skillPaths.length || skillPaths.some(path => typeof path !== 'string' || path.includes('\0') || path.length > 32768 || !(isAbsolute(path) || win32.isAbsolute(path)))) throw failed();
    if (skillPaths.length === 0) return editing ? { text: configText, changed: false, codexVersion: null } : { selectors: [], codexVersion: null };
    if (typeof executable !== 'string' || !executable || !Array.isArray(executableArgs) || executableArgs.some(arg => typeof arg !== 'string') || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw failed();
    root = await mkdtemp(join(tmpdir(), 'unharness-config-edit-'));
    root = await realpath(root);
    const profile = join(root, 'profile');
    const project = join(root, 'project');
    await mkdir(profile, { mode: 0o700 });
    await mkdir(project, { mode: 0o700 });
    await mkdir(join(project, '.git'), { mode: 0o700 });
    const file = join(profile, 'config.toml');
    await writeFile(file, configText, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    client = createRpcTransport({ command: executable, args: [...executableArgs, 'app-server', '--stdio'], cwd: project, env: { ...process.env, CODEX_HOME: profile }, timeoutMs, maxResponseBytes: 8 * 1024 * 1024, allowedMethods: editing ? ['initialize', 'config/read', 'skills/config/write', 'config/batchWrite'] : ['initialize', 'config/read'] });
    const initialization = await client.request('initialize', { clientInfo: { name: 'unharness_config_editor', version: '0.0.1' }, capabilities: { experimentalApi: true } });
    const codexVersion = typeof initialization?.userAgent === 'string'
      ? initialization.userAgent.match(/^[^/\r\n]{1,80}\/(\d{1,8}\.\d{1,8}\.\d{1,8})(?=[ (]|$)/)?.[1]
      : null;
    if (!codexVersion || initialization.codexHome !== profile) throw failed();
    client.initialized();
    const read = async () => userLayer(await client.request('config/read', { cwd: project, includeLayers: true }), file);
    const before = await read();
    if (!editing) {
      // Validate shape without returning unrelated native configuration.
      disabledConfig(before.config, skillPaths);
      return { selectors: skillPaths.map(path => (before.config.skills?.config ?? []).filter(entry => entry.path === path).map(entry => entry.enabled)), codexVersion };
    }
    const expected = disabledConfig(before.config, skillPaths);
    if (isDeepStrictEqual(expected, before.config)) return { text: configText, changed: false, codexVersion };
    if (containsNumber(before.config.skills?.config)) throw failed();
    const entries = before.config.skills?.config ?? [];
    const selectedEntries = skillPaths.map(path => entries.filter(entry => entry.path === path));
    // The native path-specific method updates only the first duplicate entry.
    // Retain the guarded array edit for this case so every selected copy is off.
    if (selectedEntries.some(matches => matches.length > 1 && matches.some(entry => entry.enabled))) {
      await client.request('config/batchWrite', { filePath: file, expectedVersion: before.version, reloadUserConfig: false, edits: [{ keyPath: 'skills.config', mergeStrategy: 'replace', value: expected.skills.config }] });
    } else {
      // The path-specific native edit preserves untouched array-entry comments.
      // Its implicit destination is confined by the verified private CODEX_HOME;
      // no caller-controlled config destination or generic write is accepted.
      for (const [index, path] of skillPaths.entries()) {
        if (selectedEntries[index].length === 0 || selectedEntries[index][0].enabled) {
          await client.request('skills/config/write', { path, enabled: false });
        }
      }
    }
    const after = await read();
    if (!isDeepStrictEqual(after.config, expected)) throw failed();
    const text = await readFile(file, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > MAX_BYTES || !preservesTomlComments(configText, text)) throw failed();
    return { text, changed: text !== configText, codexVersion };
  } catch {
    // Native diagnostics can include configuration paths and values.
    throw failed();
  } finally {
    try {
      if (client) await client.close();
      if (root) await rm(root, { recursive: true, force: true });
    } catch {
      throw failed();
    }
  }
}

export const disableSkillConfig = args => selectedConfig(args, true);
// Only initialize/config-read are allowed, including for duplicated selectors.
export const readSkillSelectors = args => selectedConfig(args, false);
