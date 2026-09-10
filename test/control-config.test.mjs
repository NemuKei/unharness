import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { preservesUnselectedConfig as preserves } from '../src/codex/control-config.mjs';
import { assertControlChanges } from '../src/setup/control-sources.mjs';

const path = '/fixture/optional/SKILL.md';
const entry = (p, enabled, extra = '') => `[[skills.config]]\npath = ${JSON.stringify(p)}\nenabled = ${enabled}\n${extra}`;
const base = 'model = "unchanged"\n[mcp_servers.unharness]\ncommand = "local-control"\n';
test('frozen selected enablement changes preserve every other setting without native tools', () => {
  for (const from of ['', entry(path, true), entry(path, false)]) {
    for (const to of ['', entry(path, true), entry(path, false)])
      assert.equal(preserves(base + from, base + to, [path]), true);
  }
  assert.equal(preserves(base, base + '[skills]\n' + entry(path, false), [path]), true);
  assert.equal(preserves('text = """# retained\n[[skills.config]]\n"""\n', 'text = """# retained\n[[skills.config]]\n"""\n' + entry(path, false), [path]), true);
});
test('an unregistered management path and MCP connection stay retained', () => {
  const manager = resolve('skills/unharness/SKILL.md');
  for (const sources of [[], [{ path: manager, id: 'legacy-manager' }], [{ path, id: 'optional' }]]) {
    const before = { config: { text: base } };
    for (const text of [base + entry(manager, false), base.replace('local-control', 'removed'), base.replace('[mcp_servers.unharness]\ncommand = "local-control"\n', '')])
      assert.throws(() => assertControlChanges({ sources, before, after: { config: { text } } }), { kind: 'setup-required-control' });
  }
});
test('quoted and escaped paths cannot turn another source into an optional target', () => {
  assert.equal(preserves('', `[["skills".'config']]\n"path" = '${path}'\nenabled = false\n`, [path]), true);
  const escaped = entry(path, false).replace('/fixture/', '\\u002ffixture/');
  assert.equal(preserves('', escaped, [path]), true);
  assert.equal(preserves('', escaped, ['/different/SKILL.md']), false);
  assert.equal(preserves('', entry('\\U0000002ffixture/optional/SKILL.md', false), [path]), false);
  assert.equal(preserves('', entry(path, false).replace('/fixture/', '\\U0000002ffixture/'), [path]), true);
});
test('invalid inputs and changes to retained settings fail closed', () => {
  for (const text of [
    `[[skills.config]]\npath = ${JSON.stringify(path)}\npath = "/other"\nenabled = false\n`,
    '[[skills.config]]\npath = "unterminated\n',
  ]) assert.equal(preserves('', text, [path]), false);
  assert.equal(preserves(base, base.replace('unchanged', 'changed') + entry(path, false), [path]), false);
  assert.equal(preserves(entry('/retained', true), entry('/retained', false), [path]), false);
});

test('native-supported inline tables and multiline strings keep frozen restores available', () => {
  const forms = enabled => [
    `skills.config = [{path = ${JSON.stringify(path)}, enabled = ${enabled}}]\n`,
    `[skills]\nconfig = [{path = ${JSON.stringify(path)}, enabled = ${enabled}}]\n`,
    `[[skills.config]]\npath = """${path}"""\nenabled = ${enabled}\n`,
    `[[skills.config]]\npath = '''${path}'''\nenabled = ${enabled}\n`,
  ];
  for (let i = 0; i < forms(true).length; i++) {
    assert.equal(preserves(forms(true)[i], forms(false)[i], [path]), true);
    assert.equal(preserves(forms(false)[i], forms(true)[i], [path]), true);
    assert.equal(preserves(forms(true)[i], forms(false)[i], []), false);
  }
});

test('unselected integer precision, types and selected-entry metadata remain protected', () => {
  assert.equal(preserves('retained = 9007199254740992\n', 'retained = 9007199254740993\n' + entry(path, false), [path]), false);
  assert.equal(preserves('retained = 1\n', 'retained = 1.0\n' + entry(path, false), [path]), false);
  assert.equal(preserves(entry(path, true, 'note = "saved"\n'), entry(path, false, 'note = "changed"\n'), [path]), false);
  assert.equal(preserves(entry(path, true, 'note = "saved"\n'), entry(path, false, 'note = "saved"\n'), [path]), true);
});
