import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, readFile, writeFile, rename, symlink, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { discoverUserSources, registerUserSources } from '../src/sources/service.mjs';

async function fixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-plugin-binding-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const p = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const dataDirectory = join(parent, 'native-plugin-data');
  await mkdir(dataDirectory, { mode: 0o755 });
  return { ...p, parent, dataDirectory };
}
async function register(context) {
  const discovery = await discoverUserSources(context);
  return registerUserSources({ context, discoveryId: discovery.discoveryId,
    instructionsOptional: true, selectedSkillIds: [], userAddedOptional: true });
}

test('plugin configuration binds an explicit context without registering or editing sources', async t => {
  const { configurePlugin, openPluginBinding } = await import('../src/setup/plugin-binding.mjs');
  const p = await fixture(t), before = await readFile(join(p.context.codexHome, 'AGENTS.md'));
  const binding = await openPluginBinding({ dataDirectory: p.dataDirectory });
  assert.equal(await binding.read(), null);
  const configured = await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  assert.equal(configured.workspace, null);
  assert.equal(configured.rootScopeId, null);
  assert.deepEqual((await binding.read()).context, p.context);
  assert.deepEqual(await readFile(join(p.context.codexHome, 'AGENTS.md')), before);
  await assert.rejects(lstat(join(p.context.codexHome, '.unharness-user-sources')), { code: 'ENOENT' });
  const again = await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  assert.equal(again.bindingId, configured.bindingId);
  assert.equal((await lstat(join(p.dataDirectory, 'unharness', 'connection.json'))).mode & 0o777, 0o600);
  assert.equal((await lstat(join(p.dataDirectory, 'unharness'))).mode & 0o777, 0o700);
});

test('registration is pinned across plugin restarts and native data removal', async t => {
  const { configurePlugin, openPluginBinding } = await import('../src/setup/plugin-binding.mjs');
  const p = await fixture(t);
  const before = await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  const registration = await register(p.context);
  const binding = await openPluginBinding({ dataDirectory: p.dataDirectory });
  const selected = await binding.read();
  assert.equal(selected.workspace, registration.workspace);
  assert.equal(selected.rootScopeId, registration.scopeId);
  const workspaceBytes = await readFile(join(registration.workspace, 'state.json'));
  await rm(p.dataDirectory, { recursive: true }); await mkdir(p.dataDirectory);
  const configured = await configurePlugin({ dataDirectory: p.dataDirectory, workspace: registration.workspace });
  assert.equal(configured.bindingId, before.bindingId);
  assert.deepEqual(await readFile(join(registration.workspace, 'state.json')), workspaceBytes);
  // Replacing a selected directory cannot silently bind a new source scope.
  await rename(registration.workspace, registration.workspace + '-kept');
  await mkdir(registration.workspace);
  await assert.rejects((await openPluginBinding({ dataDirectory: p.dataDirectory })).read());
  assert.ok(await lstat(registration.workspace + '-kept'));
});

test('independent binding edits, redirected data and another project fail closed', async t => {
  const { configurePlugin, openPluginBinding } = await import('../src/setup/plugin-binding.mjs');
  const p = await fixture(t);
  await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  const binding = await openPluginBinding({ dataDirectory: p.dataDirectory });
  await binding.read();
  const other = join(p.parent, 'another-project'); await mkdir(other);
  await assert.rejects(configurePlugin({ dataDirectory: p.dataDirectory, context: { ...p.context, project: other } }), { kind: 'plugin-binding-changed' });
  const path = join(p.dataDirectory, 'unharness', 'connection.json');
  const original = await readFile(path);
  await writeFile(path, '{"schemaVersion":1,"schemaVersion":1}');
  await assert.rejects(binding.read(), { kind: 'plugin-binding-invalid' });
  await assert.rejects(configurePlugin({ dataDirectory: p.dataDirectory, context: p.context }));
  assert.equal(await readFile(path, 'utf8'), '{"schemaVersion":1,"schemaVersion":1}');
  await rm(path); await writeFile(join(p.parent, 'foreign.json'), original, { mode: 0o600 });
  await symlink(join(p.parent, 'foreign.json'), path);
  await assert.rejects(binding.read(), { kind: 'plugin-binding-invalid' });
  const alias = join(p.parent, 'data-alias'); await symlink(p.dataDirectory, alias);
  await assert.rejects(openPluginBinding({ dataDirectory: alias }), { kind: 'plugin-binding-invalid' });
});

test('a running binding rejects disappearance and a replaced project directory', async t => {
  const { configurePlugin, openPluginBinding } = await import('../src/setup/plugin-binding.mjs');
  const p = await fixture(t);
  await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  const binding = await openPluginBinding({ dataDirectory: p.dataDirectory });
  await binding.read();
  const path = join(p.dataDirectory, 'unharness', 'connection.json');
  const original = await readFile(path);
  await rm(path);
  await assert.rejects(binding.read(), { kind: 'plugin-binding-changed' });
  await writeFile(path, original, { mode: 0o600 });
  await rename(p.context.project, p.context.project + '-kept'); await mkdir(p.context.project);
  await assert.rejects((await openPluginBinding({ dataDirectory: p.dataDirectory })).read(), { kind: 'plugin-binding-changed' });
});

test('a replacement native data directory cannot reconnect an existing binding session', async t => {
  const { configurePlugin, openPluginBinding } = await import('../src/setup/plugin-binding.mjs');
  const p = await fixture(t);
  await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  const binding = await openPluginBinding({ dataDirectory: p.dataDirectory });
  const original = await binding.read();
  await rename(p.dataDirectory, p.dataDirectory + '-kept'); await mkdir(p.dataDirectory);
  await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  await assert.rejects(binding.read(), { kind: 'plugin-binding-changed' });
  const newSession = await openPluginBinding({ dataDirectory: p.dataDirectory });
  assert.equal((await newSession.read()).bindingId, original.bindingId);
});

test('a persistent Mac plugin identity and its hash survive device-number-only changes', { skip: process.platform !== 'darwin' }, async t => {
  const { captureDirectoryIdentity } = await import('../src/platform/directory-identity.mjs');
  const { identity } = await import('../src/setup/connection-records.mjs');
  const { hash } = await import('../src/sources/hash.mjs');
  const p = await fixture(t);
  const stat = await lstat(p.context.codexHome);
  const native = await captureDirectoryIdentity(p.context.codexHome, stat);
  const before = identity({ ...native, dev: stat.dev }), later = identity({ ...native, dev: stat.dev + 1 });
  assert.deepEqual(later, before);
  assert.equal(hash(later), hash(before));
  assert.notDeepEqual(identity({ ...native, ino: native.ino + 1 }), before);
});

test('legacy plugin configuration stays immutable and still refuses an unexplained device change', async t => {
  const { configurePlugin, openPluginBinding } = await import('../src/setup/plugin-binding.mjs');
  const { hash } = await import('../src/sources/hash.mjs');
  const p = await fixture(t);
  const configured = await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context });
  const contextPath = join(configured.directory, 'plugin-context.json');
  const pointerPath = join(p.dataDirectory, 'unharness/connection.json');
  const legacy = JSON.parse(await readFile(contextPath, 'utf8'));
  for (const [key, path] of [['home', p.context.codexHome], ['project', p.context.project], ['directory', configured.directory]]) {
    const stat = await lstat(path);
    legacy[key] = { dev: String(stat.dev), ino: String(stat.ino) };
  }
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  pointer.bindingId = hash(legacy);
  const original = JSON.stringify(legacy);
  await writeFile(contextPath, original); await writeFile(pointerPath, JSON.stringify(pointer));
  assert.equal((await configurePlugin({ dataDirectory: p.dataDirectory, context: p.context })).bindingId, pointer.bindingId);
  assert.equal(await readFile(contextPath, 'utf8'), original);
  legacy.home.dev = String(Number(legacy.home.dev) + 1);
  pointer.bindingId = hash(legacy);
  const changed = JSON.stringify(legacy);
  await writeFile(contextPath, changed); await writeFile(pointerPath, JSON.stringify(pointer));
  await assert.rejects((await openPluginBinding({ dataDirectory: p.dataDirectory })).read(), { kind: 'plugin-binding-changed' });
  assert.equal(await readFile(contextPath, 'utf8'), changed);
});
