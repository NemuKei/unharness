import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { collectDesktopRecord, findCurrentDesktopSession } from './desktop-record.mjs';
import { changeDesktopFixture, cleanupDesktopFixture, createDesktopFixture,
  DESKTOP_CASES, inspectDesktopFixture, recoverDesktopFixture } from './desktop-fixture.mjs';

export const DESKTOP_USAGE = `Desktop diagnostics (Node.js only; no model call or app restart):
  node bin/unharness.mjs desktop-fixture create [--parent <existing directory>]
  node bin/unharness.mjs desktop-fixture status --fixture <owned folder>
  node bin/unharness.mjs desktop-fixture set --fixture <owned folder> --case <baseline|manual-only|fixed-only>
  node bin/unharness.mjs desktop-fixture restore --fixture <owned folder>
  node bin/unharness.mjs desktop-fixture recover --fixture <owned folder>
  node bin/unharness.mjs desktop-fixture cleanup --fixture <owned folder>
  node bin/unharness.mjs inspect-desktop --session <local JSONL> [--fixture <owned folder>] [--output <new JSON>]
  node bin/unharness.mjs inspect-desktop --current [--fixture <owned folder>] [--output <new JSON>]

Open the returned project in a NEW local desktop task for each observation.
restore/recover affect only synthetic fixture files. inspect-desktop does not
attach to desktop or prove mode application; see docs/desktop-observation.md.
`;

function parse(argv) {
  const command = argv[0];
  if (argv.at(-1) === '--help' && argv.length <= 3) return { help: true };
  const action = command === 'desktop-fixture' ? argv[1] : 'inspect';
  const allowed = action === 'create' ? ['--parent'] : action === 'set' ? ['--fixture', '--case']
    : action === 'inspect' ? ['--session', '--current', '--fixture', '--output']
      : ['status', 'restore', 'recover', 'cleanup'].includes(action) ? ['--fixture'] : null;
  if (!allowed) return null;
  const options = { command, action };
  for (let i = command === 'desktop-fixture' ? 2 : 1; i < argv.length; i += 2) {
    const flag = argv[i]; const value = argv[i + 1];
    if (flag === '--current' && action === 'inspect' && !options.current) { options.current = true; i -= 1; continue; }
    if (!allowed.includes(flag) || typeof value !== 'string' || !value || value.startsWith('--') || Object.hasOwn(options, flag.slice(2))) return null;
    options[flag.slice(2)] = value;
  }
  if (action === 'inspect' && Boolean(options.session) === Boolean(options.current)) return null;
  if (!['inspect', 'create'].includes(action) && !options.fixture) return null;
  if (action === 'set' && !DESKTOP_CASES.includes(options.case)) return null;
  return options;
}

const ERROR_KINDS = new Set(['invalid-desktop-record', 'desktop-record-too-large', 'desktop-record-changed', 'desktop-record-read-error',
  'desktop-record-identity-mismatch',
  'current-session-unavailable', 'session-index-too-large',
  'fixture-conflict', 'fixture-changed', 'fixture-link-or-type', 'fixture-locked', 'fixture-recovery-required', 'fixture-cleanup-required', 'invalid-fixture', 'invalid-fixture-case']);

export async function desktopMain(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  const options = parse(argv);
  if (options?.help) { stdout.write(DESKTOP_USAGE); return 0; }
  if (!options) { stderr.write('Invalid desktop diagnostic usage. Run with --help.\n'); return 2; }
  let result;
  try {
    if (options.action === 'create') result = await createDesktopFixture({ parent: options.parent });
    else if (options.action === 'inspect') result = await collectDesktopRecord({ ...options,
      session: options.current ? await findCurrentDesktopSession() : options.session,
      expectedSessionId: options.current ? process.env.CODEX_THREAD_ID : undefined });
    else if (options.action === 'status') result = await inspectDesktopFixture(options.fixture);
    else if (options.action === 'cleanup') result = await cleanupDesktopFixture(options.fixture);
    else if (options.action === 'recover') result = await recoverDesktopFixture(options.fixture);
    else result = await changeDesktopFixture(options.fixture, options.action === 'restore' ? 'baseline' : options.case);
  } catch (error) {
    stderr.write(`${ERROR_KINDS.has(error?.kind) ? error.kind : 'desktop-diagnostic-error'}\n`);
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
