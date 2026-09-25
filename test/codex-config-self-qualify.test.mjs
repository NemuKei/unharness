import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const fixture = resolve('test/fixtures/config-self-qualify-server.mjs');
const version = '0.155.0-alpha.16.4';

async function setup(t, scenario = 'passing') {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-self-qualify-test-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const executable = process.execPath;
  const executableArgs = [fixture];
  const dataDirectory = join(root, 'product-data');
  const log = join(root, 'launches.jsonl');
  const prior = {
    scenario: process.env.UNHARNESS_QUALIFY_TEST_SCENARIO,
    log: process.env.UNHARNESS_QUALIFY_TEST_LOG,
  };
  process.env.UNHARNESS_QUALIFY_TEST_SCENARIO = scenario;
  process.env.UNHARNESS_QUALIFY_TEST_LOG = log;
  t.after(() => {
    for (const [key, value] of [['UNHARNESS_QUALIFY_TEST_SCENARIO', prior.scenario], ['UNHARNESS_QUALIFY_TEST_LOG', prior.log]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  return { root, executable, executableArgs, dataDirectory, log, version };
}
const launches = async log => (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(JSON.parse);

test('unknown Codex version is checked in synthetic HOME and records each operation outside workspace', async t => {
  const input = await setup(t);
  const { selfQualifyCodexConfig } = await import('../src/codex/config-self-qualify.mjs');
  const record = await selfQualifyCodexConfig(input);
  assert.equal(record.version, version);
  assert.match(record.executableSha256, /^[a-f0-9]{64}$/);
  assert.match(record.sourceRevision, /^[a-f0-9]{64}$/);
  assert.ok(Date.parse(record.checkedAt) > 0);
  assert.deepEqual(record.operations, { read: true, disable: true, restore: true, enable: true, 'plugin-disable': true });
  const calls = await launches(input.log);
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.home !== process.env.HOME && call.profile.startsWith(call.home)
    && call.skill.startsWith(call.home) && call.cwd.startsWith(join(call.home, '..'))));
  assert.ok((await readdir(input.dataDirectory)).some(name => name.includes('qualification')));
});

test('only passing operations are allowed; an explicit enable entry and plugin edit are independently checked', async t => {
  const input = await setup(t, 'no-enable-no-plugin');
  const { selfQualifyCodexConfig, assertCodexConfigOperation } = await import('../src/codex/config-self-qualify.mjs');
  const record = await selfQualifyCodexConfig(input);
  assert.deepEqual(record.operations, { read: true, disable: true, restore: true, enable: false, 'plugin-disable': false });
  await assertCodexConfigOperation({ ...input, operation: 'disable' });
  await assert.rejects(assertCodexConfigOperation({ ...input, operation: 'enable' }),
    { kind: 'codex-version-unqualified', reason: 'skill-enable' });
  await assert.rejects(assertCodexConfigOperation({ ...input, operation: 'plugin-disable' }),
    { kind: 'codex-version-unqualified' });
});

test('plugin qualification rejects changes to an unrelated plugin', async t => {
  const input = await setup(t, 'tamper-plugin-peer');
  const { selfQualifyCodexConfig } = await import('../src/codex/config-self-qualify.mjs');
  const record = await selfQualifyCodexConfig(input);
  assert.equal(record.operations.read, true);
  assert.equal(record.operations.disable, true);
  assert.equal(record.operations['plugin-disable'], false);
});

test('a valid record is reused, but changed executable bytes and corrupted records trigger rechecking', async t => {
  const input = await setup(t);
  const { selfQualifyCodexConfig } = await import('../src/codex/config-self-qualify.mjs');
  await selfQualifyCodexConfig(input);
  const first = (await launches(input.log)).length;
  await selfQualifyCodexConfig(input);
  assert.equal((await launches(input.log)).length, first);
  const recordName = (await readdir(input.dataDirectory)).find(name => name.includes('qualification'));
  await writeFile(join(input.dataDirectory, recordName), '{"tampered":true}', 'utf8');
  await selfQualifyCodexConfig(input);
  assert.ok((await launches(input.log)).length > first);
  const second = (await launches(input.log)).length;
  const changed = join(input.root, 'changed-fixture.mjs');
  await writeFile(changed, (await readFile(fixture, 'utf8')) + '\n// changed executable bytes\n');
  await selfQualifyCodexConfig({ ...input, executableArgs: [changed] });
  assert.ok((await launches(input.log)).length > second);
});

test('concurrent requests run one check and a profile failure authorizes nothing', async t => {
  const input = await setup(t);
  const { selfQualifyCodexConfig, assertCodexConfigOperation } = await import('../src/codex/config-self-qualify.mjs');
  const [one, two] = await Promise.all([selfQualifyCodexConfig(input), selfQualifyCodexConfig(input)]);
  assert.deepEqual(one.operations, two.operations);
  assert.equal((await launches(input.log)).filter(call => call.phase === 'start').length, 3);
  const failed = await setup(t, 'timeout');
  const denied = await selfQualifyCodexConfig({ ...failed, timeoutMs: 200 });
  assert.deepEqual(denied.operations, { read: false, disable: false, restore: false, enable: false, 'plugin-disable': false });
  await assert.rejects(assertCodexConfigOperation({ ...failed, timeoutMs: 200, operation: 'disable' }),
    { kind: 'codex-version-unqualified' });
});

test('the native editor auto-checks an unknown version before a Skill write', async t => {
  const input = await setup(t);
  const { setSkillStatesConfig } = await import('../src/codex/config-editor.mjs');
  const skill = '/skills/selected/SKILL.md';
  const configText = `# keep comment\nmodel = "synthetic-model"\napproval_policy = "never"\n\n[[skills.config]]\npath = "${skill}"\nenabled = true\n\n[plugins."synthetic.probe"]\nenabled = true\n`;
  const result = await setSkillStatesConfig({ configText, skillStates: [{ path: skill, enabled: false }],
    executable: input.executable, executableArgs: input.executableArgs, qualificationDirectory: input.dataDirectory });
  assert.equal(result.codexVersion, version);
  assert.match(result.text, /enabled = false/);
  assert.match(result.text, /# keep comment/);
});

test('the native editor refuses enabled true when the probe loses the explicit entry', async t => {
  const input = await setup(t, 'no-enable-no-plugin');
  const { setSkillStatesConfig } = await import('../src/codex/config-editor.mjs');
  const skill = '/skills/selected/SKILL.md';
  const configText = `# keep comment\nmodel = "synthetic-model"\napproval_policy = "never"\n\n[[skills.config]]\npath = "${skill}"\nenabled = false\n\n[plugins."synthetic.probe"]\nenabled = true\n`;
  await assert.rejects(setSkillStatesConfig({ configText, skillStates: [{ path: skill, enabled: true }],
    executable: input.executable, executableArgs: input.executableArgs, qualificationDirectory: input.dataDirectory }),
  { kind: 'codex-version-unqualified', reason: 'skill-enable' });
});

test('the Codex adapter accepts a locally checked version for catalog and Normal compilation', async t => {
  const input = await setup(t);
  const home = join(input.root, 'profile'), project = join(input.root, 'project');
  await mkdir(home); await mkdir(project);
  const executable = join(input.root, 'synthetic-codex.mjs');
  await copyFile(fixture, executable); await chmod(executable, 0o755);
  await writeFile(join(home, 'config.toml'), '# synthetic\nmodel = "synthetic-model"\n');
  const { application } = await import('../src/apps/codex.mjs');
  const reg = { version, context: { codexHome: home, project, executable }, skills: [] };
  assert.equal(await application.assertFreshCatalog(reg), version);
  const result = await application.compile({ reg, mode: 'normal', selection: [], normal: { config: { text: '# saved\n' } },
    targetFile: () => { throw Error('no write'); } });
  assert.equal(result.after.config.text, '# saved\n');
});

test('status sees a newly installed binary even when registration holds an older bundled version', async t => {
  const input = await setup(t);
  const executable = join(input.root, 'synthetic-codex.mjs');
  await copyFile(fixture, executable); await chmod(executable, 0o755);
  const { codexQualificationStatus, selfQualifyCodexConfig } = await import('../src/codex/config-self-qualify.mjs');
  const context = { executable, dataDirectory: input.dataDirectory, version: '0.153.4' };
  assert.equal(await codexQualificationStatus(context), 'pending');
  await selfQualifyCodexConfig({ ...context, version });
  assert.equal(await codexQualificationStatus(context), 'ready');
});

test('the version boundary consults local operation results for an unknown version', async t => {
  const input = await setup(t, 'no-enable-no-plugin');
  const { assertQualifiedCodexConfigOperation } = await import('../src/codex/config-versions.mjs');
  await assertQualifiedCodexConfigOperation({ version, operation: 'read', executable: input.executable,
    executableArgs: input.executableArgs, dataDirectory: input.dataDirectory });
  await assert.rejects(assertQualifiedCodexConfigOperation({ version, operation: 'enable', executable: input.executable,
    executableArgs: input.executableArgs, dataDirectory: input.dataDirectory }),
  { kind: 'codex-version-unqualified', reason: 'skill-enable' });
});

test('setup can read the actual operation results for the installed version', async t => {
  const input = await setup(t, 'no-enable-no-plugin');
  const { codexConfigOperations } = await import('../src/codex/config-self-qualify.mjs');
  assert.deepEqual(await codexConfigOperations({ version, executable: input.executable,
    executableArgs: input.executableArgs, dataDirectory: input.dataDirectory }),
  { read: true, disable: true, enable: false, 'plugin-disable': false });
});
