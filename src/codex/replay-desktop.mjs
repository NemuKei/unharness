import { execFile } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { promisify } from 'node:util';
import { fail } from '../sources/errors.mjs';
const execute = promisify(execFile);
let testRunner = null;
export function setReplayDesktopRunnerForTest(value) {
  if (value !== null && typeof value !== 'function') throw new TypeError('invalid runner');
  testRunner = value;
}
export async function findReplayDesktopBundle(executable) {
  if (process.platform !== 'darwin') return null;
  const resources = dirname(executable), contents = dirname(resources), embeddedBundle = dirname(contents);
  const candidates = basename(resources) === 'Resources' && basename(contents) === 'Contents' && embeddedBundle.endsWith('.app') ? [embeddedBundle] : [];
  candidates.push('/Applications/Codex.app', '/Applications/ChatGPT.app',
    join(homedir(), 'Applications', 'Codex.app'), join(homedir(), 'Applications', 'ChatGPT.app'));
  for (const bundle of new Set(candidates)) {
    try {
      if (!(await lstat(bundle)).isDirectory()) continue;
      const { stdout } = await execute('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', join(bundle, 'Contents/Info.plist')],
        { timeout: 3000, maxBuffer: 1024, windowsHide: true });
      if (stdout.trim() === 'com.openai.codex') return bundle;
    } catch { /* A missing/unrecognized bundle is not an installed Codex app. */ }
  }
  return null;
}
export async function openReplayDesktop(context, project) {
  if (process.platform !== 'darwin') fail('replay-desktop-open-unavailable');
  if (!testRunner) {
    // 0.153.4 can offer an installer when no app is present. This operation only
    // opens an already installed Mac app; installation is a separate action.
    if (!await findReplayDesktopBundle(context.executable)) fail('replay-desktop-open-unavailable');
  }
  const call = { executable: context.executable, args: ['app', project],
    options: { cwd: context.project, env: { ...process.env, CODEX_HOME: context.codexHome }, timeout: 15000, maxBuffer: 8192, windowsHide: true } };
  try { if (testRunner) await testRunner(call); else await execute(call.executable, call.args, call.options); }
  catch { fail('replay-desktop-open-uncertain'); }
  return { desktopOpenRequested: true, taskSubmitted: false, desktopHomeVerified: false };
}
