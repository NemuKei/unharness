import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const argv = process.argv.slice(2);
if (argv.length === 0) process.exit(0);

function option(name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function disabledPath(config) {
  const match = config?.match(/^skills\.config=\[\{path=("(?:[^"\\]|\\.)*"),enabled=false\}\]$/);
  if (!match) return undefined;
  try {
    const value = JSON.parse(match[1]);
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

const scenario = option('--scenario') ?? 'fixture';
const pidFile = option('--pid-file');

if (argv.at(-1) === '--version') {
  process.stdout.write('codex-cli 0.200.1\n');
  process.exit(0);
}

const debugIndex = argv.indexOf('debug');
const command = argv.slice(debugIndex);
const fixedPrefix = ['debug', 'prompt-input', '--disable', 'hooks', '--disable', 'memories'];
const configIndex = command.indexOf('--config');
const expectedLength = configIndex === -1 ? 7 : 9;
const expectedConfig = option('--expected-config');
if (debugIndex === -1
  || !fixedPrefix.every((value, index) => command[index] === value)
  || command.length !== expectedLength
  || (configIndex !== -1 && configIndex !== 6)
  || (expectedConfig !== undefined && command[configIndex + 1] !== expectedConfig)) {
  process.stderr.write('PRIVATE_BAD_ARGUMENTS\n');
  process.exit(13);
}

if (scenario === 'exit') {
  process.stderr.write('PRIVATE_PROCESS_ERROR\n');
  process.exit(19);
}
if (scenario === 'malformed') {
  process.stdout.write(JSON.stringify({ type: 'message', text: command.at(-1) }));
  process.exit(0);
}
if (scenario === 'timeout') {
  process.on('SIGTERM', () => {});
  if (pidFile) await writeFile(pidFile, String(process.pid), 'utf8');
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}
if (scenario === 'oversize') {
  process.on('SIGTERM', () => {});
  if (pidFile) await writeFile(pidFile, String(process.pid), 'utf8');
  process.stdout.write('x'.repeat((8 * 1024 * 1024) + 1));
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}

let text;
if (scenario === 'static') {
  text = option('--response-text') ?? '';
} else {
  const cwd = process.cwd();
  const agentsPath = join(cwd, 'AGENTS.md');
  const overridePath = join(cwd, 'AGENTS.override.md');
  const skillPath = join(cwd, '.agents', 'skills', 'unharness-source-probe', 'SKILL.md');
  const yamlPath = join(cwd, '.agents', 'skills', 'unharness-source-probe', 'agents', 'openai.yaml');
  const sourcePath = await access(overridePath).then(() => overridePath, () => agentsPath);
  const source = await readFile(sourcePath, 'utf8');
  const skill = await readFile(skillPath, 'utf8');
  const yamlManual = await access(yamlPath).then(
    () => readFile(yamlPath, 'utf8').then((value) => value.includes('allow_implicit_invocation: false')),
    () => false,
  );
  if (option('--fail-manual') === 'true' && yamlManual) {
    process.stderr.write('PRIVATE_MID_MATRIX_FAILURE\n');
    process.exit(29);
  }
  if (option('--malformed-manual') === 'true' && yamlManual) {
    process.stdout.write(JSON.stringify({ metadata: 'PRIVATE_MALFORMED_MATRIX' }));
    process.exit(0);
  }

  const config = configIndex === -1 ? undefined : command[configIndex + 1];
  const fileDisabled = disabledPath(config) === skillPath;
  const implicitSkill = !yamlManual && !fileDisabled;
  const catalog = skill.match(/^description:\s*(.+)$/m)?.[1] ?? '';
  text = [source, implicitSkill ? catalog : '', command.at(-1)].filter(Boolean).join('\n');
  if (option('--drop-procedure') === 'true') {
    text = text.replace(/OPTIONAL_PROCEDURE_[A-F0-9]+/g, 'REMOVED_PROCEDURE');
  }
}

process.stderr.write('PRIVATE_STDERR_VALUE\n');
process.stdout.write(JSON.stringify([{
  type: 'message',
  role: 'user',
  content: [{ type: 'input_text', text }],
  metadata: { secret: 'PRIVATE_METADATA_VALUE', misleading: option('--metadata-marker') },
}]));
