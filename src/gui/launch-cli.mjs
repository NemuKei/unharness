import { isAbsolute, resolve } from 'node:path';

export const WORKBENCH_USAGE = `  node bin/unharness.mjs workbench <open|status|stop> --workspace <registered-workspace>
    open: start or reuse the bundled local UI; does not change a mode
    status: inspect the owned process without starting it
    stop: stop only the authenticated owned UI process; keep saved data
`;
export async function workbenchMain(argv, { stdout = process.stdout, stderr = process.stderr, assetsDirectory } = {}) {
  if (argv.length === 2 && argv[1] === '--help') { stdout.write(WORKBENCH_USAGE); return 0; }
  const [, action, flag, workspace] = argv;
  if (argv.length !== 4 || !['open', 'status', 'stop'].includes(action) || flag !== '--workspace'
    || typeof workspace !== 'string' || !isAbsolute(workspace) || resolve(workspace) !== workspace) {
    stderr.write('Invalid workbench usage. Run workbench --help.\n'); return 2;
  }
  try {
    const { openWorkbench, workbenchStatus, stopWorkbench } = await import('./launch.mjs');
    const operation = { open: openWorkbench, status: workbenchStatus, stop: stopWorkbench }[action];
    stdout.write(JSON.stringify(await operation({ workspace }, { assetsDirectory })) + '\n'); return 0;
  } catch (e) {
    const kind = typeof e?.kind === 'string' && /^gui-launch-[a-z-]+$/.test(e.kind) ? e.kind : 'workbench-unavailable';
    stderr.write(JSON.stringify({ error: { kind } }) + '\n'); return 1;
  }
}
