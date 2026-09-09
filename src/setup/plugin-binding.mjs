import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { resolveWorkbenchTarget } from '../gui/launch-target.mjs';
import { hash } from '../sources/hash.mjs';
import { bindingFail, connectionDirectory, checkDirectory, readConnectionRecord, publishConnectionRecord } from './connection-records.mjs';

const HASH = /^[a-f0-9]{64}$/;
const exact = (value, keys) => value && !Array.isArray(value) && typeof value === 'object'
  && Object.keys(value).sort().join() === keys.sort().join();
const validIdentity = value => exact(value, ['dev', 'ino']) && Object.values(value).every(v => typeof v === 'string' && /^\d{1,30}$/.test(v));
const contextName = 'plugin-context.json', scopeName = 'plugin-scope.json', pointerName = 'connection.json';

async function configuration(target) {
  const homePath = target.application === 'codex' ? target.context.codexHome : target.context.claudeHome;
  const home = await connectionDirectory(homePath, { privateMode: false });
  const project = await connectionDirectory(target.context.project, { privateMode: false });
  const directory = await connectionDirectory(target.directory, { create: true });
  return { kind: 'unharness-plugin-context', schemaVersion: 1, contextKey: target.contextKey,
    context: target.context, home: home.identity, project: project.identity, directory: directory.identity };
}
function validateConfiguration(record) {
  if (!exact(record, ['kind', 'schemaVersion', 'contextKey', 'context', 'home', 'project', 'directory'])
    || record.kind !== 'unharness-plugin-context' || record.schemaVersion !== 1 || !HASH.test(record.contextKey)
    || !['home', 'project', 'directory'].every(key => validIdentity(record[key]))) bindingFail('plugin-binding-invalid');
}
function pointerFor(target, record) {
  return { kind: 'unharness-plugin-connection', schemaVersion: 1, directory: target.directory,
    contextKey: target.contextKey, bindingId: hash(record) };
}
async function pinScope(directory, target) {
  const previous = await readConnectionRecord(directory, scopeName);
  if (previous && (!exact(previous, ['kind', 'schemaVersion', 'contextKey', 'workspace', 'rootScopeId', 'identity'])
    || previous.kind !== 'unharness-plugin-scope' || previous.schemaVersion !== 1
    || previous.contextKey !== target.contextKey || !HASH.test(previous.rootScopeId) || !validIdentity(previous.identity))) bindingFail('plugin-binding-invalid');
  if (!target.workspace) {
    if (previous) bindingFail('plugin-binding-changed');
    return;
  }
  const workspace = await connectionDirectory(target.workspace);
  const value = { kind: 'unharness-plugin-scope', schemaVersion: 1, contextKey: target.contextKey,
    workspace: target.workspace, rootScopeId: target.rootScopeId, identity: workspace.identity };
  await publishConnectionRecord(directory, scopeName, value);
}

// The native host owns PLUGIN_DATA. Use a private child without chmod of its
// existing parent, and keep authoritative context/scope/receipts outside cache.
export async function openPluginBinding({ dataDirectory }) {
  const data = await connectionDirectory(dataDirectory, { privateMode: false });
  let child = null, pinned = null;
  async function localDirectory(create = false) {
    await checkDirectory(data, { privateMode: false });
    try {
      const current = await connectionDirectory(join(dataDirectory, 'unharness'), { create });
      if (child && !isDeepStrictEqual(child, current)) bindingFail('plugin-binding-changed');
      child ??= current;
      return current;
    } catch (e) {
      // A native data directory may be empty before the first local configure.
      const { lstat } = await import('node:fs/promises');
      if (!create && !child && !pinned && await lstat(join(dataDirectory, 'unharness')).then(() => false, error => error.code === 'ENOENT')) return null;
      throw e;
    }
  }
  async function read() {
    const local = await localDirectory();
    const pointer = local ? await readConnectionRecord(local, pointerName) : null;
    if (!pointer) {
      if (pinned) bindingFail('plugin-binding-changed');
      return null;
    }
    if (!exact(pointer, ['kind', 'schemaVersion', 'directory', 'contextKey', 'bindingId'])
      || pointer.kind !== 'unharness-plugin-connection' || pointer.schemaVersion !== 1
      || !HASH.test(pointer.contextKey) || !HASH.test(pointer.bindingId)) bindingFail('plugin-binding-invalid');
    if (pinned && !isDeepStrictEqual(pinned, pointer)) bindingFail('plugin-binding-changed');
    const directory = await connectionDirectory(pointer.directory);
    const record = await readConnectionRecord(directory, contextName);
    validateConfiguration(record);
    if (hash(record) !== pointer.bindingId || record.contextKey !== pointer.contextKey) bindingFail('plugin-binding-invalid');
    const target = await resolveWorkbenchTarget({ context: record.context });
    if (target.application !== 'codex' || !isDeepStrictEqual(pointerFor(target, record), pointer)) bindingFail('plugin-binding-changed');
    if (!isDeepStrictEqual(await configuration(target), record)) bindingFail('plugin-binding-changed');
    await pinScope(directory, target);
    pinned ??= pointer;
    return { ...target, bindingId: pointer.bindingId };
  }
  return { dataDirectory, read, localDirectory };
}

export async function configurePlugin({ dataDirectory, ...input }) {
  const binding = await openPluginBinding({ dataDirectory });
  const previous = await binding.read();
  const target = await resolveWorkbenchTarget(input);
  if (target.application !== 'codex') bindingFail('plugin-application-unsupported');
  if (previous && previous.contextKey !== target.contextKey) bindingFail('plugin-binding-changed');
  const record = await configuration(target);
  const directory = await connectionDirectory(target.directory);
  await publishConnectionRecord(directory, contextName, record);
  await pinScope(directory, target);
  await publishConnectionRecord(await binding.localDirectory(true), pointerName, pointerFor(target, record));
  return binding.read();
}

export function pluginInstallationStatus(binding, target) {
  return { configuration: target ? 'ready' : 'required', dataDirectory: binding.dataDirectory,
    application: 'codex', bindingId: target?.bindingId ?? null, context: target?.context ?? null,
    workspace: target?.workspace ?? null, rootScopeId: target?.rootScopeId ?? null,
    registration: target?.workspace ? 'saved' : 'required' };
}
