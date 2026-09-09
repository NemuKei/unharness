import { isAbsolute, resolve } from 'node:path';

export const PLUGIN_USAGE = `  node bin/unharness.mjs plugin <status|mcp> --data-directory <native-plugin-data>
  node bin/unharness.mjs plugin configure --data-directory <native-plugin-data> --workspace <registered-workspace>
  node bin/unharness.mjs plugin configure --data-directory <native-plugin-data> --codex-home <directory> --project <directory> [--codex <executable>]
`;
function parse(argv) {
  const command = argv[1];
  if (!['status', 'configure', 'mcp'].includes(command)) return null;
  const allowed = command === 'configure' ? ['data-directory', 'workspace', 'codex-home', 'project', 'codex'] : ['data-directory'];
  const values = {};
  for (let i = 2; i < argv.length; i += 2) {
    const flag = argv[i].slice(2), value = argv[i + 1];
    if (!argv[i].startsWith('--') || !allowed.includes(flag) || Object.hasOwn(values, flag)
      || typeof value !== 'string' || !value || /[\u0000-\u001f\u007f]/.test(value)
      || flag !== 'codex' && (!isAbsolute(value) || resolve(value) !== value)) return null;
    values[flag] = value;
  }
  if (!values['data-directory']) return null;
  if (command === 'configure') {
    if (values.workspace ? Object.keys(values).length !== 2 : !values['codex-home'] || !values.project) return null;
    if (values.codex && (/\.(cmd|bat)$/i.test(values.codex) || !isAbsolute(values.codex) && /[\\/]/.test(values.codex))) return null;
  }
  return { command, dataDirectory: values['data-directory'], input: values.workspace ? { workspace: values.workspace }
    : { context: { codexHome: values['codex-home'], project: values.project, executable: values.codex ?? 'codex' } } };
}
export async function pluginMain(argv, { stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  if (argv.length === 2 && argv[1] === '--help') { stdout.write(PLUGIN_USAGE); return 0; }
  const options = parse(argv);
  if (!options) { stderr.write('Invalid Unharness plugin arguments. Run plugin --help.\n'); return 2; }
  try {
    const { configurePlugin, openPluginBinding, pluginInstallationStatus } = await import('./plugin-binding.mjs');
    if (options.command === 'configure') await configurePlugin({ dataDirectory: options.dataDirectory, ...options.input });
    const binding = await openPluginBinding({ dataDirectory: options.dataDirectory });
    if (options.command === 'mcp') return await (await import('../ai/server.mjs')).serveAiStdio({ binding, stdin, stdout, stderr });
    stdout.write(JSON.stringify(pluginInstallationStatus(binding, await binding.read())) + '\n');
    return 0;
  } catch (e) {
    const kind = ['plugin-binding-invalid', 'plugin-binding-changed', 'plugin-application-unsupported'].includes(e.kind) ? e.kind : 'plugin-unavailable';
    stderr.write('Unharness plugin: ' + kind + '.\n');
    return 1;
  }
}
