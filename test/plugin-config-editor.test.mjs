import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/vendor/smol-toml/parse.js';
import * as editor from '../src/codex/plugin-config-editor.mjs';

const nativeFixture = fileURLToPath(new URL('./fixtures/plugin-config-server.mjs', import.meta.url));
const selected = 'selected.fixture@synthetic-market', peer = 'other.fixture@synthetic-market';
const prefix = '# retained root comment\nmodel = "fixture-model"\nprecision = 7.0\ntimestamp = 1979-05-27T07:32:00Z\n\n';
const suffix = '\n# untouched plugin comment\n[plugins."' + peer + '"]\nenabled = false # untouched inline\nnote = "keep-other-plugin-metadata"\n\n# retained settings after plugins\n[memories]\nuse_memories = false\n[history]\npersistence = "none"\n';
const original = prefix + '# selected plugin comment\n[plugins."' + selected + '"]\nenabled = true # selected inline\nnote = "keep-selected-plugin-metadata"\n' + suffix;
const disabled = original.replace('enabled = true # selected inline', 'enabled = false # selected inline');
const withoutFlag = original.replace('enabled = true # selected inline\n', '');
const rejected = error => error.kind === 'config-transform-failed' && !String(error).includes('PRIVATE_PLUGIN_MARKER');

async function fixture(t, scenario = 'ok') {
  const root = await mkdtemp(join(tmpdir(), 'unharness-plugin-editor-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const record = join(root, 'events.jsonl'), source = join(root, 'original.toml');
  await writeFile(source, original, { mode: 0o600 });
  const options = { executable: process.execPath, executableArgs: [nativeFixture, scenario, record], timeoutMs: 5000 };
  return { root, record, source,
    async disable(configText = original, pluginIds = [selected], extra = {}) {
      return editor.disablePluginConfig({ configText, pluginIds, ...options, ...extra });
    },
    async read(configText = original, pluginIds = [selected], extra = {}) {
      return editor.readPluginSelectors({ configText, pluginIds, ...options, ...extra });
    },
    events: async () => (await readFile(record, 'utf8')).trim().split('\n').map(JSON.parse),
    async unchangedAndClean() {
      assert.equal(await readFile(source, 'utf8'), original);
      for (const event of await this.events()) if (event.profile) await assert.rejects(stat(event.profile), { code: 'ENOENT' });
    },
  };
}

test('only the selected literal plugin enabled flag changes; sibling settings and comments stay exact', async t => {
  const s = await fixture(t);
  assert.deepEqual(await s.disable(), { text: disabled, changed: true, codexVersion: '0.153.4' });
  const events = await s.events(), writes = events.filter(e => e.method === 'config/batchWrite');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].params.edits, [{ keyPath: 'plugins."' + selected + '".enabled', mergeStrategy: 'replace', value: false }]);
  assert.ok(events.filter(e => e.method).every(e => ['initialize', 'initialized', 'config/read', 'config/batchWrite'].includes(e.method)));
  await s.unchangedAndClean();
});

test('the reader reports true, false and missing overrides without exposing other configuration or writing', async t => {
  const s = await fixture(t);
  assert.deepEqual(await s.read(original, [selected, peer, 'absent@synthetic-market']), {
    selectors: [{ pluginId: 'absent@synthetic-market', enabled: null }, { pluginId: peer, enabled: false }, { pluginId: selected, enabled: true }], codexVersion: '0.153.4',
  });
  assert.ok(!(await s.events()).some(e => e.method === 'config/batchWrite'));
  await s.unchangedAndClean();
});

test('a later native version remains readable but cannot authorize a plugin edit', async t => {
  const s = await fixture(t, 'new-version');
  assert.deepEqual(await s.read(), { selectors: [{ pluginId: selected, enabled: true }], codexVersion: '0.154.0' });
  await assert.rejects(s.disable(), rejected);
  assert.ok(!(await s.events()).some(event => event.method === 'config/batchWrite'));
  await s.unchangedAndClean();
});

test('an already disabled selection is an exact no-op even with an unrepresentable retained integer', async t => {
  const s = await fixture(t), text = disabled.replace('precision = 7.0', 'precision = 9007199254740993');
  assert.deepEqual(await s.disable(text), { text, changed: false, codexVersion: '0.153.4' });
  assert.ok(!(await s.events()).some(e => e.method === 'config/batchWrite'));
  await s.unchangedAndClean();
});

test('an empty selected set starts no native process and leaves exact input bytes alone', async t => {
  const s = await fixture(t);
  assert.deepEqual(await s.disable(original, []), { text: original, changed: false, codexVersion: null });
  assert.deepEqual(await s.read(original, []), { selectors: [], codexVersion: null });
  await assert.rejects(readFile(s.record), { code: 'ENOENT' });
});

test('a missing enabled override may be added without taking a neighboring retained comment', async t => {
  const s = await fixture(t);
  const result = await s.disable(withoutFlag);
  assert.equal(result.text, withoutFlag.replace('note = "keep-selected-plugin-metadata"\n', 'note = "keep-selected-plugin-metadata"\nenabled = false\n'));
  await s.unchangedAndClean();
});

test('a new selected plugin table preserves existing plugin metadata and later retained comments', async t => {
  const s = await fixture(t), text = prefix + suffix;
  const result = await s.disable(text);
  const expected = parse(text, { integersAsBigInt: true }); expected.plugins[selected] = { enabled: false };
  assert.deepEqual(parse(result.text, { integersAsBigInt: true }), expected);
  assert.ok(result.text.includes('# untouched plugin comment\n[plugins."' + peer + '"]'));
  assert.ok(result.text.includes('# retained settings after plugins\n[memories]'));
  await s.unchangedAndClean();
});

test('the batch supports exactly 32 distinct selected plugin flags', async t => {
  const s = await fixture(t), ids = Array.from({ length: 32 }, (_, index) => 'plugin-' + index + '@synthetic-market');
  const text = ids.map(id => '[plugins."' + id + '"]\nenabled = true\n').join('\n');
  const result = await s.disable(text, ids);
  assert.equal(result.text, text.replaceAll('enabled = true', 'enabled = false'));
  assert.equal((await s.events()).filter(e => e.method === 'config/batchWrite').length, 1);
  await s.unchangedAndClean();
});

for (const [name, text] of [['CRLF', original.replaceAll('\n', '\r\n')], ['no final newline', original.trimEnd()]])
test('native normalization does not change the returned ' + name + ' representation', async t => {
  const s = await fixture(t);
  assert.equal((await s.disable(text)).text, text.replace('enabled = true # selected inline', 'enabled = false # selected inline'));
  await s.unchangedAndClean();
});

for (const scenario of ['other-plugin', 'selected-metadata', 'retained-root', 'drop-comment', 'move-comment', 'file-disagrees', 'float-to-integer', 'datetime-to-string', 'native-null', 'write-error', 'wrong-home', 'wrong-file', 'duplicate-layer'])
test('a native ' + scenario + ' disagreement returns a fixed error and cleans its private profile', async t => {
  const s = await fixture(t, scenario);
  await assert.rejects(s.disable(), rejected);
  await s.unchangedAndClean();
});

test('adding a flag may not take a standalone comment from the following retained key', async t => {
  const s = await fixture(t, 'steal-comment');
  const text = withoutFlag.replace('note = "keep-selected-plugin-metadata"', '# selected note anchor\nnote = "keep-selected-plugin-metadata"');
  await assert.rejects(s.disable(text), rejected);
  await s.unchangedAndClean();
});

test('unsafe native integers are refused before dispatching a write', async t => {
  const s = await fixture(t);
  await assert.rejects(s.disable(original.replace('precision = 7.0', 'precision = 9007199254740993')), rejected);
  assert.ok(!(await s.events()).some(e => e.method === 'config/batchWrite'));
  await s.unchangedAndClean();
});

test('a malformed selected plugin shape is not returned as an absent override', async t => {
  const s = await fixture(t);
  await assert.rejects(s.read(original.replace('enabled = true # selected inline', 'enabled = "PRIVATE_PLUGIN_MARKER" # selected inline')), rejected);
  assert.ok(!(await s.events()).some(e => e.method === 'config/batchWrite'));
  await s.unchangedAndClean();
});

test('invalid IDs, generic destinations and unsupported values fail before creating a profile', async t => {
  const s = await fixture(t);
  const cases = [
    { pluginIds: [selected, selected] }, { pluginIds: ['/private/plugin'] }, { pluginIds: ['id".enabled'] },
    { pluginIds: ['id\nother'] }, { pluginIds: [''] }, { pluginIds: [false] }, { pluginIds: Array.from({ length: 33 }, (_, i) => 'p' + i) },
    { pluginIds: ['a'.repeat(257)] }, { pluginIds: null }, { configText: null }, { configText: 'x'.repeat(128 * 1024 + 1) },
    { filePath: '/private/should-not-write' }, { keyPath: 'plugins' }, { value: true }, { executable: '' },
    { executableArgs: [false] }, { executableArgs: 'invalid' }, { timeoutMs: 0 }, { timeoutMs: Infinity },
  ];
  for (const extra of cases) await assert.rejects(s.disable(original, [selected], extra), rejected);
  await assert.rejects(readFile(s.record), { code: 'ENOENT' });
});
