import { lstat, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDemoWorkspace, createGuiController } from './controller.mjs';
import { startGuiServer } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_ASSETS = resolve(ROOT, 'dist');

export const GUI_USAGE = `Usage:
  node bin/unharness.mjs gui --demo [--parent <existing-directory>] [--port <0..65535>]
  node bin/unharness.mjs gui --store <store> --scope <hash> [--port <0..65535>]
  node bin/unharness.mjs gui --help
`;

function parse(argv) {
  if (argv[0] !== 'gui') return null;
  if (argv.length === 2 && argv[1] === '--help') return { help: true };
  const values = { demo: false, port: 0 };
  const seen = new Set();
  for (let index = 1; index < argv.length;) {
    const flag = argv[index];
    if (flag === '--demo') {
      if (seen.has(flag)) return null;
      seen.add(flag); values.demo = true; index += 1; continue;
    }
    const key = new Map([['--parent', 'parent'], ['--store', 'store'], ['--scope', 'scopeId'], ['--port', 'port']]).get(flag);
    const value = argv[index + 1];
    if (!key || value === undefined || value.length === 0 || seen.has(flag)) return null;
    seen.add(flag); values[key] = value; index += 2;
  }
  if (!/^\d+$/.test(String(values.port))) return null;
  values.port = Number(values.port);
  if (!Number.isSafeInteger(values.port) || values.port < 0 || values.port > 65535) return null;
  if (values.demo) {
    if (values.store !== undefined || values.scopeId !== undefined) return null;
  } else if (values.store === undefined || values.scopeId === undefined || values.parent !== undefined) return null;
  return values;
}

function safeFailure(error) {
  const known = new Set(['gui-build-missing', 'gui-assets-invalid', 'gui-invalid-port', 'store-init-error',
    'store-invalid', 'store-link-or-type', 'record-not-found', 'record-corrupt', 'invalid-record-id',
    'loadout-incompatible-scope', 'invalid-fixture', 'fixture-conflict']);
  return known.has(error?.kind) ? error.kind : 'gui-start-error';
}

export async function guiMain(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const options = parse(argv);
  if (options?.help) { stdout.write(GUI_USAGE); return 0; }
  if (!options) { stderr.write('Invalid gui usage. Run with --help.\n'); return 2; }

  let selected;
  try {
    let index;
    try { index = await lstat(resolve(DEFAULT_ASSETS, 'index.html')); }
    catch { throw Object.assign(new Error('gui-build-missing'), { kind: 'gui-build-missing' }); }
    if (!index.isFile() || index.isSymbolicLink()) throw Object.assign(new Error('gui-build-missing'), { kind: 'gui-build-missing' });
    if (options.demo) {
      const parent = options.parent === undefined ? resolve(ROOT, '.unharness') : resolve(options.parent);
      if (options.parent === undefined) await mkdir(parent, { recursive: true, mode: 0o700 });
      selected = await createDemoWorkspace({ parent });
    } else selected = { store: resolve(options.store), scopeId: options.scopeId };
    const running = await startGuiServer({ ...selected, assetsDirectory: DEFAULT_ASSETS, port: options.port });
    const state = await createGuiController(selected).then(controller => controller.state());
    const resumeArgv = ['gui', '--store', state.store, '--scope', state.scopeId];
    const summary = {
      schemaVersion: 1,
      url: running.url,
      store: state.store,
      scopeId: state.scopeId,
      fixture: state.fixture,
      project: state.project,
      resumeArgv,
      resumeCommand: `node bin/unharness.mjs ${resumeArgv.map(value => JSON.stringify(value)).join(' ')}`,
    };
    stdout.write(`${JSON.stringify(summary)}\n`);
    const stop = async () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      try { await running.close(); } catch {}
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return 0;
  } catch (error) {
    const failure = { schemaVersion: 1, error: { kind: safeFailure(error) } };
    if (selected?.store && selected?.scopeId) {
      failure.recovery = { store: selected.store, scopeId: selected.scopeId,
        resumeArgv: ['gui', '--store', selected.store, '--scope', selected.scopeId] };
    }
    stderr.write(`${JSON.stringify(failure)}\n`);
    return 1;
  }
}
