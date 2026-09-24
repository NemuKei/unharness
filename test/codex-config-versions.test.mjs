import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, chmod, readFile, copyFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { catalog } from '../src/codex/catalog.mjs';
import { application } from '../src/apps/codex.mjs';

test('one qualified configuration-version list excludes the unverified alpha', async () => {
  const { QUALIFIED_CODEX_CONFIG_VERSIONS, isQualifiedCodexConfigVersion } = await import('../src/codex/config-versions.mjs');
  assert.deepEqual(QUALIFIED_CODEX_CONFIG_VERSIONS, ['0.153.4']);
  assert.equal(isQualifiedCodexConfigVersion('0.153.4'), true);
  assert.equal(isQualifiedCodexConfigVersion('0.155.0-alpha.16.3'), false);
  assert.equal(isQualifiedCodexConfigVersion('0.154.0'), false);
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
  await assert.rejects(application.assertFreshCatalog({ version: '0.153.4', context: { codexHome, project, executable }, skills: [] }),
    { kind: 'codex-version-unqualified' });
  process.env.UNHARNESS_FIXTURE_CODEX_VERSION = '0.155..3';
  await assert.rejects(catalog({ codexHome, project, executable }), { kind: 'discovery-failed' });
});

test('management Skill gives the same plain explanation and investigation action', async () => {
  const guidance = await readFile(resolve('skills/unharness/SKILL.md'), 'utf8');
  assert.match(guidance, /codex-version-unqualified/);
  assert.match(guidance, /このCodexの版は、まだ確認していません。今の設定はそのままです/);
  assert.match(guidance, /AIに調べてもらう/);
});

test('a newly discovered unqualified version cannot compile even a Normal switch', async () => {
  let writes = 0;
  await assert.rejects(application.compile({ reg: { version: '0.155.0-alpha.16.3' }, mode: 'normal',
    selection: [], normal: { config: { text: 'model = "synthetic"\n' } },
    targetFile: () => { writes++; throw Error('must not write'); } }), { kind: 'codex-version-unqualified' });
  assert.equal(writes, 0);
});
