import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createStore, LOCAL_STORE_ERROR_KINDS } from '../core/local-store.mjs';
import { findCurrentDesktopSession } from '../codex/desktop-record.mjs';
import { registerFixture, saveFavorite, listFavorites, listCheckpoints, planRestore,
  restoreFavorite, restoreCheckpoint, observeApplication } from './service.mjs';

export const LOADOUT_USAGE = `Registered fixture loadouts (local storage; no model dispatch):
  node bin/unharness.mjs loadouts init [--parent <existing directory>]
  node bin/unharness.mjs loadouts register-fixture --store <store> --fixture <fixture>
  node bin/unharness.mjs loadouts save --store <store> --scope <id> [--family <id>] [--name <name>]
  node bin/unharness.mjs loadouts list --store <store> [--scope <id>]
  node bin/unharness.mjs loadouts plan --store <store> --favorite <version id>
  node bin/unharness.mjs loadouts restore --store <store> --favorite <version id> [--plan <plan id>]
  node bin/unharness.mjs loadouts checkpoints --store <store>
  node bin/unharness.mjs loadouts restore-checkpoint --store <store> --checkpoint <id>
  node bin/unharness.mjs loadouts observe --store <store> --application <id> (--current | --session <JSONL>)

All commands accept --output <new JSON file>. Init defaults to a fresh private
store below .unharness in the current checkout. Only generated Codex fixtures
can be registered/restored. See docs/loadouts.md for recovery and evidence limits.
`;

const ARGUMENTS = {
  init: { allowed: ['parent'], required: [] },
  'register-fixture': { allowed: ['store', 'fixture'], required: ['store', 'fixture'] },
  save: { allowed: ['store', 'scope', 'family', 'name'], required: ['store', 'scope'] },
  list: { allowed: ['store', 'scope'], required: ['store'] },
  plan: { allowed: ['store', 'favorite'], required: ['store', 'favorite'] },
  restore: { allowed: ['store', 'favorite', 'plan'], required: ['store', 'favorite'] },
  checkpoints: { allowed: ['store'], required: ['store'] },
  'restore-checkpoint': { allowed: ['store', 'checkpoint'], required: ['store', 'checkpoint'] },
  observe: { allowed: ['store', 'application', 'current', 'session'], required: ['store', 'application'] },
};
function parse(argv) {
  if (argv.length === 2 && argv[1] === '--help') return { help: true };
  const action = argv[1], spec = Object.hasOwn(ARGUMENTS, action) ? ARGUMENTS[action] : undefined;
  if (!spec) return null;
  if (argv.length === 3 && argv[2] === '--help') return { help: true };
  const options = { action };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) return null;
    const key = flag.slice(2);
    if ((!spec.allowed.includes(key) && key !== 'output') || Object.hasOwn(options, key)) return null;
    if (key === 'current') { options.current = true; continue; }
    const value = argv[++i];
    if (typeof value !== 'string' || !value || value.startsWith('--')) return null;
    options[key] = value;
  }
  if (spec.required.some(key => options[key] === undefined)) return null;
  if (action === 'observe' && Boolean(options.current) === Boolean(options.session)) return null;
  return options;
}

const ERRORS = new Set([...LOCAL_STORE_ERROR_KINDS,
  'loadout-invalid-reference', 'loadout-invalid-name', 'loadout-invalid-snapshot', 'loadout-invalid-favorite',
  'loadout-invalid-checkpoint', 'loadout-invalid-application', 'loadout-incompatible-scope',
  'loadout-source-unready', 'loadout-readback-conflict', 'loadout-stale-plan', 'loadout-stale-application',
  'loadout-family-not-found', 'loadout-store-inside-fixture',
  'fixture-conflict', 'fixture-changed', 'fixture-locked', 'fixture-link-or-type', 'invalid-fixture',
  'invalid-fixture-case', 'fixture-recovery-required', 'fixture-cleanup-required', 'fixture-incompatible-snapshot',
  'invalid-desktop-record', 'desktop-record-too-large', 'desktop-record-changed', 'desktop-record-read-error',
  'desktop-record-identity-mismatch', 'current-session-unavailable', 'session-index-too-large']);

export async function loadoutMain(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const options = parse(argv);
  if (options?.help) { stdout.write(LOADOUT_USAGE); return 0; }
  if (!options) { stderr.write('Invalid loadouts usage. Run with --help.\n'); return 2; }
  let result;
  try {
    const store = options.store;
    switch (options.action) {
      case 'init': {
        const parent = options.parent ?? resolve('.unharness');
        if (options.parent === undefined) await mkdir(parent, { recursive: true, mode: 0o700 });
        result = await createStore({ parent }); break;
      }
      case 'register-fixture': result = await registerFixture({ store, fixture: options.fixture }); break;
      case 'save': result = await saveFavorite({ store, scopeId: options.scope, familyId: options.family, name: options.name }); break;
      case 'list': result = await listFavorites({ store, scopeId: options.scope }); break;
      case 'plan': result = await planRestore({ store, favoriteId: options.favorite }); break;
      case 'restore': result = await restoreFavorite({ store, favoriteId: options.favorite, expectedPlanId: options.plan }); break;
      case 'checkpoints': result = await listCheckpoints({ store }); break;
      case 'restore-checkpoint': result = await restoreCheckpoint({ store, checkpointId: options.checkpoint }); break;
      case 'observe': result = await observeApplication({ store, applicationId: options.application,
        session: options.current ? await findCurrentDesktopSession() : options.session,
        expectedSessionId: options.current ? process.env.CODEX_THREAD_ID : undefined }); break;
    }
  } catch (error) {
    const safe = { kind: ERRORS.has(error?.kind) ? error.kind : 'loadout-operation-error' };
    if (typeof error?.checkpointId === 'string' && /^[a-f0-9]{64}$/.test(error.checkpointId)) safe.checkpointId = error.checkpointId;
    stdout.write(`${JSON.stringify({ schemaVersion: 1, error: safe })}\n`);
    return 1;
  }
  const json = `${JSON.stringify(result)}\n`;
  stdout.write(json);
  if (options.output) {
    try {
      await mkdir(dirname(options.output), { recursive: true });
      await writeFile(options.output, json, { flag: 'wx', mode: 0o600 });
    } catch { stderr.write('Unable to create output file.\n'); return 1; }
  }
  return 0;
}
