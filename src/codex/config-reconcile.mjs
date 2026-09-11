import { isAbsolute, win32 } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { diff3Merge, diffIndices } from '../vendor/node-diff3/index.mjs';
import { parse } from '../vendor/smol-toml/parse.js';
import { preservesTomlComments } from './toml-comments.mjs';
import { partitionPluginEnablement, validatePluginIds } from './plugin-config-selection.mjs';

import {
  configTransformFailed as failed,
  MAX_CONFIG_BYTES,
} from './config-transform-contract.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function lineBuffer(text) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];
  if (lines.length > 4096) throw failed();
  return lines;
}

function deletionUnion(conflict) {
  const removed = new Set();
  for (const side of [conflict.a, conflict.b]) {
    const edits = diffIndices(conflict.o, side);
    // Adjacent deletions can overlap on a separator line. Never guess how to
    // combine inserted/replaced text; the native partition proof below is still
    // mandatory even for a union of deletions.
    if (edits.some(edit => edit.buffer2[1] !== 0)) throw failed();
    for (const edit of edits) {
      const [start, length] = edit.buffer1;
      for (let i = start; i < start + length; i++) removed.add(i);
    }
  }
  return conflict.o.filter((_, i) => !removed.has(i));
}

function validateProvableValues(value) {
  if (value === null) throw failed();
  if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw failed();
  if (typeof value === 'object') for (const child of Object.values(value)) validateProvableValues(child);
}

function partition(config, skillPaths, pluginIds) {
  validateProvableValues(config);
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
  const plugins = partitionPluginEnablement(retained, pluginIds);
  return { selected, selectedPlugins: plugins.selected, retained: plugins.retained };
}

async function readConfig(configText, args) {
  const { withPrivateNativeConfig } = await import('./config-native-profile.mjs');
  return withPrivateNativeConfig({
    configText,
    executable: args.executable,
    executableArgs: args.executableArgs,
    timeoutMs: args.timeoutMs,
    clientName: 'unharness_config_reconcile',
  }, async ({ codexVersion, layer }) => ({ codexVersion, config: layer.config }));
}

function mergedText(baseText, targetText, currentText) {
  const chunks = diff3Merge(lineBuffer(targetText), lineBuffer(baseText), lineBuffer(currentText));
  const text = chunks.flatMap(chunk => chunk.conflict ? deletionUnion(chunk.conflict) : chunk.ok).join('');
  if (chunks.some(chunk => chunk.conflict) && !preservesTomlComments(currentText, text)) throw failed();
  if (Buffer.byteLength(text, 'utf8') > MAX_CONFIG_BYTES || lineBuffer(text).length > 4096) throw failed();
  return text;
}
function validateSelection({baseText, targetText, currentText, skillPaths, pluginIds = []}) {
  if ([baseText, targetText, currentText].some(text => typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_CONFIG_BYTES)
    || !Array.isArray(skillPaths) || skillPaths.length > 32 || new Set(skillPaths).size !== skillPaths.length
    || skillPaths.some(path => typeof path !== 'string' || path.includes('\0') || path.length > 32768
      || !(isAbsolute(path) || win32.isAbsolute(path)))) throw failed();
  validatePluginIds(pluginIds);
}
function assertMergedParts(configs, skillPaths, pluginIds) {
  const [baseParts, targetParts, currentParts, resultParts] = configs.map(c => partition(c, skillPaths, pluginIds));
  if (!isDeepStrictEqual(targetParts.retained, baseParts.retained)
    || !isDeepStrictEqual(currentParts.selected, baseParts.selected)
    || !isDeepStrictEqual(resultParts.selected, targetParts.selected)
    || !isDeepStrictEqual(resultParts.retained, currentParts.retained)
    || !isDeepStrictEqual(currentParts.selectedPlugins, baseParts.selectedPlugins)
    || !isDeepStrictEqual(resultParts.selectedPlugins, targetParts.selectedPlugins)) throw failed();
}

// Only restoration from immutable snapshots uses this proof. Live retained
// setting adoption still requires the native read below; this cannot authorize
// a new runtime control or transform an unreviewed source.
export function mergeFrozenRetainedConfig(args) {
  try {
    if (!object(args) || Object.keys(args).some(k => !['baseText', 'targetText', 'currentText', 'skillPaths', 'pluginIds'].includes(k))) throw failed();
    validateSelection(args);
    const {baseText, targetText, currentText, skillPaths, pluginIds = []} = args;
    const text = mergedText(baseText, targetText, currentText);
    assertMergedParts([baseText, targetText, currentText, text].map(s => parse(s, {integersAsBigInt: true, maxDepth: 100})), skillPaths, pluginIds);
    return {text, changed: text !== currentText, proof: 'frozen-typed-toml'};
  } catch { throw failed(); }
}

export async function mergeRetainedConfig(args) {
  try {
    if (!object(args)) throw failed();
    const {
      baseText,
      targetText,
      currentText,
      skillPaths,
      pluginIds = [],
      executable,
      executableArgs = [],
      timeoutMs = 10000,
    } = args;
    validateSelection({baseText, targetText, currentText, skillPaths, pluginIds});
    const text = mergedText(baseText, targetText, currentText);

    const nativeArgs = { executable, executableArgs, timeoutMs };
    const base = await readConfig(baseText, nativeArgs);
    const target = await readConfig(targetText, nativeArgs);
    const current = await readConfig(currentText, nativeArgs);
    const result = await readConfig(text, nativeArgs);
    const versions = new Set([base.codexVersion, target.codexVersion, current.codexVersion, result.codexVersion]);
    if (versions.size !== 1) throw failed();

    assertMergedParts([base.config, target.config, current.config, result.config], skillPaths, pluginIds);

    return { text, changed: text !== currentText, codexVersion: result.codexVersion };
  } catch {
    throw failed();
  }
}
