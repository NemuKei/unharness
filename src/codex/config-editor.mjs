import { readFile } from 'node:fs/promises';
import { isAbsolute, win32 } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  configTransformFailed as failed,
  MAX_CONFIG_BYTES,
  withPrivateNativeConfig,
} from './config-native-profile.mjs';
import { preservesTomlComments } from './toml-comments.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

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
  try {
    if (typeof configText !== 'string' || Buffer.byteLength(configText, 'utf8') > MAX_CONFIG_BYTES || !Array.isArray(skillPaths) || skillPaths.length > 32 || new Set(skillPaths).size !== skillPaths.length || skillPaths.some(path => typeof path !== 'string' || path.includes('\0') || path.length > 32768 || !(isAbsolute(path) || win32.isAbsolute(path)))) throw failed();
    if (skillPaths.length === 0) return editing ? { text: configText, changed: false, codexVersion: null } : { selectors: [], codexVersion: null };
    return await withPrivateNativeConfig({
      configText,
      executable,
      executableArgs,
      timeoutMs,
      editing,
      clientName: 'unharness_config_editor',
    }, async ({ client, codexVersion, file, layer: before, read }) => {
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
      if (Buffer.byteLength(text, 'utf8') > MAX_CONFIG_BYTES || !preservesTomlComments(configText, text)) throw failed();
      return { text, changed: text !== configText, codexVersion };
    });
  } catch {
    // Native diagnostics can include configuration paths and values.
    throw failed();
  }
}

export const disableSkillConfig = args => selectedConfig(args, true);
// Only initialize/config-read are allowed, including for duplicated selectors.
export const readSkillSelectors = args => selectedConfig(args, false);
