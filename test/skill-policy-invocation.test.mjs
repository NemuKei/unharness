import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import {
  makeAutomaticSkillPolicy,
  makeManualSkillPolicy,
  readSkillInvocationPolicy,
} from '../src/sources/skill-policy.mjs';

test('invocation policy reader defaults to automatic and reads explicit booleans', async () => {
  for (const original of [null, '', '# comment only\n', 'interface: {display_name: Demo}\n', 'policy: {other: retained}\n']) {
    assert.equal(await readSkillInvocationPolicy(original), true);
  }
  assert.equal(await readSkillInvocationPolicy('policy: {allow_implicit_invocation: true}\n'), true);
  assert.equal(await readSkillInvocationPolicy('policy: {allow_implicit_invocation: false}\n'), false);
});

test('manual and automatic transforms can toggle the owned policy without losing metadata or comments', async () => {
  const original = '# retained heading\ninterface:\n  display_name: Demo\npolicy:\n  allow_implicit_invocation: true # retained policy comment\n  other: retained\nrevision: 9007199254740993\n';
  const manual = await makeManualSkillPolicy(original);
  const automatic = await makeAutomaticSkillPolicy(manual);
  const manualAgain = await makeManualSkillPolicy(automatic);

  assert.equal(await readSkillInvocationPolicy(manual), false);
  assert.equal(await readSkillInvocationPolicy(automatic), true);
  assert.deepEqual(parse(automatic, { intAsBigInt: true }), {
    interface: { display_name: 'Demo' },
    policy: { allow_implicit_invocation: true, other: 'retained' },
    revision: 9007199254740993n,
  });
  assert.match(automatic, /# retained heading/);
  assert.match(automatic, /# retained policy comment/);
  assert.equal(manualAgain, manual);
});

test('automatic transform preserves already-automatic bytes and normalizes null input to empty text', async () => {
  const absent = '# no policy edit\ninterface: {display_name: Demo}\n';
  const explicit = '# unchanged\r\npolicy: { allow_implicit_invocation: true }\r\n';
  const keyAbsent = 'policy:\n  other: retained # inline\n';

  assert.equal(await makeAutomaticSkillPolicy(null), '');
  assert.equal(await makeAutomaticSkillPolicy(absent), absent);
  assert.equal(await makeAutomaticSkillPolicy(explicit), explicit);
  assert.equal(await makeAutomaticSkillPolicy(keyAbsent), keyAbsent);
});

test('automatic transform changes only implicit invocation in tricky YAML', async () => {
  const original = '# top\ninterface: {display_name: "A: B"}\ndependencies:\n  tools:\n    - {type: mcp, value: example}\npolicy:\n  # before flag\n  allow_implicit_invocation: false # inline flag\n  other: [one, two]\n';
  const next = await makeAutomaticSkillPolicy(original);

  assert.deepEqual(parse(next), {
    interface: { display_name: 'A: B' },
    dependencies: { tools: [{ type: 'mcp', value: 'example' }] },
    policy: { allow_implicit_invocation: true, other: ['one', 'two'] },
  });
  for (const comment of ['# top', '# before flag', '# inline flag']) assert.match(next, new RegExp(comment));
});

test('all invocation policy operations reject unsafe input without exposing source text', async () => {
  const operations = [readSkillInvocationPolicy, makeManualSkillPolicy, makeAutomaticSkillPolicy];
  const unsupportedInputs = [
    'SECRET_MARKER: [\n',
    'one: value\none: SECRET_MARKER\n',
    'policy: false\n',
    'policy: null\n',
    'policy: {allow_implicit_invocation: yes}\n',
    '- SECRET_MARKER\n',
    'one: &shared {allow_implicit_invocation: true}\npolicy: *shared\n',
    'interface: !!str SECRET_MARKER\n',
    '---\na: value\n---\nb: SECRET_MARKER\n',
    '? [a, b]\n: SECRET_MARKER\n',
    1,
    `a: ${'x'.repeat(128 * 1024)}`,
  ];

  for (const operation of operations) {
    for (const original of unsupportedInputs) {
      await assert.rejects(operation(original), error => {
        assert.equal(error.kind, 'unsupported-skill-policy');
        assert.equal(String(error).includes('SECRET_MARKER'), false);
        assert.equal(JSON.stringify(error).includes('SECRET_MARKER'), false);
        assert.equal(Object.hasOwn(error, 'cause'), false);
        return true;
      });
    }
  }
});
