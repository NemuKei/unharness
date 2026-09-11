// Native edits run only in a newly owned configuration copy. Callers select
// registered plugin IDs; they cannot choose a key path, value or destination.
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { parse } from '../vendor/smol-toml/parse.js';
import { configTransformFailed as failed, MAX_CONFIG_BYTES, withPrivateNativeConfig } from './config-native-profile.mjs';
import { validatePluginIds, partitionPluginEnablement } from './plugin-config-selection.mjs';
import { preservesTomlComments } from './toml-comments.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => value !== null && typeof value === 'object' && Object.hasOwn(value, key);
const typedConfig = text => parse(text, { integersAsBigInt: true, maxDepth: 100 });
function argumentsFor(value) {
  if (!object(value) || Object.keys(value).some(key => !['configText', 'pluginIds', 'executable', 'executableArgs', 'timeoutMs'].includes(key))) throw failed();
  const { configText, pluginIds, executable, executableArgs = [], timeoutMs = 10000 } = value;
  if (typeof configText !== 'string' || Buffer.byteLength(configText, 'utf8') > MAX_CONFIG_BYTES
    || typeof executable !== 'string' || !executable || !Array.isArray(executableArgs)
    || executableArgs.some(arg => typeof arg !== 'string') || !Number.isFinite(timeoutMs)
    || timeoutMs < 1 || timeoutMs > 120000) throw failed();
  return { configText, pluginIds: validatePluginIds(pluginIds).sort(), executable, executableArgs, timeoutMs };
}
function provableNativeValues(value) {
  if (value === null || typeof value === 'number' && (!Number.isFinite(value)
    || Number.isInteger(value) && !Number.isSafeInteger(value))) throw failed();
  if (typeof value === 'object') for (const child of Object.values(value)) provableNativeValues(child);
}
function disabled(config, pluginIds) {
  const plugins = { ...(own(config, 'plugins') ? config.plugins : {}) };
  for (const pluginId of pluginIds) Object.defineProperty(plugins, pluginId, {
    value: { ...(own(plugins, pluginId) ? plugins[pluginId] : {}), enabled: false }, enumerable: true, writable: true, configurable: true,
  });
  return { ...config, plugins };
}
function originalFormatting(before, after) {
  // Native 0.153.4 normalizes CRLF and adds a final newline. Keep the original
  // uniform representation; the resulting candidate still receives typed proof.
  const rest = before.replaceAll('\r\n', '');
  if (/\r/.test(rest) || before.includes('\r\n') && /\n/.test(rest)) throw failed();
  let text = after.replaceAll('\r\n', '\n');
  if (/\r/.test(text)) throw failed();
  if (!before.endsWith('\n') && text.endsWith('\n')) text = text.slice(0, -1);
  return before.includes('\r\n') ? text.replaceAll('\n', '\r\n') : text;
}
function pluginHeader(line) {
  if (!/^\s*\[(?!\[)/.test(line)) return null;
  try {
    const value = typedConfig(line);
    if (Object.keys(value).length !== 1 || !object(value.plugins)) return null;
    const ids = Object.keys(value.plugins);
    if (!ids.length) return { root: true };
    if (ids.length === 1 && object(value.plugins[ids[0]]) && !Object.keys(value.plugins[ids[0]]).length)
      return { pluginId: ids[0] };
  } catch { /* An ambiguous header cannot authorize a comment projection. */ }
  return null;
}
function preservesPluginComments(beforeText, afterText, before, pluginIds) {
  if (preservesTomlComments(beforeText, afterText)) return true;
  const missing = new Set(pluginIds.filter(id => !own(before.plugins?.[id], 'enabled')));
  if (!missing.size) return false;
  const created = new Set([...missing].filter(id => !own(before.plugins, id)));
  const removed = new Set(), lines = [];
  let current = null, pendingComment = false;
  // This fallback handles native standalone table/flag insertions only. It
  // never hides a retained token: both the projected TOML and its comments must
  // match the original after accounting for already-present enabled booleans.
  for (const line of afterText.match(/[^\r\n]*(?:\r\n|\n)|[^\r\n]+$/g) ?? []) {
    if (/^\s*$/.test(line)) { lines.push(line); continue; }
    if (/^\s*#/.test(line)) { pendingComment = true; lines.push(line); continue; }
    const header = pluginHeader(line);
    if (/^\s*\[/.test(line)) current = header?.pluginId ?? null;
    if (header && (header.root && !own(before, 'plugins') || created.has(header.pluginId))) {
      if (pendingComment || line.includes('#')) return false;
      pendingComment = false;
      continue;
    }
    if (missing.has(current) && /^\s*enabled\s*=\s*false\s*$/.test(line)) {
      // A newly inserted flag cannot take a comment from the following key.
      if (pendingComment || removed.has(current)) return false;
      removed.add(current); pendingComment = false;
      continue;
    }
    pendingComment = false;
    lines.push(line);
  }
  if (removed.size !== missing.size) return false;
  const projected = lines.join('');
  const originallyPresent = pluginIds.filter(id => !missing.has(id));
  const expected = originallyPresent.length ? disabled(before, originallyPresent) : before;
  try {
    return isDeepStrictEqual(typedConfig(projected), expected) && preservesTomlComments(beforeText, projected);
  } catch { return false; }
}

async function selectedPluginConfig(value, editing) {
  try {
    const { configText, pluginIds, ...native } = argumentsFor(value);
    if (!pluginIds.length) return editing ? { text: configText, changed: false, codexVersion: null }
      : { selectors: [], codexVersion: null };
    return await withPrivateNativeConfig({ ...native, configText, editing, clientName: 'unharness_plugin_config_editor' },
      async ({ client, codexVersion, file, layer: before, read }) => {
        if (editing && codexVersion !== '0.153.4') throw failed();
        const original = typedConfig(configText);
        const selectors = partitionPluginEnablement(before.config, pluginIds).selected;
        if (!isDeepStrictEqual(selectors, partitionPluginEnablement(original, pluginIds).selected)) throw failed();
        if (!editing) return { selectors, codexVersion };
        if (selectors.every(selector => selector.enabled === false)) return { text: configText, changed: false, codexVersion };
        provableNativeValues(before.config);
        const expected = disabled(before.config, pluginIds), typedExpected = disabled(original, pluginIds);
        await client.request('config/batchWrite', { filePath: file, expectedVersion: before.version, reloadUserConfig: false,
          edits: selectors.filter(selector => selector.enabled !== false).map(({ pluginId }) => ({
            keyPath: 'plugins.' + JSON.stringify(pluginId) + '.enabled', mergeStrategy: 'replace', value: false,
          })) });
        const after = await read();
        if (!isDeepStrictEqual(after.config, expected)) throw failed();
        const raw = await readFile(file, 'utf8');
        if (Buffer.byteLength(raw, 'utf8') > MAX_CONFIG_BYTES) throw failed();
        const text = originalFormatting(configText, raw);
        if (Buffer.byteLength(text, 'utf8') > MAX_CONFIG_BYTES || !isDeepStrictEqual(typedConfig(text), typedExpected)
          || !preservesPluginComments(configText, text, original, pluginIds)) throw failed();
        return { text, changed: text !== configText, codexVersion };
      });
  } catch { throw failed(); }
}

export const disablePluginConfig = args => selectedPluginConfig(args, true);
export const readPluginSelectors = args => selectedPluginConfig(args, false);
