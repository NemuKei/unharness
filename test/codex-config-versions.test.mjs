import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, chmod, readFile, writeFile, copyFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { catalog } from '../src/codex/catalog.mjs';
import { application } from '../src/apps/codex.mjs';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { planUserMode, applyUserPlan, userSourceState, saveUserFavorite, planUserFavorite,
  planUserRetainedSettings, acceptUserRetainedSettings } from '../src/sources/service.mjs';

test('the version table permits only qualified operations', async () => {
  const { CODEX_CONFIG_OPERATIONS, canCodexConfigOperation } = await import('../src/codex/config-versions.mjs');
  assert.deepEqual(CODEX_CONFIG_OPERATIONS['0.153.4'], ['read', 'disable', 'enable', 'plugin-disable']);
  assert.deepEqual(CODEX_CONFIG_OPERATIONS['0.155.0-alpha.16.3'], ['read', 'disable']);
  for (const operation of ['read', 'disable']) assert.equal(canCodexConfigOperation('0.155.0-alpha.16.3', operation), true);
  for (const operation of ['enable', 'plugin-disable']) assert.equal(canCodexConfigOperation('0.155.0-alpha.16.3', operation), false);
  assert.equal(canCodexConfigOperation('0.154.0', 'read'), false);
  assert.equal(canCodexConfigOperation('__proto__', 'read'), false);
});

test('the fixed Skill-enable reason survives the private and MCP error boundary', async () => {
  const { assertQualifiedCodexConfigVersion } = await import('../src/codex/config-versions.mjs');
  const { privateCall } = await import('../src/sources/errors.mjs');
  await assert.rejects(privateCall(() => assertQualifiedCodexConfigVersion('0.155.0-alpha.16.3', 'enable')),
    { kind: 'codex-version-unqualified', reason: 'skill-enable' });
  const { AI_OUTPUT_SCHEMA } = await import('../src/ai/tools.mjs');
  assert.equal(AI_OUTPUT_SCHEMA.properties.error.properties.reason.enum[0], 'skill-enable');
});

test('catalog preserves prerelease suffix and refuses malformed userAgent versions', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-catalog-version-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const codexHome = join(root, 'profile'), project = join(root, 'project');
  await mkdir(codexHome); await mkdir(project);
  const executable = join(root, 'synthetic-codex.mjs');
  await copyFile(resolve('test/fixtures/version-catalog-server.mjs'), executable);
  await chmod(executable, 0o755);
  const prior = process.env.UNHARNESS_FIXTURE_CODEX_VERSION;
  t.after(() => { if (prior === undefined) delete process.env.UNHARNESS_FIXTURE_CODEX_VERSION;
    else process.env.UNHARNESS_FIXTURE_CODEX_VERSION = prior; });
  process.env.UNHARNESS_FIXTURE_CODEX_VERSION = '0.155.0-alpha.16.3';
  assert.equal((await catalog({ codexHome, project, executable })).version, '0.155.0-alpha.16.3');
  await application.assertFreshCatalog({ version: '0.153.4', context: { codexHome, project, executable }, skills: [] });
  process.env.UNHARNESS_FIXTURE_CODEX_VERSION = '0.155..3';
  await assert.rejects(catalog({ codexHome, project, executable }), { kind: 'discovery-failed' });
});

test('management Skill gives the same plain explanation and investigation action', async () => {
  const guidance = await readFile(resolve('skills/unharness/SKILL.md'), 'utf8');
  assert.match(guidance, /codex-version-unqualified/);
  assert.match(guidance, /このCodexの版は、まだ確認していません。今の設定はそのままです/);
  assert.match(guidance, /AIに調べてもらう/);
  assert.match(guidance, /このCodexの版では、このSkillを足すことはまだ確認していません。今の設定はそのままです/);
});

test('a partially qualified version can form a Normal snapshot without native editing', async () => {
  let writes = 0;
  const normal = await application.compile({ reg: { version: '0.155.0-alpha.16.3' }, mode: 'normal',
    selection: [], normal: { config: { text: 'model = "synthetic"\n' } },
    targetFile: () => { writes++; throw Error('must not write'); } });
  assert.equal(normal.after.config.text, 'model = "synthetic"\n');
  assert.equal(writes, 0);
});

test('alpha synthetic profile prepares TRUEFORM then restores exact Normal bytes',
  { skip: process.platform !== 'darwin' }, async t => {
    const p = await aiProfile(t), path = join(p.context.codexHome, 'config.toml');
    const original = await readFile(path);
    const prior = process.env.UNHARNESS_TEST_RUNTIME_VERSION;
    process.env.UNHARNESS_TEST_RUNTIME_VERSION = '0.155.0-alpha.16.3';
    t.after(() => { if (prior === undefined) delete process.env.UNHARNESS_TEST_RUNTIME_VERSION;
      else process.env.UNHARNESS_TEST_RUNTIME_VERSION = prior; });
    await writeFile(join(p.context.codexHome, 'runtime-version-fixture.txt'), '0.155.0-alpha.16.3\n');
    const zero = await planUserMode({ workspace: p.workspace, mode: 'trueform' });
    await applyUserPlan({ workspace: p.workspace, planId: zero.planId });
    assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'trueform');
    assert.notDeepEqual(await readFile(path), original);
    const favorite = await saveUserFavorite({ workspace: p.workspace, name: 'Synthetic TRUEFORM' });
    const restore = await planUserMode({ workspace: p.workspace, mode: 'normal' });
    await applyUserPlan({ workspace: p.workspace, planId: restore.planId });
    assert.deepEqual(await readFile(path), original);
    const saved = await planUserFavorite({ workspace: p.workspace, favoriteId: favorite.favoriteId });
    await applyUserPlan({ workspace: p.workspace, planId: saved.planId });
    assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'trueform');
  });

test('alpha may accept a retained settings difference without changing selected Skill state',
  { skip: process.platform !== 'darwin' }, async t => {
    const p = await aiProfile(t), path = join(p.context.codexHome, 'config.toml');
    const prior = process.env.UNHARNESS_TEST_RUNTIME_VERSION;
    process.env.UNHARNESS_TEST_RUNTIME_VERSION = '0.155.0-alpha.16.3';
    t.after(() => { if (prior === undefined) delete process.env.UNHARNESS_TEST_RUNTIME_VERSION;
      else process.env.UNHARNESS_TEST_RUNTIME_VERSION = prior; });
    await writeFile(join(p.context.codexHome, 'runtime-version-fixture.txt'), '0.155.0-alpha.16.3\n');
    const original = await readFile(path, 'utf8');
    const changed = original.replace('model = "gpt-5"', 'model = "synthetic-next"');
    await writeFile(path, changed);
    const reviewed = await planUserRetainedSettings({ workspace: p.workspace });
    await acceptUserRetainedSettings({ workspace: p.workspace, planId: reviewed.planId });
    assert.equal(await readFile(path, 'utf8'), changed);
    assert.equal((await userSourceState({ workspace: p.workspace })).preparedMode, 'normal');
  });
