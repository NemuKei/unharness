import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const RECOVERY_USAGE = `  node bin/unharness.mjs recovery <open|status|stop> --directory <saved-workbench-directory> --binding-id <hash> --distribution-id <hash> [--browser]
    open: open the verified offline recovery UI; does not change settings
    --browser: open its loopback URL in the macOS default browser (open only)
`;
const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
function parse(argv) {
  const action = argv[1], selection = {}, seen = new Set();
  let browser = false;
  if (!['open', 'status', 'stop'].includes(action)) return null;
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (seen.has(flag)) return null;
    seen.add(flag);
    if (flag === '--browser' && action === 'open') { browser = true; continue; }
    const key = { '--directory': 'directory', '--binding-id': 'bindingId', '--distribution-id': 'distributionId' }[flag];
    const value = argv[++i];
    if (!key || typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)
      || (key === 'directory' ? !isAbsolute(value) || resolve(value) !== value : !/^[a-f0-9]{64}$/.test(value))) return null;
    selection[key] = value;
  }
  return Object.keys(selection).length === 3 ? { action, selection, browser } : null;
}
export async function recoveryMain(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  if (argv.length === 2 && argv[1] === '--help') { stdout.write(RECOVERY_USAGE); return 0; }
  const options = parse(argv);
  if (!options) { stderr.write('Invalid recovery usage. Run recovery --help.\n'); return 2; }
  try {
    const { openRecoveryBinding } = await import('./plugin-recovery.mjs');
    const target = await (await openRecoveryBinding(options.selection)).read();
    if (root !== target.recovery.root || process.platform !== 'darwin') throw Object.assign(Error(), { kind: 'plugin-recovery-invalid' });
    const { openWorkbench, workbenchStatus, stopWorkbench } = await import('../gui/launch.mjs');
    const operation = { open: openWorkbench, status: workbenchStatus, stop: stopWorkbench }[options.action];
    const result = await operation({ context: target.context }, { recovery: options.selection });
    let browserOpened = false;
    if (options.browser && result.status === 'running') {
      try { await promisify(execFile)('/usr/bin/open', [result.loopbackOrigin], { timeout: 10000 }); browserOpened = true; }
      catch { /* A verified local URL remains usable if LaunchServices fails. */ }
    }
    stdout.write(JSON.stringify({ ...result, recovery: target.recovery, ...(options.browser ? { browserOpened } : {}) }) + '\n');
    return 0;
  } catch (e) {
    const kind = typeof e?.kind === 'string' && /^(?:plugin-(?:binding|recovery)|gui-launch)-[a-z-]+$/.test(e.kind)
      ? e.kind : 'recovery-unavailable';
    stderr.write(JSON.stringify({ error: { kind } }) + '\n'); return 1;
  }
}
