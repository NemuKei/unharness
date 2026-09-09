import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';

import * as service from '../src/sources/service.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { loadSnapshot, openWorkspace } from '../src/sources/records.mjs';
import {
  createOwnedClaudeProfile,
  readClaudeProfileFiles,
  writeOwnedClaudeSession,
  OWNED_DESKTOP_VERSION
} from '../src/claude/owned-profile.mjs';
import { getMinimalGuide } from '../src/sources/guide.mjs';

const darwin = process.platform === 'darwin';
const INERT = '<!-- -->\n';

async function setup(t, options = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedClaudeProfile({ parent, ...options });
  return { parent, ...owned };
}

async function register(s, overrides = {}) {
  const d = await service.discoverUserSources(s.context);
  const skillIds = d.skills.filter((x) => x.eligible).map((x) => x.id);
  const registered = await service.registerUserSources({
    context: s.context,
    discoveryId: d.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: skillIds,
    userAddedOptional: true,
    ...overrides
  });
  const w = await openWorkspace(registered.workspace);
  return { discovery: d, ...registered, reg: w.reg, w };
}

async function prepare(s, workspace, mode) {
  const plan = await service.planUserMode({ workspace, mode });
  const applied = await service.applyUserPlan({ workspace, planId: plan.planId });
  return { plan, applied };
}

const settingsOf = async (context) =>
  JSON.parse(await readFile(join(context.claudeHome, 'settings.json'), 'utf8'));

test('discovery reports the Claude source layout, desktop version and unmanaged sources', async (t) => {
  const s = await setup(t, { rules: true });
  const d = await service.discoverUserSources(s.context);
  assert.equal(d.application, 'claude');
  assert.equal(d.applicationLabel, 'Claude Code');
  assert.equal(d.registrationAvailable, true);
  assert.equal(d.instructions.path, join(s.context.claudeHome, 'CLAUDE.md'));
  assert.equal(d.instructions.effective, 'instructions');
  assert.equal(d.instructions.eligible, darwin);
  const example = d.skills.find((x) => x.label === 'example');
  assert.ok(example, 'the personal Skill is discovered');
  assert.equal(example.scope, 'user');
  assert.equal(example.enabled, true);
  assert.equal(example.eligible, darwin);
  // Unmanaged user-scope instruction sources stay visible.
  const rules = d.notices.find((n) => n.id === 'user-rules');
  assert.ok(rules && rules.count === 1, 'user rules are surfaced as unmanaged');
  assert.ok(
    d.limitations.includes(
      'catalog read from the documented on-disk layout, not from the running runtime'
    )
  );
  assert.deepEqual(d.verification, {
    runtimeStateVerified: false,
    modeSwitchingVerified: false,
    sourceCoverage: 'unknown',
    nextTaskRequired: true
  });
});

test('a Skill name shared by two scopes is not addressable through settings', async (t) => {
  const s = await setup(t, {
    extraSkills: [
      {
        name: 'example',
        scope: 'repo',
        body: '---\nname: example\ndescription: Colliding project Skill\n---\n\nBody.\n'
      }
    ]
  });
  const d = await service.discoverUserSources(s.context);
  const colliding = d.skills.filter((x) => x.label === 'example');
  assert.equal(colliding.length, 2);
  for (const skill of colliding) {
    assert.equal(skill.eligible, false);
    assert.equal(skill.reason, 'skill-name-not-addressable');
  }
});

test('a plugin Skill is reported as a retained provider source, never selectable', async (t) => {
  const s = await setup(t);
  const pluginSkill = join(
    s.context.claudeHome,
    'plugins',
    'market',
    'demo',
    'skills',
    'helper'
  );
  await mkdir(pluginSkill, { recursive: true, mode: 0o700 });
  await writeFile(
    join(pluginSkill, 'SKILL.md'),
    '---\nname: helper\ndescription: Plugin owned\n---\n\nBody.\n',
    { mode: 0o600 }
  );
  const d = await service.discoverUserSources(s.context);
  const plugin = d.skills.find((x) => x.label === 'demo:helper');
  assert.ok(plugin);
  assert.equal(plugin.scope, 'plugin');
  assert.equal(plugin.eligible, false);
  assert.equal(plugin.reason, 'provider-managed-or-outside-owned-profile');
  assert.ok(d.notices.some((n) => n.id === 'plugin-skills' && n.count === 1));
});

test('a symlinked Skill directory is reported unavailable instead of silently followed', async (t) => {
  const s = await setup(t);
  const real = join(s.parent, 'external-skill');
  await mkdir(real, { recursive: true, mode: 0o700 });
  await writeFile(
    join(real, 'SKILL.md'),
    '---\nname: linked\ndescription: Outside the profile\n---\n\nBody.\n',
    { mode: 0o600 }
  );
  await symlink(real, join(s.context.claudeHome, 'skills', 'linked'));
  const d = await service.discoverUserSources(s.context);
  const linked = d.skills.find((x) => x.label === 'linked');
  assert.ok(linked, 'the link is listed rather than omitted');
  assert.equal(linked.eligible, false);
  assert.equal(linked.reason, 'source-redirection');
});

test('registration requires an explicit optional-role declaration', async (t) => {
  const s = await setup(t);
  const d = await service.discoverUserSources(s.context);
  await assert.rejects(
    service.registerUserSources({
      context: s.context,
      discoveryId: d.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: [],
      userAddedOptional: false
    }),
    { kind: 'optional-role-required' }
  );
  await assert.rejects(
    service.registerUserSources({
      context: s.context,
      discoveryId: d.discoveryId,
      instructionsOptional: false,
      selectedSkillIds: [],
      userAddedOptional: true
    }),
    { kind: 'optional-role-required' }
  );
});

test('discovery identity changes when a registered source changes', async (t) => {
  const s = await setup(t);
  const first = await service.discoverUserSources(s.context);
  await writeFile(join(s.context.claudeHome, 'CLAUDE.md'), '# changed\n', {
    mode: 0o600
  });
  const second = await service.discoverUserSources(s.context);
  assert.notEqual(first.discoveryId, second.discoveryId);
  await assert.rejects(
    service.registerUserSources({
      context: s.context,
      discoveryId: first.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: [],
      userAddedOptional: true
    }),
    { kind: 'stale-discovery' }
  );
});

test('SKILL.md is registered as a guarded source and is never a control target', async (t) => {
  if (!darwin) return t.skip('registration admission is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  const { application } = await import('../src/apps/claude.mjs');
  const keys = Object.keys(application.pathsFor(r.reg));
  assert.ok(keys.includes('instructions') && keys.includes('settings'));
  const bodyKey = keys.find((k) => k.endsWith(':body'));
  assert.ok(bodyKey, 'the Skill body is captured');
  assert.deepEqual(application.controlKeys(r.reg).sort(), [
    'instructions',
    'settings'
  ]);
  assert.ok(
    !application.controlKeys(r.reg).some((k) => k.endsWith(':body')),
    'a Skill body can never be written'
  );
});

test('UNSEAL substitutes the fixed guide and makes the selected Skill manual only', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  const { plan } = await prepare(s, r.workspace, 'unseal');
  assert.equal(plan.guide.id, 'unharness-minimal-v1');
  assert.equal(plan.guide.digest, getMinimalGuide().digest);
  assert.deepEqual(plan.changedFiles.map((f) => f.id).sort(), [
    'instructions',
    'settings'
  ]);
  assert.equal(
    await readFile(join(s.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    getMinimalGuide().text
  );
  const settings = await settingsOf(s.context);
  assert.equal(settings.skillOverrides.example, 'user-invocable-only');
  // Unrelated settings survive.
  assert.equal(settings.autoMemoryEnabled, true);
  assert.equal(settings.cleanupPeriodDays, 30);
  // The Skill body and the project instructions are untouched.
  const now = await readClaudeProfileFiles(s.context);
  assert.deepEqual(now.skill, s.originalFiles.skill);
  assert.deepEqual(now.project, s.originalFiles.project);
});

test('TRUEFORM disables the selected Skill and leaves an inert instruction file', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'trueform');
  assert.equal(
    await readFile(join(s.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    INERT
  );
  assert.equal((await settingsOf(s.context)).skillOverrides.example, 'off');
  const state = await service.userSourceState({ workspace: r.workspace });
  assert.equal(state.preparedMode, 'trueform');
  assert.equal(state.verification.runtimeStateVerified, false);
  assert.equal(state.verification.modeSwitchingVerified, false);
});

test('every mode compiles from the saved Normal and returns exact original bytes', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  for (const mode of ['unseal', 'trueform', 'unseal', 'normal']) {
    await prepare(s, r.workspace, mode);
  }
  assert.deepEqual(await readClaudeProfileFiles(s.context), s.originalFiles);
  const w = await openWorkspace(r.workspace);
  assert.deepEqual(
    await captureRegistered(w.reg),
    await loadSnapshot(r.workspace, w.reg, w.reg.normalId)
  );
});

test('an absent settings file is created and removed again by Normal', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t, { settings: null });
  const r = await register(s);
  assert.equal(s.originalFiles.settings, null);
  await prepare(s, r.workspace, 'trueform');
  assert.equal((await settingsOf(s.context)).skillOverrides.example, 'off');
  await prepare(s, r.workspace, 'normal');
  assert.deepEqual(await readClaudeProfileFiles(s.context), s.originalFiles);
});

test('an unselected override entry is preserved through every mode', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t, {
    settings:
      '{\n  "skillOverrides": {\n    "someone-elses": "name-only"\n  },\n  "autoMemoryEnabled": false\n}\n'
  });
  const r = await register(s);
  for (const mode of ['unseal', 'trueform']) {
    await prepare(s, r.workspace, mode);
    const settings = await settingsOf(s.context);
    assert.equal(settings.skillOverrides['someone-elses'], 'name-only');
    assert.equal(settings.autoMemoryEnabled, false);
  }
  await prepare(s, r.workspace, 'normal');
  assert.deepEqual(await readClaudeProfileFiles(s.context), s.originalFiles);
});

test('a Skill already withdrawn from the model stays withdrawn in UNSEAL', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t, {
    extraSkills: [
      {
        name: 'manual',
        scope: 'user',
        body:
          '---\nname: manual\ndescription: Already manual\ndisable-model-invocation: true\n---\n\nBody.\n'
      }
    ]
  });
  const d = await service.discoverUserSources(s.context);
  const manual = d.skills.find((x) => x.label === 'manual');
  assert.equal(manual.enabled, false);
  assert.equal(manual.availability.unseal, true);
  const r = await register(s);
  const { plan } = await prepare(s, r.workspace, 'unseal');
  const state = plan.skillStates.find((x) => x.id === manual.id);
  assert.equal(state.manualOnly, false, 'no manual claim for an already-manual Skill');
  const settings = await settingsOf(s.context);
  assert.equal(
    settings.skillOverrides.manual,
    undefined,
    'an already-manual Skill needs no override'
  );
});

test('an independent edit blocks planning and is never overwritten', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  const edited = '# edited by someone else\n';
  await writeFile(join(s.context.claudeHome, 'CLAUDE.md'), edited, { mode: 0o600 });
  await assert.rejects(
    service.planUserMode({ workspace: r.workspace, mode: 'unseal' }),
    { kind: 'source-conflict' }
  );
  assert.equal(
    await readFile(join(s.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    edited
  );
  const state = await service.userSourceState({ workspace: r.workspace });
  assert.equal(state.conflict.kind, 'source-conflict');
});

test('a favorite restores its saved selected state exactly', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'unseal');
  const unsealFiles = await readClaudeProfileFiles(s.context);
  const favorite = await service.saveUserFavorite({
    workspace: r.workspace,
    name: 'Manual guide'
  });
  await prepare(s, r.workspace, 'normal');
  assert.deepEqual(await readClaudeProfileFiles(s.context), s.originalFiles);
  const plan = await service.planUserFavorite({
    workspace: r.workspace,
    favoriteId: favorite.favoriteId
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: plan.planId });
  assert.deepEqual(await readClaudeProfileFiles(s.context), unsealFiles);
  const list = await service.listUserFavorites({ workspace: r.workspace });
  assert.equal(list.favorites.length, 1);
  assert.equal(list.favorites[0].preparedMode, 'unseal');
});

test('a checkpoint undoes the last application', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  const { applied } = await prepare(s, r.workspace, 'trueform');
  const plan = await service.planUserCheckpoint({
    workspace: r.workspace,
    checkpointId: applied.checkpointId
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: plan.planId });
  assert.deepEqual(await readClaudeProfileFiles(s.context), s.originalFiles);
});

test('a duplicate apply of the same plan returns the first result without rewriting', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  const plan = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  const first = await service.applyUserPlan({
    workspace: r.workspace,
    planId: plan.planId
  });
  const second = await service.applyUserPlan({
    workspace: r.workspace,
    planId: plan.planId
  });
  assert.equal(second.duplicate, true);
  assert.equal(second.revision, first.revision);
  assert.equal(second.checkpointId, first.checkpointId);
});

test('a changed desktop version invalidates a release-mode plan', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await writeFile(
    join(s.context.appBundle, 'Contents', 'Info.plist'),
    (
      await readFile(join(s.context.appBundle, 'Contents', 'Info.plist'), 'utf8')
    ).replaceAll(OWNED_DESKTOP_VERSION, '1.50000.0'),
    { mode: 0o600 }
  );
  await assert.rejects(
    service.planUserMode({ workspace: r.workspace, mode: 'unseal' }),
    { kind: 'stale-discovery' }
  );
  // Returning to the saved Normal never depends on the application.
  const normal = await service.planUserMode({ workspace: r.workspace, mode: 'normal' });
  assert.equal(normal.mode, 'normal');
});

test('a second workspace cannot capture an already registered profile', async (t) => {
  if (!darwin) return t.skip('registration admission is macOS-only');
  const s = await setup(t);
  await register(s);
  const d = await service.discoverUserSources(s.context);
  await assert.rejects(
    service.registerUserSources({
      context: s.context,
      discoveryId: d.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: [],
      userAddedOptional: true
    }),
    { kind: 'profile-owned' }
  );
});

test('the located workspace resolves from the registered Claude home', async (t) => {
  if (!darwin) return t.skip('registration admission is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  const located = await service.locateUserSources({ context: s.context });
  assert.equal(located.workspace, r.workspace);
  assert.deepEqual(located.context, s.context);
});

test('reviewing a registered source returns only its own escaped text', async (t) => {
  if (!darwin) return t.skip('registration admission is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  const review = await service.reviewUserSource({
    workspace: r.workspace,
    sourceId: r.reg.instructions.id
  });
  assert.match(review.text, /PRIVATE_TEST optional user guide/);
  await assert.rejects(
    service.reviewUserSource({ workspace: r.workspace, sourceId: 'skill-' + '0'.repeat(64) }),
    { kind: 'invalid-request' }
  );
});

test('a fresh desktop task records the prepared UNSEAL state', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'unseal');
  const taskId = '11111111-2222-4333-8444-555555555555';
  await writeOwnedClaudeSession(s.context, {
    sessionId: taskId,
    instructionFiles: [
      {
        path: join(s.context.claudeHome, 'CLAUDE.md'),
        type: 'User',
        content: getMinimalGuide().text
      },
      {
        path: join(s.context.project, 'CLAUDE.md'),
        type: 'Project',
        content: '# Required project instructions\n'
      }
    ],
    // UNSEAL withdraws the Skill from what the model is shown.
    skillNames: ['other-skill']
  });
  const observed = await service.observeUserTask({ workspace: r.workspace, taskId });
  assert.equal(observed.application, 'claude');
  assert.equal(observed.status, 'matched-record');
  assert.deepEqual(observed.reasons, []);
  assert.equal(observed.conditions.runtimeVersion, '2.1.260');
  assert.equal(observed.conditions.desktopVersion, OWNED_DESKTOP_VERSION);
  assert.equal(observed.conditions.model, 'claude-opus-5');
  assert.equal(observed.conditions.reasoningEffort, 'high');
  assert.ok(observed.conditions.projectInstructionsDigest);
  const instructions = observed.sources.find((x) => x.category === 'instructions');
  assert.equal(instructions.expected, 'minimal-guide');
  assert.equal(instructions.recorded, 'matching-prefix');
  assert.equal(instructions.status, 'matched');
  const skill = observed.sources.find((x) => x.category === 'skill');
  assert.equal(skill.expected, 'manual-only');
  assert.equal(skill.recorded, 'absent');
  assert.equal(skill.status, 'matched');
});

test('a task that still shows a withdrawn Skill is reported as not matched', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'trueform');
  const taskId = '11111111-2222-4333-8444-555555555556';
  await writeOwnedClaudeSession(s.context, {
    sessionId: taskId,
    instructionFiles: [
      { path: join(s.context.claudeHome, 'CLAUDE.md'), type: 'User', content: INERT }
    ],
    skillNames: ['example']
  });
  const observed = await service.observeUserTask({ workspace: r.workspace, taskId });
  assert.equal(observed.status, 'not-matched-record');
  assert.ok(observed.reasons.includes('skill-catalog-mismatch'));
  const skill = observed.sources.find((x) => x.category === 'skill');
  assert.equal(skill.expected, 'disabled');
  assert.equal(skill.recorded, 'present');
  assert.equal(skill.status, 'not-matched');
});

test('TRUEFORM matches whether the inert file is recorded verbatim or stripped', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'trueform');
  for (const [index, files] of [
    [{ path: join(s.context.claudeHome, 'CLAUDE.md'), type: 'User', content: INERT }],
    [{ path: join(s.context.claudeHome, 'CLAUDE.md'), type: 'User', content: '' }],
    []
  ].entries()) {
    const taskId = `11111111-2222-4333-8444-6666666666${String(index).padStart(2, '0')}`;
    await writeOwnedClaudeSession(s.context, {
      sessionId: taskId,
      instructionFiles: files,
      skillNames: []
    });
    const observed = await service.observeUserTask({ workspace: r.workspace, taskId });
    const instructions = observed.sources.find((x) => x.category === 'instructions');
    assert.equal(instructions.expected, 'inert-instructions');
    assert.equal(instructions.status, 'matched', `variant ${index}`);
    assert.equal(observed.status, 'matched-record', `variant ${index}`);
  }
});

test('an unqualified task record cannot become a matched observation', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'trueform');
  const cases = [
    [{ entrypoint: 'cli' }, 'task-origin-unqualified'],
    [{ isSidechain: true }, 'task-forked'],
    [{ cwd: s.parent }, 'task-project-mismatch'],
    [{ completed: false }, 'task-incomplete'],
    [{ version: '9.9.9' }, 'unsupported-claude-version'],
    [{ userType: 'internal' }, 'task-route-unqualified']
  ];
  for (const [index, [override, reason]] of cases.entries()) {
    const taskId = `11111111-2222-4333-8444-7777777777${String(index).padStart(2, '0')}`;
    await writeOwnedClaudeSession(s.context, {
      sessionId: taskId,
      instructionFiles: [
        { path: join(s.context.claudeHome, 'CLAUDE.md'), type: 'User', content: INERT }
      ],
      skillNames: [],
      ...override
    });
    const observed = await service.observeUserTask({ workspace: r.workspace, taskId });
    assert.ok(observed.reasons.includes(reason), `${reason}: ${observed.reasons}`);
    assert.notEqual(observed.status, 'matched-record');
  }
});

test('a task started before preparation cannot count for the current mode', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'trueform');
  const taskId = '11111111-2222-4333-8444-888888888888';
  await writeOwnedClaudeSession(s.context, {
    sessionId: taskId,
    timestamp: '2020-01-01T00:00:00.000Z',
    instructionFiles: [
      { path: join(s.context.claudeHome, 'CLAUDE.md'), type: 'User', content: INERT }
    ],
    skillNames: []
  });
  const observed = await service.observeUserTask({ workspace: r.workspace, taskId });
  assert.equal(observed.status, 'unqualified-record');
  assert.ok(observed.reasons.includes('task-before-preparation'));
});

test('a missing task recording is reported rather than assumed', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const r = await register(s);
  await prepare(s, r.workspace, 'unseal');
  const observed = await service.observeUserTask({
    workspace: r.workspace,
    taskId: '11111111-2222-4333-8444-999999999999'
  });
  assert.equal(observed.status, 'unknown-record');
  assert.ok(observed.reasons.includes('task-record-unavailable'));
  for (const source of observed.sources) assert.equal(source.status, 'unknown');
});
