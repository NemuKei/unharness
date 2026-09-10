import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  assertReproducibleNumbers,
  readSkillOverrides,
  setSkillOverrides,
  validSkillName
} from '../src/claude/settings.mjs';
import { mergeRetainedSettings, partition } from '../src/claude/settings-reconcile.mjs';
import * as service from '../src/sources/service.mjs';
import { createOwnedClaudeProfile } from '../src/claude/owned-profile.mjs';

const darwin = process.platform === 'darwin';

test('a retained number the parser cannot reproduce blocks the rewrite', () => {
  // JSON.parse rounds this literal before any before/after comparison runs, so
  // a parsed round trip cannot prove the value survived. Regression for a
  // rewrite that silently changed 9007199254740993 to ...992.
  const source =
    '{"retainedCounter":9007199254740993,"permissions":{"defaultMode":"plan"}}';
  assert.throws(() => setSkillOverrides(source, ['fixture-skill'], 'off'), {
    kind: 'config-transform-failed'
  });
  assert.throws(() => readSkillOverrides(source), {
    kind: 'config-transform-failed'
  });
  assert.throws(
    () =>
      mergeRetainedSettings({
        baseText: source,
        targetText: source,
        currentText: source,
        skillNames: ['fixture-skill']
      }),
    { kind: 'config-transform-failed' }
  );
});

test('only a literal this process reproduces byte for byte is accepted', () => {
  for (const literal of [
    '9007199254740993',
    '-9007199254740993',
    '1e2',
    '1.0',
    '-0',
    '1E+3',
    '0.30000000000000004000'
  ])
    assert.throws(
      () => assertReproducibleNumbers(`{"a":${literal}}`),
      { kind: 'config-transform-failed' },
      literal
    );
  for (const literal of ['0', '-1', '30', '0.5', '9007199254740991', '1.25'])
    assert.doesNotThrow(() => assertReproducibleNumbers(`{"a":${literal}}`), literal);
  // Digits inside a string value are not number literals.
  assert.doesNotThrow(() =>
    assertReproducibleNumbers('{"note":"build 1e2 and 9007199254740993"}')
  );
});

test('an unrelated key keeps its value, type and position', () => {
  const source = [
    '{',
    '  "permissions": { "allow": ["Bash(ls:*)"], "deny": [] },',
    '  "cleanupPeriodDays": 30,',
    '  "skillOverrides": { "other": "name-only" },',
    '  "autoMemoryEnabled": false',
    '}',
    ''
  ].join('\n');
  const next = setSkillOverrides(source, ['selected'], 'user-invocable-only');
  const before = JSON.parse(source);
  const after = JSON.parse(next);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  assert.deepEqual(after.permissions, before.permissions);
  assert.equal(after.cleanupPeriodDays, 30);
  assert.equal(after.autoMemoryEnabled, false);
  assert.equal(after.skillOverrides.other, 'name-only');
  assert.equal(after.skillOverrides.selected, 'user-invocable-only');
  // Setting a value that is already present rewrites nothing.
  assert.equal(setSkillOverrides(next, ['selected'], 'user-invocable-only'), next);
});

test('an unusable settings document is refused rather than repaired', () => {
  for (const source of [
    '[]',
    '{"a":1,"a":2}',
    '{"skillOverrides":[]}',
    '{"skillOverrides":{"x":"maybe"}}',
    '{"skillOverrides":{"has space":"off"}}',
    '{"__proto__":{"polluted":true}}',
    'not json'
  ])
    assert.throws(() => setSkillOverrides(source, ['x'], 'off'), {
      kind: 'config-transform-failed'
    }, source);
  assert.equal(validSkillName('plugin:name'), true);
  assert.equal(validSkillName('with space'), false);
});

test('the managed and retained halves of a document are separated exactly', () => {
  const settings = {
    autoMemoryEnabled: true,
    skillOverrides: { selected: 'off', other: 'on' }
  };
  const parts = partition(settings, ['selected']);
  assert.deepEqual(parts.selected, { selected: 'off' });
  assert.deepEqual(parts.unselected, { other: 'on' });
  assert.deepEqual(parts.retained, {
    autoMemoryEnabled: true,
    skillOverrides: { other: 'on' }
  });
  // With no unselected entry left, the key disappears from the retained half.
  assert.deepEqual(partition({ skillOverrides: { selected: 'off' } }, ['selected']).retained, {});
});

test('a retained edit composes with the target managed state', () => {
  const base = '{"cleanupPeriodDays":30,"skillOverrides":{"s":"off"}}';
  const target = '{"cleanupPeriodDays":30,"skillOverrides":{"s":"user-invocable-only"}}';
  const current = '{"cleanupPeriodDays":45,"skillOverrides":{"s":"off"}}';
  const merged = mergeRetainedSettings({
    baseText: base,
    targetText: target,
    currentText: current,
    skillNames: ['s']
  });
  const value = JSON.parse(merged.text);
  assert.equal(value.cleanupPeriodDays, 45, 'the independent edit wins');
  assert.equal(value.skillOverrides.s, 'user-invocable-only', 'the target managed state wins');
  // An edit that touched the managed half is not a retained-only change.
  assert.throws(
    () =>
      mergeRetainedSettings({
        baseText: base,
        targetText: target,
        currentText: '{"cleanupPeriodDays":30,"skillOverrides":{"s":"on"}}',
        skillNames: ['s']
      }),
    { kind: 'config-transform-failed' }
  );
});

test('a settings file this process cannot rewrite blocks registration', async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-num-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedClaudeProfile({
    parent,
    settings: '{\n  "retainedCounter": 9007199254740993\n}\n'
  });
  const discovered = await service.discoverUserSources(owned.context);
  assert.equal(discovered.registrationAvailable, false);
  assert.ok(
    discovered.unavailableSources.some(
      (u) => u.id === 'settings' && u.reason === 'config-transform-failed'
    ),
    JSON.stringify(discovered.unavailableSources)
  );
  await assert.rejects(
    service.registerUserSources({
      context: owned.context,
      discoveryId: discovered.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: [],
      userAddedOptional: true
    }),
    { kind: 'unsupported-source' }
  );
  // The refused file is left exactly as the user wrote it.
  assert.equal(
    await readFile(join(owned.context.claudeHome, 'settings.json'), 'utf8'),
    '{\n  "retainedCounter": 9007199254740993\n}\n'
  );
});

test('a sequential replay is refused for Claude with its own reason', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-replay-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedClaudeProfile({ parent });
  const discovered = await service.discoverUserSources(owned.context);
  const { workspace } = await service.registerUserSources({
    context: owned.context,
    discoveryId: discovered.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: [],
    userAddedOptional: true
  });

  // Saved starting conditions are application neutral and stay available.
  await writeFile(join(owned.context.project, 'input.txt'), 'PRIVATE_TEST input\n', {
    mode: 0o600
  });
  const review = await service.reviewUserStart({
    workspace,
    declaration: {
      title: 'Synthetic start',
      request: 'Describe the input file.',
      requirements: [{ id: 'r1', label: 'Mentions the file', critical: true }],
      ratings: [],
      budget: { maxAttempts: 2, maxTurnsPerAttempt: 10, maxRecordedTokens: null }
    },
    additionalPaths: ['input.txt']
  });
  const saved = await service.saveUserStart({ workspace, reviewId: review.reviewId });
  assert.ok(saved.startId);
  const listed = await service.listUserStarts({ workspace });
  assert.equal(listed.starts.length, 1);

  // The replay itself is refused, and the refusal is specific.
  await assert.rejects(
    service.reviewUserReplay({ workspace, startId: saved.startId }),
    { kind: 'replay-application-unsupported' }
  );
  const { applicationById } = await import('../src/apps/index.mjs');
  const support = applicationById('claude').sequentialReplay;
  assert.equal(support.supported, false);
  assert.match(support.reason, /no local runtime conditions report/);
  assert.equal(applicationById('codex').sequentialReplay.supported, true);
});

test('a higher-precedence override wins in both directions and blocks control', async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-prec-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  for (const [label, user, project, local, expectedEnabled] of [
    // The project layer turns off a Skill the user layer turns on.
    ['off over on', '"on"', '"off"', null, false],
    // ...and the reverse: a local layer turns on what the user layer turned off.
    ['on over off', '"off"', null, '"on"', true],
    // A shared project layer alone is still above the user layer.
    ['project over user', '"user-invocable-only"', '"on"', null, true]
  ]) {
    const owned = await createOwnedClaudeProfile({
      parent,
      settings: `{\n  "skillOverrides": { "example": ${user} }\n}\n`,
      projectSettings:
        project === null ? null : `{\n  "skillOverrides": { "example": ${project} }\n}\n`,
      projectLocalSettings:
        local === null ? null : `{\n  "skillOverrides": { "example": ${local} }\n}\n`
    });
    const d = await service.discoverUserSources(owned.context);
    const skill = d.skills.find((x) => x.label === 'example');
    assert.equal(skill.enabled, expectedEnabled, `${label}: effective state`);
    assert.equal(skill.eligible, false, `${label}: not controllable`);
    assert.equal(skill.reason, 'skill-override-shadowed', label);
    assert.equal(skill.availability.unseal, false, label);
    assert.equal(skill.availability.trueform, false, label);
    assert.ok(
      d.notices.some((n) => n.kind === 'higher-precedence-settings'),
      `${label}: the shadowing layer is visible`
    );
    await assert.rejects(
      service.registerUserSources({
        context: owned.context,
        discoveryId: d.discoveryId,
        instructionsOptional: true,
        selectedSkillIds: [skill.id],
        userAddedOptional: true
      }),
      { kind: 'unsupported-source' },
      label
    );
  }
});

test('a worktree reads its local settings from the main checkout root', async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-wt-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const { mkdir } = await import('node:fs/promises');
  const main = join(parent, 'main-checkout');
  await mkdir(join(main, '.claude'), { recursive: true, mode: 0o700 });
  await writeFile(
    join(main, '.claude', 'settings.local.json'),
    '{\n  "skillOverrides": { "example": "off" }\n}\n',
    { mode: 0o600 }
  );
  const owned = await createOwnedClaudeProfile({
    parent,
    settings: '{\n  "skillOverrides": { "example": "on" }\n}\n',
    worktreeOf: main
  });
  const d = await service.discoverUserSources(owned.context);
  const skill = d.skills.find((x) => x.label === 'example');
  assert.equal(skill.enabled, false, 'the main checkout local file wins');
  assert.equal(skill.reason, 'skill-override-shadowed');
  assert.ok(d.notices.some((n) => n.id === 'worktree-local-settings'));
});

test('an override added after registration invalidates the plan', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-shadow-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedClaudeProfile({ parent });
  const d = await service.discoverUserSources(owned.context);
  const skill = d.skills.find((x) => x.label === 'example');
  assert.equal(skill.eligible, true);
  const { workspace } = await service.registerUserSources({
    context: owned.context,
    discoveryId: d.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: [skill.id],
    userAddedOptional: true
  });
  const first = await service.planUserMode({ workspace, mode: 'unseal' });
  assert.ok(first.planId);

  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(owned.context.project, '.claude'), { recursive: true, mode: 0o700 });
  await writeFile(
    join(owned.context.project, '.claude', 'settings.local.json'),
    '{\n  "skillOverrides": { "example": "on" }\n}\n',
    { mode: 0o600 }
  );
  // A user-layer write could no longer take effect, so no release mode plans.
  for (const mode of ['unseal', 'trueform'])
    await assert.rejects(service.planUserMode({ workspace, mode }), {
      kind: 'stale-discovery'
    });
  await assert.rejects(
    service.applyUserPlan({ workspace, planId: first.planId }),
    { kind: 'stale-discovery' }
  );
  // Returning to the saved Normal never depends on the application catalog.
  const normal = await service.planUserMode({ workspace, mode: 'normal' });
  assert.equal(normal.mode, 'normal');
});

test('an unreadable higher-precedence layer blocks registration', async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-bad-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedClaudeProfile({
    parent,
    projectSettings: '{ this is not json'
  });
  const d = await service.discoverUserSources(owned.context);
  assert.equal(d.registrationAvailable, false);
  assert.ok(
    d.unavailableSources.some((u) => u.id === 'project-settings'),
    JSON.stringify(d.unavailableSources)
  );
});
