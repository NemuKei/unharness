// Local, operation-specific qualification of a Codex executable. The probe
// owns every file it opens; its result never contains source bodies or paths.
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { promisify } from 'node:util';
import { createRpcTransport } from './rpc-transport.mjs';
import { CODEX_CONFIG_OPERATIONS, canCodexConfigOperation, isCodexVersion, parseCodexVersionFromUserAgent } from './config-versions.mjs';
import { parse } from '../vendor/smol-toml/parse.js';
import { connectionDirectory, checkDirectory } from '../setup/connection-records.mjs';

const operations = ['read', 'disable', 'restore', 'enable', 'plugin-disable'];
const none = () => Object.fromEntries(operations.map(operation => [operation, false]));
const inFlight = new Map();
const runtimeVersions = new Map();
const execFileAsync = promisify(execFile);
const HASH = /^[a-f0-9]{64}$/;
const skillName = 'unharness-synthetic-qualification';
const pluginId = 'synthetic.probe';
const productFiles = ['config-self-qualify.mjs', 'config-native-profile.mjs', 'config-editor.mjs',
  'plugin-config-editor.mjs', 'config-versions.mjs'];
const digest = value => createHash('sha256').update(value).digest('hex');
const denied = (operation, operationsPassed) => Object.assign(new Error('Codex configuration operation is not qualified'), {
  kind: 'codex-version-unqualified',
  ...(operation === 'enable' && operationsPassed?.disable ? { reason: 'skill-enable' } : {}),
});

export const codexQualificationDirectory = context => join(context.codexHome, '.unharness-workbench');

async function hashFile(path, hash) {
  for await (const chunk of createReadStream(path)) hash.update(chunk);
}
async function sourceRevision() {
  const hash = createHash('sha256');
  for (const name of productFiles) {
    hash.update(name); hash.update('\0');
    await hashFile(fileURLToPath(new URL(name, import.meta.url)), hash);
  }
  return hash.digest('hex');
}
async function executablePath(command) {
  if (typeof command !== 'string' || !command || command.includes('\0')) throw Error('invalid-executable');
  const candidates = isAbsolute(command) ? [command] : !command.includes('/') && !command.includes('\\')
    ? (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(folder => join(folder, command)) : [];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      const path = await realpath(candidate);
      if ((await lstat(path)).isFile()) return path;
    } catch { /* Try the next PATH entry. */ }
  }
  throw Error('executable-unavailable');
}
async function executableIdentity(executable, executableArgs) {
  const path = await executablePath(executable);
  const hash = createHash('sha256');
  await hashFile(path, hash);
  // The argument seam is used only by synthetic tests. An argument that loads
  // code is part of the executable identity and cannot reuse another result.
  for (const arg of executableArgs) {
    if (!isAbsolute(arg)) throw Error('invalid-executable-argument');
    hash.update('\0'); await hashFile(await realpath(arg), hash);
  }
  return { path, sha256: hash.digest('hex') };
}

function syntheticConfig(skill) {
  return `# qualification comment: keep this line\nmodel = "synthetic-model"\napproval_policy = "never"\nsandbox_mode = "read-only"\n\n[[skills.config]]\npath = ${JSON.stringify(skill)}\nenabled = true\n\n[plugins.${JSON.stringify(pluginId)}]\nenabled = true\nnote = "keep-selected-metadata"\n\n# unrelated plugin comment\n[plugins."synthetic.peer"]\nenabled = false\nnote = "keep-peer-metadata"\n`;
}
function userLayer(report, file) {
  const layers = report?.layers?.filter(layer => layer?.name?.type === 'user');
  if (layers?.length !== 1 || layers[0].name.file !== file || typeof layers[0].version !== 'string'
    || !layers[0].version || !layers[0].config || typeof layers[0].config !== 'object') throw Error('invalid-user-layer');
  return layers[0];
}
function basePreserved(text, config) {
  try {
    const parsed = parse(text, { integersAsBigInt: true });
    return text.includes('# qualification comment: keep this line') && text.includes('# unrelated plugin comment')
      && parsed.model === 'synthetic-model' && parsed.approval_policy === 'never'
      && parsed.sandbox_mode === 'read-only' && config.model === 'synthetic-model'
      && config.approval_policy === 'never' && config.sandbox_mode === 'read-only';
  } catch { return false; }
}
function skillState(text, layer, skill, enabled) {
  try {
    const parsed = parse(text, { integersAsBigInt: true });
    const expected = [{ path: skill, enabled }];
    return isDeepStrictEqual(parsed.skills?.config, expected)
      && isDeepStrictEqual(layer.config.skills?.config, expected) && basePreserved(text, layer.config)
      && isDeepStrictEqual(parsed.plugins, {
        [pluginId]: { enabled: true, note: 'keep-selected-metadata' },
        'synthetic.peer': { enabled: false, note: 'keep-peer-metadata' },
      }) && isDeepStrictEqual(layer.config.plugins, parsed.plugins);
  } catch { return false; }
}
function pluginDisabled(text, layer) {
  try {
    const parsed = parse(text, { integersAsBigInt: true });
    return isDeepStrictEqual(parsed.plugins, {
      [pluginId]: { enabled: false, note: 'keep-selected-metadata' },
      'synthetic.peer': { enabled: false, note: 'keep-peer-metadata' },
    }) && isDeepStrictEqual(layer.config.plugins, parsed.plugins) && basePreserved(text, layer.config);
  } catch { return false; }
}
async function runProbe({ executable, executableArgs, timeoutMs }) {
  let root, client;
  const result = { version: null, operations: none() };
  try {
    root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-codex-qualification-')));
    const home = join(root, 'home'), profile = join(home, '.codex'), project = join(root, 'project');
    const skillDirectory = join(home, '.agents', 'skills', skillName);
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await mkdir(project, { mode: 0o700 });
    await mkdir(join(project, '.git'), { mode: 0o700 });
    await mkdir(skillDirectory, { recursive: true, mode: 0o700 });
    const skill = join(skillDirectory, 'SKILL.md'), file = join(profile, 'config.toml');
    await writeFile(skill, '---\nname: unharness-synthetic-qualification\ndescription: Synthetic qualification Skill\n---\nSynthetic only.\n', { mode: 0o600, flag: 'wx' });
    const original = syntheticConfig(skill);
    await writeFile(file, original, { mode: 0o600, flag: 'wx' });
    const env = { ...process.env, HOME: home, CODEX_HOME: profile,
      XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local', 'share') };
    const start = async () => {
      const rpc = createRpcTransport({ command: executable, args: [...executableArgs, 'app-server', '--stdio'],
        cwd: project, env, timeoutMs, allowedMethods: ['initialize', 'config/read', 'skills/config/write', 'config/batchWrite'] });
      try {
        const initialization = await rpc.request('initialize', { clientInfo: { name: 'unharness_config_qualification', version: '0.0.1' },
          capabilities: { experimentalApi: true } });
        const version = parseCodexVersionFromUserAgent(initialization?.userAgent);
        if (!version || initialization.codexHome !== profile) throw Error('identity-mismatch');
        rpc.initialized();
        return { rpc, version };
      } catch (error) { await rpc.close(); throw error; }
    };
    const read = async rpc => userLayer(await rpc.request('config/read', { cwd: project, includeLayers: true }), file);
    ({ rpc: client, version: result.version } = await start());
    const first = await read(client);
    result.operations.read = skillState(original, first, skill, true);
    if (!result.operations.read) return result;
    await client.request('skills/config/write', { path: skill, enabled: false });
    const disabled = await read(client), disabledText = await readFile(file, 'utf8');
    result.operations.disable = skillState(disabledText, disabled, skill, false);
    await client.close(); client = null;
    await writeFile(file, original);
    ({ rpc: client } = await start());
    const restored = await read(client);
    result.operations.restore = (await readFile(file, 'utf8')) === original && skillState(original, restored, skill, true);
    if (result.operations.disable && result.operations.restore) {
      await client.request('skills/config/write', { path: skill, enabled: false });
      await client.request('skills/config/write', { path: skill, enabled: true });
      const enabled = await read(client), enabledText = await readFile(file, 'utf8');
      result.operations.enable = skillState(enabledText, enabled, skill, true);
    }
    await client.close(); client = null;
    await writeFile(file, original);
    ({ rpc: client } = await start());
    const beforePlugin = await read(client);
    await client.request('config/batchWrite', { filePath: file, expectedVersion: beforePlugin.version,
      reloadUserConfig: false, edits: [{ keyPath: `plugins.${JSON.stringify(pluginId)}.enabled`, mergeStrategy: 'replace', value: false }] });
    const afterPlugin = await read(client), pluginText = await readFile(file, 'utf8');
    result.operations['plugin-disable'] = pluginDisabled(pluginText, afterPlugin)
      && isDeepStrictEqual(afterPlugin.config.skills?.config, [{ path: skill, enabled: true }]);
    return result;
  } catch {
    // A failed or timed-out probe never grants even the operations that ran first.
    return { version: result.version, operations: none() };
  } finally {
    try { await client?.close(); } catch { /* Denial is already the safe outcome. */ }
    try { if (root) await rm(root, { recursive: true, force: true }); } catch { /* Temporary cleanup cannot grant access. */ }
  }
}

async function safePrivateFile(path, limit = 16384) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > limit
    || process.platform !== 'win32' && (stat.mode & 0o077 || stat.uid !== process.geteuid())) throw Error('invalid-qualification-file');
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.ino !== stat.ino || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw Error('changed-qualification-file');
    return bytes;
  } finally { await handle.close(); }
}
async function keyFor(directory) {
  const path = join(directory.path, 'codex-qualification.key');
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const key = await safePrivateFile(path, 64);
      if (key.length !== 32) throw Error('invalid-qualification-key');
      return key;
    } catch (error) {
      if (error.code === 'ENOENT') {
        const secret = randomBytes(32);
        try { const handle = await open(path, 'wx', 0o600); try { await handle.writeFile(secret); await handle.sync(); } finally { await handle.close(); } }
        catch (e) { if (e.code !== 'EEXIST') throw e; }
      } else if (error.message !== 'changed-qualification-file' && error.message !== 'invalid-qualification-key') throw error;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  throw Error('invalid-qualification-key');
}
const mac = (key, body) => createHmac('sha256', key).update(JSON.stringify(body)).digest('hex');
function validRecord(value, expected, key) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join()
      !== ['checkedAt', 'executableSha256', 'mac', 'operations', 'sourceRevision', 'version'].sort().join()
    || value.executableSha256 !== expected.sha256 || value.sourceRevision !== expected.sourceRevision
    || !isCodexVersion(value.version) || !Number.isFinite(Date.parse(value.checkedAt))
    || !value.operations || Object.keys(value.operations).sort().join() !== operations.slice().sort().join()
    || operations.some(operation => typeof value.operations[operation] !== 'boolean') || !HASH.test(value.mac)) return false;
  const { mac: signature, ...body } = value;
  return mac(key, body) === signature;
}
async function readRecord(directory, name, expected, key) {
  try {
    await checkDirectory(directory);
    const value = JSON.parse((await safePrivateFile(join(directory.path, name))).toString('utf8'));
    return validRecord(value, expected, key) ? value : null;
  } catch { return null; }
}
async function writeRecord(directory, name, body, key) {
  const value = { ...body, mac: mac(key, body) };
  const stage = join(directory.path, `.qualification-${randomUUID()}.tmp`);
  const handle = await open(stage, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); }
  finally { await handle.close(); }
  try { await checkDirectory(directory); await rename(stage, join(directory.path, name)); }
  finally { await rm(stage, { force: true }); }
  return value;
}
async function lockedCheck(directory, name, expected, key, input) {
  const lock = join(directory.path, name + '.lock');
  for (let attempt = 0; attempt < 1200; attempt++) {
    const cached = await readRecord(directory, name, expected, key);
    if (cached && (!input.version || cached.version === input.version)) return cached;
    try {
      await mkdir(lock, { mode: 0o700 });
      try {
        const existing = await readRecord(directory, name, expected, key);
        if (existing && (!input.version || existing.version === input.version)) return existing;
        input.onChecking?.();
        const checked = await runProbe(input);
        const body = { version: checked.version ?? input.version ?? '0.0.0', executableSha256: expected.sha256,
          checkedAt: new Date().toISOString(), sourceRevision: expected.sourceRevision, operations: checked.operations };
        return writeRecord(directory, name, body, key);
      } finally { await rm(lock, { recursive: true, force: true }); }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const age = await lstat(lock).then(stat => Date.now() - stat.mtimeMs, () => 0);
      if (age > 900000) await rm(lock, { recursive: true, force: true }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  throw Error('qualification-lock-timeout');
}

export async function selfQualifyCodexConfig(input) {
  const { executable, executableArgs = [], dataDirectory, timeoutMs = 10000 } = input;
  if (!isAbsolute(dataDirectory) || !Array.isArray(executableArgs) || executableArgs.some(arg => typeof arg !== 'string')
    || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw Error('invalid-qualification-input');
  const identity = await executableIdentity(executable, executableArgs);
  const revision = await sourceRevision();
  const expected = { sha256: identity.sha256, sourceRevision: revision };
  const directory = await connectionDirectory(dataDirectory, { create: true });
  const key = await keyFor(directory);
  const name = `codex-qualification-${digest(identity.path).slice(0, 32)}.json`;
  const inFlightKey = `${dataDirectory}:${name}:${identity.sha256}:${revision}`;
  if (inFlight.has(inFlightKey)) return inFlight.get(inFlightKey);
  const running = lockedCheck(directory, name, expected, key, { ...input, executable: identity.path, executableArgs, timeoutMs });
  inFlight.set(inFlightKey, running);
  try { return await running; } finally { inFlight.delete(inFlightKey); }
}

// Status is read-only. The GUI can announce a forthcoming check without
// starting one during ordinary state reads.
export async function codexQualificationStatus({ version, executable, dataDirectory }) {
  try {
    const identity = await executableIdentity(executable, []);
    const installedVersion = await installedVersionForStatus(identity);
    if (!installedVersion) return 'pending';
    if (['read', 'disable', 'enable', 'plugin-disable'].some(operation => canCodexConfigOperation(installedVersion, operation))) return 'ready';
    const revision = await sourceRevision();
    const name = `codex-qualification-${digest(identity.path).slice(0, 32)}.json`;
    const inFlightKey = `${dataDirectory}:${name}:${identity.sha256}:${revision}`;
    if (inFlight.has(inFlightKey)) return 'checking';
    const directory = await connectionDirectory(dataDirectory);
    const key = await safePrivateFile(join(directory.path, 'codex-qualification.key'), 64);
    if (key.length !== 32) return 'pending';
    const record = await readRecord(directory, name, { sha256: identity.sha256, sourceRevision: revision }, key);
    return record?.version === installedVersion ? 'ready' : 'pending';
  } catch { return 'pending'; }
}

async function installedVersionForStatus(identity) {
  const key = `${identity.path}:${identity.sha256}`;
  if (runtimeVersions.has(key)) return runtimeVersions.get(key);
  let root;
  try {
    root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-codex-version-')));
    const home = join(root, 'home'), profile = join(home, '.codex');
    await mkdir(profile, { recursive: true, mode: 0o700 });
    const { stdout } = await execFileAsync(identity.path, ['--version'], { cwd: root,
      env: { ...process.env, HOME: home, CODEX_HOME: profile,
        XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local', 'share') },
      timeout: 3000, maxBuffer: 1024 });
    const candidate = /^codex-cli ([^\s\r\n]{1,160})\s*$/.exec(stdout)?.[1] ?? null;
    const value = isCodexVersion(candidate) ? candidate : null;
    runtimeVersions.set(key, value);
    if (runtimeVersions.size > 16) runtimeVersions.delete(runtimeVersions.keys().next().value);
    return value;
  } catch { return null; }
  finally { if (root) await rm(root, { recursive: true, force: true }).catch(() => {}); }
}

export async function assertCodexConfigOperation({ version, operation, ...input }) {
  if (canCodexConfigOperation(version, operation)) return;
  if (Object.hasOwn(CODEX_CONFIG_OPERATIONS, version))
    throw denied(operation, { disable: canCodexConfigOperation(version, 'disable') });
  let record;
  try { record = await selfQualifyCodexConfig({ ...input, version }); }
  catch { throw denied(operation); }
  if (record.version !== version || !record.operations[operation]
    || operation === 'disable' && !record.operations.restore) throw denied(operation, record.operations);
}

// Explicit setup reads can project the same bound decision used by writers.
// A failed probe exposes no capability to the selection screen.
export async function codexConfigOperations({ version, executable, executableArgs = [], dataDirectory }) {
  const names = ['read', 'disable', 'enable', 'plugin-disable'];
  if (Object.hasOwn(CODEX_CONFIG_OPERATIONS, version))
    return Object.fromEntries(names.map(name => [name, canCodexConfigOperation(version, name)]));
  try {
    const record = await selfQualifyCodexConfig({ version, executable, executableArgs, dataDirectory });
    return Object.fromEntries(names.map(name => [name, record.version === version && record.operations[name]
      && (name !== 'disable' || record.operations.restore)]));
  } catch { return Object.fromEntries(names.map(name => [name, false])); }
}
