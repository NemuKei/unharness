import { lstat, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDemoWorkspace, createGuiController, demoWorkspaceRecovery } from './controller.mjs';
import { startGuiServer } from './server.mjs';
import { normalizeInventoryOptions } from './inventory.mjs';
import { USER_SOURCE_ERROR_KINDS } from '../sources/service.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_ASSETS = resolve(ROOT, 'dist');
const ENTRY_POINT = resolve(ROOT, 'bin', 'unharness.mjs');
const HASH = /^[a-f0-9]{64}$/;

export const GUI_USAGE = `Usage:
  node bin/unharness.mjs gui --demo [--parent <existing-directory>] [--port <0..65535>]
  node bin/unharness.mjs gui --store <store> --scope <hash> [--port <0..65535>]
  node bin/unharness.mjs gui --manage-sources --codex-home <directory> --project <directory> [--codex <native-executable>] [--port <0..65535>]
  node bin/unharness.mjs gui --manage-sources --app claude --claude-home <directory> --project <directory> --app-bundle <application> [--port <0..65535>]
  node bin/unharness.mjs gui --help

Optional read-only inventory: --inspect-cwd <directory> [--codex <native-executable>]
`;

function parse(argv) {
  if (argv[0] !== 'gui') return null;
  if (argv.length === 2 && argv[1] === '--help') return { help: true };
  const values = { demo: false, port: 0 };
  const seen = new Set();
  for (let index = 1; index < argv.length;) {
    const flag = argv[index];
    if (flag === '--demo' || flag === '--manage-sources') {
      if (seen.has(flag)) return null;
      seen.add(flag); values[flag === '--demo' ? 'demo' : 'manageSources'] = true; index += 1; continue;
    }
    const key = new Map([['--parent', 'parent'], ['--store', 'store'], ['--scope', 'scopeId'], ['--port', 'port'],
      ['--codex-home', 'codexHome'], ['--project', 'project'], ['--inspect-cwd', 'inspectCwd'], ['--codex', 'executable'],
      ['--app', 'app'], ['--claude-home', 'claudeHome'], ['--app-bundle', 'appBundle']]).get(flag);
    const value = argv[index + 1];
    if (!key || value === undefined || value.length === 0 || seen.has(flag)) return null;
    seen.add(flag); values[key] = value; index += 2;
  }
  if (!/^\d+$/.test(String(values.port))) return null;
  values.port = Number(values.port);
  if (!Number.isSafeInteger(values.port) || values.port < 0 || values.port > 65535) return null;
  const app = values.app ?? 'codex';
  if (!['codex', 'claude'].includes(app)) return null;
  if (values.manageSources) {
    if (!values.project || values.demo || values.store || values.scopeId || values.parent || values.inspectCwd) return null;
    // Each application requires exactly its own launch identity; a flag from
    // the other application is a usage error rather than a silent default.
    if (app === 'codex') {
      if (!values.codexHome || values.claudeHome || values.appBundle) return null;
    } else if (!values.claudeHome || !values.appBundle || values.codexHome || values.executable) return null;
    values.app = app;
    return values;
  }
  if (values.codexHome || values.project || values.claudeHome || values.appBundle || values.app) return null;
  if (values.executable !== undefined && values.inspectCwd === undefined) return null;
  if (values.demo) {
    if (values.store !== undefined || values.scopeId !== undefined) return null;
  } else if (values.store === undefined || values.scopeId === undefined || values.parent !== undefined) return null;
  return values;
}

function safeFailure(error) {
  const known = new Set([...USER_SOURCE_ERROR_KINDS, 'gui-source-context-changed', 'gui-build-missing', 'gui-assets-invalid', 'gui-invalid-port', 'store-init-error',
    'store-invalid', 'store-link-or-type', 'record-not-found', 'record-corrupt', 'invalid-record-id',
    'gui-inventory-target-invalid', 'gui-inventory-native-executable-required',
    'loadout-incompatible-scope', 'invalid-fixture', 'fixture-conflict']);
  return known.has(error?.kind) ? error.kind : 'gui-start-error';
}

export function buildResumeArgv({ entryPoint = ENTRY_POINT, store, scopeId, inventory } = {}) {
  return [entryPoint, 'gui', '--store', store, '--scope', scopeId,
    ...(inventory ? ['--inspect-cwd', inventory.cwd, '--codex', inventory.executable] : [])];
}

function recoveryProjection(value) {
  if (value === null || typeof value !== 'object') return null;
  const result = {};
  for (const key of ['store', 'scopeId', 'fixture', 'project']) {
    if (typeof value[key] === 'string') result[key] = value[key];
  }
  if (typeof value.inventory?.cwd === 'string' && typeof value.inventory?.executable === 'string') {
    result.inventory = { cwd: value.inventory.cwd, executable: value.inventory.executable };
  }
  if (typeof result.store === 'string' && HASH.test(result.scopeId ?? '')) {
    result.resumeArgv = buildResumeArgv(result);
  }
  return Object.keys(result).length > 0 ? result : null;
}

export async function guiMain(argv, {
  stdout = process.stdout,
  stderr = process.stderr,
  assetsDirectory = DEFAULT_ASSETS,
  createDemo = createDemoWorkspace,
  createController = createGuiController,
  startServer = startGuiServer,
} = {}) {
  const options = parse(argv);
  if (options?.help) { stdout.write(GUI_USAGE); return 0; }
  if (!options) { stderr.write('Invalid gui usage. Run with --help.\n'); return 2; }

  let selected;
  let running;
  let recovery = null;
  let stop;
  try {
    const inventory = await normalizeInventoryOptions(options.inspectCwd === undefined
      ? undefined : { cwd: options.inspectCwd, executable: options.executable });
    let index;
    try { index = await lstat(resolve(assetsDirectory, 'index.html')); }
    catch { throw Object.assign(new Error('gui-build-missing'), { kind: 'gui-build-missing' }); }
    if (!index.isFile() || index.isSymbolicLink()) throw Object.assign(new Error('gui-build-missing'), { kind: 'gui-build-missing' });
    if (options.manageSources) {
      const context = options.app === 'claude'
        ? { application: 'claude', claudeHome: resolve(options.claudeHome), project: resolve(options.project), appBundle: resolve(options.appBundle) }
        : { codexHome: resolve(options.codexHome), project: resolve(options.project), executable: options.executable ?? 'codex' };
      running = await startServer({ manageSources: context, assetsDirectory, port: options.port });
      const resumeArgv = options.app === 'claude'
        ? [ENTRY_POINT, 'gui', '--manage-sources', '--app', 'claude', '--claude-home', context.claudeHome, '--project', context.project, '--app-bundle', context.appBundle]
        : [ENTRY_POINT, 'gui', '--manage-sources', '--codex-home', context.codexHome, '--project', context.project, '--codex', context.executable];
      stdout.write(`${JSON.stringify({ schemaVersion: 1, kind: 'user-sources', application: options.app, url: running.url, context, resumeArgv })}\n`);
      stop = async () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); try { await running.close(); } catch {} };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      return 0;
    }
    if (options.demo) {
      const parent = options.parent === undefined ? resolve(ROOT, '.unharness') : resolve(options.parent);
      if (options.parent === undefined) await mkdir(parent, { recursive: true, mode: 0o700 });
      try { selected = await createDemo({ parent }); }
      catch (error) { recovery = recoveryProjection(demoWorkspaceRecovery(error)); throw error; }
      recovery = recoveryProjection(selected);
    } else {
      selected = { store: resolve(options.store), scopeId: options.scopeId };
      recovery = recoveryProjection(selected);
    }
    if (inventory) selected.inventory = inventory;
    const state = await createController(selected).then(controller => controller.state());
    recovery = recoveryProjection({ ...state, inventory });
    running = await startServer({ ...selected, assetsDirectory, port: options.port });
    const summary = {
      schemaVersion: 1,
      url: running.url,
      store: state.store,
      scopeId: state.scopeId,
      fixture: state.fixture,
      project: state.project,
      ...(inventory ? { inventory } : {}),
      resumeArgv: buildResumeArgv({ ...state, inventory }),
    };
    stdout.write(`${JSON.stringify(summary)}\n`);
    stop = async () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      try { await running.close(); } catch {}
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return 0;
  } catch (error) {
    if (stop) {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
    if (running) {
      try { await running.close(); } catch {}
    }
    const failure = { schemaVersion: 1, error: { kind: safeFailure(error) } };
    if (recovery) failure.recovery = recovery;
    stderr.write(`${JSON.stringify(failure)}\n`);
    return 1;
  }
}
