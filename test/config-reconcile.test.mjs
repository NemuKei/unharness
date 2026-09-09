import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mergeRetainedConfig } from '../src/codex/config-reconcile.mjs';
import { SUBPROCESS_TIMEOUT_MS } from '../test-support/process-timeouts.mjs';

const editorFixture = fileURLToPath(new URL('./fixtures/config-editor-server.mjs', import.meta.url));
const selectedPath = '/skills/selected/SKILL.md';

async function reconcileSetup(t, scenario = 'ok') {
  const root = await mkdtemp(join(tmpdir(), 'unharness config reconcile '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const record = join(root, 'record.jsonl');
  return {
    root,
    record,
    run: values => mergeRetainedConfig({
      executable: process.execPath,
      executableArgs: [editorFixture, scenario, record],
      timeoutMs: SUBPROCESS_TIMEOUT_MS,
      ...values,
    }),
    events: async () => (await readFile(record, 'utf8')).trim().split('\n').map(JSON.parse),
  };
}

test('keeps the independently changed model while applying the selected Skill state', async t => {
  const ctx = await reconcileSetup(t);
  const originalPath = join(ctx.root, 'original.toml');
  const baseText = `model = "base"
[[skills.config]]
path = "${selectedPath}"
enabled = true
`;
  const targetText = baseText.replace('enabled = true', 'enabled = false');
  const currentText = baseText.replace('model = "base"', 'model = "current"');
  const expectedText = targetText.replace('model = "base"', 'model = "current"');
  await writeFile(originalPath, currentText);

  const result = await ctx.run({
    baseText,
    targetText,
    currentText,
    skillPaths: [selectedPath],
  });

  assert.deepEqual(result, { text: expectedText, changed: true, codexVersion: '0.153.4' });
  assert.equal(await readFile(originalPath, 'utf8'), currentText);
  const events = await ctx.events();
  const launches = events.filter(event => event.profile);
  const requests = events.filter(event => event.method);
  assert.ok(requests.every(request => ['initialize', 'initialized', 'config/read'].includes(request.method)));
  assert.equal(launches.length, 4);
  for (const launch of launches) await assert.rejects(stat(launch.profile), { code: 'ENOENT' });
});

test('restoring Normal after plugin removal merges adjacent deletions and verifies both semantic partitions', async t => {
  const ctx = await reconcileSetup(t);
  const common = 'model = "base"\n\n';
  // This small native-protocol fixture supports unquoted table keys. The real
  // quoted plugin identifier is covered by the Mac uninstall qualification.
  const plugin = '[plugins.unharness]\nenabled = true\n';
  const skill = `[[skills.config]]\npath = "${selectedPath}"\nenabled = false\n`;
  const result = await ctx.run({ baseText: common + plugin + '\n' + skill,
    targetText: common + plugin, currentText: common + skill, skillPaths: [selectedPath] });
  assert.equal(result.text, common);
  assert.equal(result.changed, true);
  assert.ok((await ctx.events()).filter(event => event.method).every(event => ['initialize', 'initialized', 'config/read'].includes(event.method)));
  // The same textual deletion merge cannot accept a changed selected flag.
  await assert.rejects(ctx.run({ baseText: common + plugin + '\n' + skill, targetText: common + plugin,
    currentText: common + skill.replace('enabled = false', 'enabled = true'), skillPaths: [selectedPath] }), { kind: 'config-transform-failed' });
});

test('preserves retained speed, memory, continuity, permissions, comments, CRLF, and EOF state', async t => {
  const ctx = await reconcileSetup(t);
  const baseText = '# retained settings\r\nmodel = "base"\r\nservice_tier = "flex"\r\napproval_policy = "on-request"\r\nsandbox_mode = "workspace-write"\r\n[memories]\r\nuse_memories = false\r\n[history]\r\npersistence = "save-all"\r\n\r\n# selected state\r\n[[skills.config]]\r\npath = "/skills/selected/SKILL.md"\r\nenabled = true';
  const targetText = baseText.replace('enabled = true', 'enabled = false');
  const currentText = baseText
    .replace('# retained settings', '# independently edited retained settings')
    .replace('model = "base"', 'model = "current"')
    .replace('service_tier = "flex"', 'service_tier = "fast"')
    .replace('approval_policy = "on-request"', 'approval_policy = "never"')
    .replace('sandbox_mode = "workspace-write"', 'sandbox_mode = "read-only"')
    .replace('use_memories = false', 'use_memories = true')
    .replace('persistence = "save-all"', 'persistence = "none"');
  const expectedText = currentText.replace('enabled = true', 'enabled = false');

  assert.deepEqual(await ctx.run({ baseText, targetText, currentText, skillPaths: [selectedPath] }), {
    text: expectedText,
    changed: true,
    codexVersion: '0.153.4',
  });
  assert.equal(expectedText.endsWith('\r\n'), false);
  assert.equal(expectedText.includes('\n') && !expectedText.replaceAll('\r\n', '').includes('\n'), true);
  const withFinalNewline = await ctx.run({
    baseText: `${baseText}\r\n`,
    targetText: `${targetText}\r\n`,
    currentText: `${currentText}\r\n`,
    skillPaths: [selectedPath],
  });
  assert.equal(withFinalNewline.text, `${expectedText}\r\n`);
});

test('keeps independent unselected entries in order while replacing complete duplicate selected entries', async t => {
  const ctx = await reconcileSetup(t);
  const baseText = `model = "base"
[[skills.config]]
path = "${selectedPath}"
enabled = true
extra = "first"
[[skills.config]]
path = "${selectedPath}"
enabled = true
extra = "second"
[[skills.config]]
path = "/skills/unselected-a/SKILL.md"
enabled = true
rank = 1
[[skills.config]]
path = "/skills/unselected-b/SKILL.md"
enabled = false
`;
  const targetText = baseText
    .replace(`path = "${selectedPath}"\nenabled = true\nextra = "first"`, `path = "${selectedPath}"\nenabled = false\nextra = "first"`)
    .replace(`path = "${selectedPath}"\nenabled = true\nextra = "second"`, `path = "${selectedPath}"\nenabled = false\nextra = "second"`);
  const currentText = baseText
    .replace('rank = 1', 'rank = 2')
    .replace('path = "/skills/unselected-b/SKILL.md"\nenabled = false', 'path = "/skills/unselected-b/SKILL.md"\nenabled = true');
  const expectedText = currentText
    .replace(`path = "${selectedPath}"\nenabled = true\nextra = "first"`, `path = "${selectedPath}"\nenabled = false\nextra = "first"`)
    .replace(`path = "${selectedPath}"\nenabled = true\nextra = "second"`, `path = "${selectedPath}"\nenabled = false\nextra = "second"`);

  assert.equal((await ctx.run({ baseText, targetText, currentText, skillPaths: [selectedPath] })).text, expectedText);
});

test('allows a selected entry to be introduced when it was originally absent', async t => {
  const ctx = await reconcileSetup(t);
  const baseText = 'model = "base"\nseparator = "keep"\n[after]\nanchor = "keep"\n';
  const targetText = `model = "base"\nseparator = "keep"\n[[skills.config]]\npath = "${selectedPath}"\nenabled = false\n[after]\nanchor = "keep"\n`;
  const currentText = 'model = "current"\nseparator = "keep"\n[after]\nanchor = "keep"\n';
  const expectedText = `model = "current"\nseparator = "keep"\n[[skills.config]]\npath = "${selectedPath}"\nenabled = false\n[after]\nanchor = "keep"\n`;
  assert.equal((await ctx.run({ baseText, targetText, currentText, skillPaths: [selectedPath] })).text, expectedText);
});

test('validates missing Skill arrays and the empty selected-path case through native reads', async t => {
  const ctx = await reconcileSetup(t);
  const baseText = 'model = "base"\n';
  const currentText = '# current exact bytes\r\nmodel = "current"';
  const result = await ctx.run({ baseText, targetText: baseText, currentText, skillPaths: [] });
  assert.deepEqual(result, { text: currentText, changed: false, codexVersion: '0.153.4' });
  assert.equal((await ctx.events()).filter(event => event.profile).length, 4);

  const invalid = await reconcileSetup(t);
  await assert.rejects(invalid.run({
    baseText: 'SECRET_MARKER = [\n',
    targetText: 'SECRET_MARKER = [\n',
    currentText: 'SECRET_MARKER = [\n',
    skillPaths: [],
  }), error => error.kind === 'config-transform-failed' && !String(error).includes('SECRET_MARKER'));
});

test('refuses retained target edits and selected current edits even when their text merges cleanly', async t => {
  const baseText = `model = "base"

[[skills.config]]
path = "${selectedPath}"
enabled = true
`;
  for (const values of [
    {
      targetText: baseText.replace('model = "base"', 'model = "target"'),
      currentText: baseText,
    },
    {
      targetText: baseText,
      currentText: baseText.replace('enabled = true', 'enabled = false'),
    },
  ]) {
    const ctx = await reconcileSetup(t);
    await assert.rejects(ctx.run({ baseText, ...values, skillPaths: [selectedPath] }), { kind: 'config-transform-failed' });
  }
});

test('refuses overlapping literal edits instead of emitting conflict markers', async t => {
  const ctx = await reconcileSetup(t);
  const baseText = `[[skills.config]]
path = "${selectedPath}"
enabled = true # base comment
`;
  const targetText = baseText.replace('enabled = true', 'enabled = false');
  const currentText = baseText.replace('# base comment', '# independently edited comment');
  await assert.rejects(ctx.run({ baseText, targetText, currentText, skillPaths: [selectedPath] }), { kind: 'config-transform-failed' });
  await assert.rejects(readFile(ctx.record, 'utf8'), { code: 'ENOENT' });
});

test('accepts safe numeric values but refuses numeric values that native JSON cannot represent safely', async t => {
  const safe = await reconcileSetup(t);
  const safeText = `revision = 42
[[skills.config]]
path = "${selectedPath}"
enabled = true
`;
  assert.equal((await safe.run({
    baseText: safeText,
    targetText: safeText.replace('enabled = true', 'enabled = false'),
    currentText: safeText,
    skillPaths: [selectedPath],
  })).text, safeText.replace('enabled = true', 'enabled = false'));

  const unsafe = await reconcileSetup(t);
  const unsafeText = safeText.replace('42', '9007199254740993');
  await assert.rejects(unsafe.run({
    baseText: unsafeText,
    targetText: unsafeText.replace('enabled = true', 'enabled = false'),
    currentText: unsafeText,
    skillPaths: [selectedPath],
  }), { kind: 'config-transform-failed' });
});

test('rejects null in selected metadata and nested retained configuration without exposing values', async t => {
  const cases = [
    {
      name: 'selected metadata',
      baseText: `[[skills.config]]
path = "${selectedPath}"
enabled = true
extra = null # private_marker
`,
      target(text) { return text.replace('enabled = true', 'enabled = false'); },
    },
    {
      name: 'nested retained configuration',
      baseText: `[retained.nested]
private_marker = null
[[skills.config]]
path = "${selectedPath}"
enabled = true
`,
      target(text) { return text.replace('enabled = true', 'enabled = false'); },
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async t => {
      const ctx = await reconcileSetup(t);
      await assert.rejects(ctx.run({
        baseText: fixture.baseText,
        targetText: fixture.target(fixture.baseText),
        currentText: fixture.baseText,
        skillPaths: [selectedPath],
      }), error => {
        assert.equal(error.kind, 'config-transform-failed');
        assert.equal(String(error).includes('private_marker'), false);
        return true;
      });
    });
  }
});

test('rejects invalid selector shapes without exposing configuration values', async t => {
  for (const invalidText of [
    'skills = false\n',
    '[skills]\nconfig = {}\n',
    '[skills]\nconfig = null\n',
    '[[skills.config]]\npath = "SECRET_MARKER"\n',
    '[[skills.config]]\npath = "SECRET_MARKER"\nenabled = "yes"\n',
  ]) {
    const ctx = await reconcileSetup(t);
    await assert.rejects(ctx.run({
      baseText: invalidText,
      targetText: invalidText,
      currentText: invalidText,
      skillPaths: [selectedPath],
    }), error => error.kind === 'config-transform-failed' && !String(error).includes('SECRET_MARKER'));
  }
});

test('rejects native version and user-layer disagreements and removes every started profile', async t => {
  const text = `model = "base"
[[skills.config]]
path = "${selectedPath}"
enabled = true
`;
  for (const scenario of ['version-disagreement', 'missing-user', 'duplicate-user', 'wrong-file', 'missing-layer-version', 'wrong-home', 'missing-version', 'rpc-error']) {
    await t.test(scenario, async t => {
      const ctx = await reconcileSetup(t, scenario);
      const currentText = scenario === 'version-disagreement' ? text.replace('model = "base"', 'model = "current"') : text;
      await assert.rejects(ctx.run({ baseText: text, targetText: text, currentText, skillPaths: [selectedPath] }), error => {
        assert.equal(error.kind, 'config-transform-failed');
        assert.equal(String(error).includes('SECRET_MARKER'), false);
        return true;
      });
      const launches = (await ctx.events()).filter(event => event.profile);
      assert.ok(launches.length > 0);
      for (const launch of launches) await assert.rejects(stat(launch.profile), { code: 'ENOENT' });
    });
  }
});

test('times out only its owned process and removes the private profile afterward', async t => {
  const ctx = await reconcileSetup(t, 'timeout');
  const text = 'model = "base"\n';
  await assert.rejects(ctx.run({
    baseText: text,
    targetText: text,
    currentText: text,
    skillPaths: [],
    timeoutMs: 300,
  }), { kind: 'config-transform-failed' });
  const [launch] = await ctx.events();
  assert.throws(() => process.kill(launch.pid, 0), { code: 'ESRCH' });
  await assert.rejects(stat(launch.profile), { code: 'ENOENT' });
});

test('rejects invalid arguments, per-input bounds, line bounds, and oversized merged output before launch', async t => {
  const valid = { baseText: '', targetText: '', currentText: '', skillPaths: [] };
  const tooManyLines = '\n'.repeat(4097);
  const mergeBase = 'start = "yes"\nmiddle = "yes"\nend = "yes"\n';
  const largeTarget = `start = "yes"\nextra_target = "${'t'.repeat(70_000)}"\nmiddle = "yes"\nend = "yes"\n`;
  const largeCurrent = `start = "yes"\nmiddle = "yes"\nextra_current = "${'c'.repeat(70_000)}"\nend = "yes"\n`;
  const manyTarget = `start = "yes"\n${'target = "yes"\n'.repeat(3000)}middle = "yes"\nend = "yes"\n`;
  const manyCurrent = `start = "yes"\nmiddle = "yes"\n${'current = "yes"\n'.repeat(3000)}end = "yes"\n`;
  const cases = [
    { ...valid, baseText: null },
    { ...valid, baseText: 'x'.repeat(128 * 1024 + 1) },
    { ...valid, targetText: tooManyLines },
    { ...valid, skillPaths: ['/same', '/same'] },
    { ...valid, skillPaths: ['relative/SKILL.md'] },
    { ...valid, skillPaths: [false] },
    { ...valid, skillPaths: Array.from({ length: 33 }, (_, index) => `/skill/${index}`) },
    { ...valid, executable: '' },
    { ...valid, executableArgs: 'bad' },
    { ...valid, executableArgs: [false] },
    { ...valid, timeoutMs: 0 },
    { ...valid, timeoutMs: Infinity },
    { baseText: mergeBase, targetText: largeTarget, currentText: largeCurrent, skillPaths: [] },
    { baseText: mergeBase, targetText: manyTarget, currentText: manyCurrent, skillPaths: [] },
  ];
  for (const values of cases) {
    const ctx = await reconcileSetup(t);
    await assert.rejects(ctx.run(values), { kind: 'config-transform-failed' });
    await assert.rejects(readFile(ctx.record, 'utf8'), { code: 'ENOENT' });
  }
  await assert.rejects(mergeRetainedConfig(), { kind: 'config-transform-failed' });
  await assert.rejects(mergeRetainedConfig(null), { kind: 'config-transform-failed' });
});
