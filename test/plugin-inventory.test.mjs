import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, chmod, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverPluginCandidates, capturePluginCandidate, assertPluginDependency } from '../src/codex/plugin-inventory.mjs';
const id = 'fixture-plugin@openai-curated-remote';
async function fixture(t, data = {}, selector = true) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-plugin-inventory-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, 'home'), project = join(root, 'project');
  const packageRoot = join(home, 'plugins/cache/openai-curated-remote/fixture-plugin/1.2.3');
  for (const path of [project, join(packageRoot, '.codex-plugin'), join(packageRoot, 'skills/fixture')])
    await mkdir(path, { recursive: true });
  await writeFile(join(home, '.fixture-plugin.json'), JSON.stringify(data));
  const config = 'model = "fixture"\n' + (selector === null ? '' : '\n[plugins."' + id + '"]\nenabled = ' + selector + '\n');
  await writeFile(join(home, 'config.toml'), config);
  await writeFile(join(packageRoot, '.codex-plugin/plugin.json'), JSON.stringify({ name: 'fixture-plugin', version: '1.2.3', skills: './skills/', hooks: {} }));
  await writeFile(join(packageRoot, 'skills/fixture/SKILL.md'), '# Fixture\nA local fixture.\n');
  const executable = join(root, 'codex');
  await writeFile(executable, '#!' + process.execPath + '\nimport(' + JSON.stringify(new URL('./fixtures/plugin-inventory-server.mjs', import.meta.url).href) + ');\n');
  await chmod(executable, 0o700);
  return { context: { codexHome: home, project, executable }, root, packageRoot, config };
}
for (const selector of [true, false, null]) test('verified installed plugin captures exact Normal selector ' + selector, async t => {
  const f = await fixture(t, {}, selector);
  const found = await discoverPluginCandidates(f.context);
  assert.equal(found.version, '0.153.4');
  assert.equal(found.plugins[0].id, id);
  const { candidate, dependency } = await capturePluginCandidate(f.context, id);
  assert.equal(candidate.eligibility, 'official-confirmed');
  assert.equal(candidate.normalSelector, selector);
  assert.equal(candidate.normalEnabled, selector !== false);
  assert.equal(candidate.features.skills, 1);
  assert.equal(candidate.features.scheduledTasks, null);
  assert.equal(dependency.plugin.localVersion, null);
  assert.equal(dependency.plugin.version, '1.2.3');
  assert.equal(dependency.files.length, 2);
  await assertPluginDependency(f.context, dependency);
  assert.equal(await readFile(join(f.context.codexHome, 'config.toml'), 'utf8'), f.config);
  const requests = (await readFile(join(f.context.codexHome, '.fixture-requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(requests.every(q => ['initialize', 'initialized', 'config/read', 'skills/list', 'plugin/installed', 'plugin/search', 'plugin/read', 'plugin/skill/read'].includes(q.method)));
  assert.equal(JSON.stringify(candidate).includes(f.config), false);
});
for (const [name, data] of Object.entries({
  localCopy: { summary: { source: { type: 'local', path: '/synthetic/local-copy' } } },
  unknownRuntime: { runtimeVersion: '0.154.0' },
  wrongInstalledVersion: { cli: { version: '1.2.2' } },
  sameNameOtherDirectoryID: { search: { remotePluginId: 'plugins~different' } },
  editedBody: { markdown: '# Different\n' },
  required: { summary: { installPolicy: 'INSTALLED_BY_DEFAULT' } },
  managed: { summary: { installPolicySource: 'WORKSPACE_SETTING' } },
  unavailable: { summary: { availability: 'NOT_AVAILABLE' } },
  duplicatedInstallation: { duplicate: true },
  selectedProjectLayer: { layer: { name: { type: 'project', dotCodexFolder: '/synthetic/project' }, config: { plugins: { [id]: { enabled: true } } } } },
})) test('does not qualify ' + name, async t => {
  const f = await fixture(t, data);
  await assert.rejects(capturePluginCandidate(f.context, id), { kind: 'plugin-inventory-unavailable' });
  assert.equal(await readFile(join(f.context.codexHome, 'config.toml'), 'utf8'), f.config);
});
test('package additions and body edits invalidate saved evidence; restoration need not load this native boundary', async t => {
  const f = await fixture(t);
  const { dependency } = await capturePluginCandidate(f.context, id);
  const added = join(f.packageRoot, 'new.txt');
  await writeFile(added, 'changed');
  await assert.rejects(assertPluginDependency(f.context, dependency), { kind: 'plugin-dependency-changed' });
  await rm(added);
  await writeFile(join(f.packageRoot, 'skills/fixture/SKILL.md'), 'changed');
  await assert.rejects(assertPluginDependency(f.context, dependency), { kind: 'plugin-dependency-changed' });
});
test('a link in the installed package is refused without following it', async t => {
  const f = await fixture(t);
  await symlink(fileURLToPath(import.meta.url), join(f.packageRoot, 'linked-file'));
  await assert.rejects(capturePluginCandidate(f.context, id), { kind: 'plugin-inventory-unavailable' });
});
test('Normal plugin disablement does not invalidate the content dependency', async t => {
  const f = await fixture(t);
  const { dependency } = await capturePluginCandidate(f.context, id);
  await writeFile(join(f.context.codexHome, 'config.toml'), f.config.replace('enabled = true', 'enabled = false'));
  await assertPluginDependency(f.context, dependency);
});
