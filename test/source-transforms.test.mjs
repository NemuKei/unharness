import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

const policyModule = () => import('../src/sources/skill-policy.mjs');

test('fixed guide identity hashes the published LF bytes and cannot be mutated between calls', async () => {
  const { getMinimalGuide } = await import('../src/sources/guide.mjs');
  const text = "# Minimal working guide\n\n- Follow the user's goal and the project's documented requirements.\n- Inspect the relevant code and project information before changing behavior.\n- Keep changes focused and preserve unrelated work.\n- Verify results with checks appropriate to the change, and identify what remains unverified.\n";
  const guide = getMinimalGuide();
  assert.equal(guide.id, 'unharness-minimal-v1');
  assert.equal(guide.text, text);
  assert.equal(guide.digest, createHash('sha256').update(text).digest('hex'));
  assert.equal(guide.reviewedOn, '2026-09-08');
  assert.equal(guide.references.length, 2);
  try { guide.references.pop(); } catch {}
  assert.equal(getMinimalGuide().references.length, 2);
});

test('manual policy changes only implicit invocation and retains comments and metadata', async () => {
  const { makeManualSkillPolicy } = await policyModule();
  const original = '# Keep this comment\ninterface:\n  display_name: Example\n  short_description: "A: B"\ndependencies:\n  tools:\n    - type: mcp\n      value: example\npolicy:\n  allow_implicit_invocation: true # policy comment\n  other: retained\n';
  const next = await makeManualSkillPolicy(original);
  assert.deepEqual(parse(next), { interface: { display_name: 'Example', short_description: 'A: B' }, dependencies: { tools: [{ type: 'mcp', value: 'example' }] }, policy: { allow_implicit_invocation: false, other: 'retained' } });
  assert.match(next, /# Keep this comment/);
  assert.match(next, /# policy comment/);
});

test('manual policy creates absent metadata and preserves already-manual bytes exactly', async () => {
  const { makeManualSkillPolicy } = await policyModule();
  for (const original of [null, '', '# comment only\n']) {
    assert.deepEqual(parse(await makeManualSkillPolicy(original)), { policy: { allow_implicit_invocation: false } });
  }
  const original = '# unchanged\r\npolicy: { allow_implicit_invocation: false }\r\n';
  assert.equal(await makeManualSkillPolicy(original), original);
  assert.deepEqual(parse(await makeManualSkillPolicy('interface: {display_name: Demo}\n')), { interface: { display_name: 'Demo' }, policy: { allow_implicit_invocation: false } });
});

test('unsupported metadata fails privately before a transform can be published', async () => {
  const { makeManualSkillPolicy } = await policyModule();
  for (const original of [
    'SECRET_MARKER: [\n', 'interface: one\ninterface: two\n',
    'policy: false\n', 'policy: null\n', 'policy: {allow_implicit_invocation: yes}\n',
    '- SECRET_MARKER\n', 'one: &shared {allow_implicit_invocation: true}\npolicy: *shared\n',
    'interface: !!str SECRET_MARKER\n', '---\na: b\n---\nc: d\n',
    '? [a, b]\n: SECRET_MARKER\n', 1, 'a: '.concat('x'.repeat(128 * 1024)),
  ]) {
    await assert.rejects(makeManualSkillPolicy(original), error => {
      assert.equal(error.kind, 'unsupported-skill-policy');
      assert.equal(String(error).includes('SECRET_MARKER'), false);
      return true;
    });
  }
});

import { mkdtemp, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBPROCESS_TIMEOUT_MS } from '../test-support/process-timeouts.mjs';
const editorFixture = fileURLToPath(new URL('./fixtures/config-editor-server.mjs', import.meta.url));
const configText = '# retained comment\nmodel = "example"\napproval_policy = "never"\nsandbox_mode = "read-only"\n[memories]\nuse_memories = false\n[hooks]\nenabled = true\n[[skills.config]]\npath = "/skills/selected/SKILL.md"\nenabled = true\nextra = "retained"\n[[skills.config]]\npath = "/skills/untouched/SKILL.md"\nenabled = true\n';
async function editorSetup(t, scenario = 'ok') {
  const root = await mkdtemp(join(tmpdir(), 'unharness editor test '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const record = join(root, 'record.jsonl');
  const original = join(root, 'original.toml');
  await writeFile(original, configText);
  const { disableSkillConfig } = await import('../src/codex/config-editor.mjs');
  return {
    run: overrides => disableSkillConfig({ configText, skillPaths: ['/skills/selected/SKILL.md', '/skills/new/SKILL.md'], executable: process.execPath, executableArgs: [editorFixture, scenario, record], timeoutMs: SUBPROCESS_TIMEOUT_MS, ...overrides }),
    events: async () => (await readFile(record, 'utf8')).trim().split('\n').map(JSON.parse),
    original,
  };
}

test('owned native editor disables only selected exact paths with guarded fixed RPC writes', async t => {
  const ctx = await editorSetup(t);
  const result = await ctx.run();
  assert.equal(result.changed, true);
  assert.equal(result.codexVersion, '0.153.4');
  assert.match(result.text, /^# retained comment/);
  assert.equal(await readFile(ctx.original, 'utf8'), configText);
  const [launch, ...messages] = await ctx.events();
  assert.equal(launch.initial, configText);
  assert.notEqual(launch.profile, process.env.CODEX_HOME);
  await assert.rejects(stat(launch.profile), { code: 'ENOENT' });
  assert.deepEqual(messages.filter(m => m.method).map(m => m.method), ['initialize', 'initialized', 'config/read', 'config/batchWrite', 'config/read']);
  const write = messages.find(m => m.method === 'config/batchWrite');
  assert.deepEqual(write.params, { filePath: join(launch.profile, 'config.toml'), expectedVersion: 'v1', reloadUserConfig: false, edits: [{ keyPath: 'skills.config', mergeStrategy: 'replace', value: [{ path: '/skills/selected/SKILL.md', enabled: false, extra: 'retained' }, { path: '/skills/untouched/SKILL.md', enabled: true }, { path: '/skills/new/SKILL.md', enabled: false }] }] });
  assert.deepEqual(messages.find(m => m.id === 'inbound').error, { code: -32601, message: 'Method not found' });
});

test('already disabled selections retain original bytes and send no write; empty selection does not start native editor', async t => {
  const ctx = await editorSetup(t);
  const original = configText.replace('path = "/skills/selected/SKILL.md"\nenabled = true', 'path = "/skills/selected/SKILL.md"\nenabled = false');
  const result = await ctx.run({ configText: original, skillPaths: ['/skills/selected/SKILL.md'] });
  assert.equal(result.text, original);
  assert.equal(result.changed, false);
  assert.equal((await ctx.events()).some(m => m.method === 'config/batchWrite'), false);
  assert.deepEqual(await ctx.run({ skillPaths: [], executable: 'missing' }), { text: configText, changed: false, codexVersion: null });
});

test('native editor rejects invalid controls, hides remote errors, and rejects changed protected values', async t => {
  for (const scenario of ['rpc-error', 'stale', 'missing-user', 'tamper-retained', 'tamper-selected', 'drop-comments']) await t.test(scenario, async t => {
    const ctx = await editorSetup(t, scenario);
    await assert.rejects(ctx.run(), error => {
      assert.equal(error.kind, 'config-transform-failed');
      assert.equal(String(error).includes('SECRET_MARKER'), false);
      assert.equal(JSON.stringify(error).includes('SECRET_MARKER'), false);
      return true;
    });
    const [launch] = await ctx.events();
    await assert.rejects(stat(launch.profile), { code: 'ENOENT' });
    assert.equal(await readFile(ctx.original, 'utf8'), configText);
  });
});

test('native editor times out and removes its owned profile only after its child is gone', async t => {
  const ctx = await editorSetup(t, 'timeout');
  await assert.rejects(ctx.run({ timeoutMs: 300 }), { kind: 'config-transform-failed' });
  const [launch] = await ctx.events();
  assert.throws(() => process.kill(launch.pid, 0), { code: 'ESRCH' });
  await assert.rejects(stat(launch.profile), { code: 'ENOENT' });
});

test('invalid selections and oversized input are rejected before any native process starts', async t => {
  const ctx = await editorSetup(t);
  for (const overrides of [
    { configText: null }, { configText: 'x'.repeat(128 * 1024 + 1) },
    { skillPaths: ['/same', '/same'] }, { skillPaths: ['relative/SKILL.md'] },
    { skillPaths: [false] }, { skillPaths: Array.from({ length: 33 }, (_, i) => `/skill/${i}`) },
    { timeoutMs: Infinity },
  ]) await assert.rejects(ctx.run(overrides), { kind: 'config-transform-failed' });
  await assert.rejects(ctx.events(), { code: 'ENOENT' });
});

test('manual policy retains large integer metadata without rounding', async () => {
  const { makeManualSkillPolicy } = await policyModule();
  const next = await makeManualSkillPolicy('interface: {display_name: Demo}\nrevision: 9007199254740993\n');
  assert.match(next, /revision: 9007199254740993/);
});

test('TOML comment guard refuses dropped array comments but treats quoted hashes as data', async () => {
  const { preservesTomlComments } = await import('../src/codex/toml-comments.mjs');
  const input = '# leading comment\n[[skills.config]] # array comment\npath = "/skill/#example/SKILL.md" # path comment\nenabled = true # enabled comment\n';
  assert.equal(preservesTomlComments(input, '[skills]\nconfig = []\n'), false);
  assert.equal(preservesTomlComments(input, input.replace('enabled = true', 'enabled = false')), true);
  const quoted = 'basic = "a # data \\" # still data"\nliteral = \'# data\'\nmultibasic = """\n# data\n\\"quoted\\"\n"""\nmultiliteral = \'\'\'\n# data\n\'\'\'\n';
  assert.equal(preservesTomlComments(quoted, ''), true);
  assert.equal(preservesTomlComments('x = "unterminated\n# ambiguous', ''), false);
  assert.equal(preservesTomlComments('# repeat\n# repeat\n', '# repeat\n'), false);
});
