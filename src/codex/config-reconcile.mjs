import { isAbsolute, win32 } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { diff3Merge } from 'node-diff3';

import {
  configTransformFailed as failed,
  MAX_CONFIG_BYTES,
  withPrivateNativeConfig,
} from './config-native-profile.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function lineBuffer(text) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
  if (lines.length > 4096) throw failed();
  return lines;
}

function validateNumbers(value) {
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw failed();
  if (value && typeof value === 'object') for (const child of Object.values(value)) validateNumbers(child);
}

function partition(config, skillPaths) {
  validateNumbers(config);
  if (Object.hasOwn(config, 'skills') && !object(config.skills)) throw failed();
  if (config.skills && Object.hasOwn(config.skills, 'config') && !Array.isArray(config.skills.config)) throw failed();
  const entries = config.skills?.config ?? [];
  if (entries.some(entry => !object(entry) || typeof entry.path !== 'string' || typeof entry.enabled !== 'boolean')) throw failed();
  const selectedPaths = new Set(skillPaths);
  const selected = entries.filter(entry => selectedPaths.has(entry.path));
  const unselected = entries.filter(entry => !selectedPaths.has(entry.path));
  const retained = structuredClone(config);
  if (retained.skills) {
    if (unselected.length > 0) retained.skills.config = unselected;
    else delete retained.skills.config;
    if (Object.keys(retained.skills).length === 0) delete retained.skills;
  }
  return { selected, retained };
}

async function readConfig(configText, args) {
  return withPrivateNativeConfig({
    configText,
    executable: args.executable,
    executableArgs: args.executableArgs,
    timeoutMs: args.timeoutMs,
    clientName: 'unharness_config_reconcile',
  }, async ({ codexVersion, layer }) => ({ codexVersion, config: layer.config }));
}

export async function mergeRetainedConfig(args) {
  try {
    if (!object(args)) throw failed();
    const {
      baseText,
      targetText,
      currentText,
      skillPaths,
      executable,
      executableArgs = [],
      timeoutMs = 10000,
    } = args;
    if (
      [baseText, targetText, currentText].some(text => typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_CONFIG_BYTES)
      || !Array.isArray(skillPaths)
      || skillPaths.length > 32
      || new Set(skillPaths).size !== skillPaths.length
      || skillPaths.some(path => typeof path !== 'string' || path.includes('\0') || path.length > 32768 || !(isAbsolute(path) || win32.isAbsolute(path)))
    ) throw failed();

    const baseLines = lineBuffer(baseText);
    const targetLines = lineBuffer(targetText);
    const currentLines = lineBuffer(currentText);
    const chunks = diff3Merge(targetLines, baseLines, currentLines);
    if (chunks.some(chunk => chunk.conflict)) throw failed();
    const text = chunks.flatMap(chunk => chunk.ok).join('');
    if (Buffer.byteLength(text, 'utf8') > MAX_CONFIG_BYTES || lineBuffer(text).length > 4096) throw failed();

    const nativeArgs = { executable, executableArgs, timeoutMs };
    const base = await readConfig(baseText, nativeArgs);
    const target = await readConfig(targetText, nativeArgs);
    const current = await readConfig(currentText, nativeArgs);
    const result = await readConfig(text, nativeArgs);
    const versions = new Set([base.codexVersion, target.codexVersion, current.codexVersion, result.codexVersion]);
    if (versions.size !== 1) throw failed();

    const baseParts = partition(base.config, skillPaths);
    const targetParts = partition(target.config, skillPaths);
    const currentParts = partition(current.config, skillPaths);
    const resultParts = partition(result.config, skillPaths);
    if (
      !isDeepStrictEqual(targetParts.retained, baseParts.retained)
      || !isDeepStrictEqual(currentParts.selected, baseParts.selected)
      || !isDeepStrictEqual(resultParts.selected, targetParts.selected)
      || !isDeepStrictEqual(resultParts.retained, currentParts.retained)
    ) throw failed();

    return { text, changed: text !== currentText, codexVersion: result.codexVersion };
  } catch {
    throw failed();
  }
}
