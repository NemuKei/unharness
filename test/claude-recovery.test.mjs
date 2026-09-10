import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import * as service from '../src/sources/service.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import {
  createOwnedClaudeProfile,
  readClaudeProfileFiles
} from '../src/claude/owned-profile.mjs';
import { getMinimalGuide } from '../src/sources/guide.mjs';

const darwin = process.platform === 'darwin';

async function setup(t, options = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-rec-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedClaudeProfile({ parent, ...options });
  const d = await service.discoverUserSources(owned.context);
  const registered = await service.registerUserSources({
    context: owned.context,
    discoveryId: d.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: d.skills.filter((x) => x.eligible).map((x) => x.id),
    userAddedOptional: true
  });
  const w = await openWorkspace(registered.workspace);
  return { parent, ...owned, ...registered, reg: w.reg };
}

async function interrupt(t, workspace, planId, phase) {
  setSourceTransactionTestHook(async (current) => {
    if (current === phase) throw Object.assign(new Error('interrupted'), { phase });
  });
  t.after(() => setSourceTransactionTestHook(null));
  await assert.rejects(service.applyUserPlan({ workspace, planId }));
  setSourceTransactionTestHook(null);
}

const settingsText = (context) =>
  readFile(join(context.claudeHome, 'settings.json'), 'utf8');

for (const phase of ['journal', 'staged', 'write-0', 'write-1', 'before-completion', 'state'])
  test(`interruption at ${phase} recovers to the exact prior bytes`, async (t) => {
    if (!darwin) return t.skip('publication is macOS-only');
    const s = await setup(t);
    const plan = await service.planUserMode({
      workspace: s.workspace,
      mode: 'unseal'
    });
    await interrupt(t, s.workspace, plan.planId, phase);
    const state = await service.userSourceState({ workspace: s.workspace });
    if (state.recovery.pending) {
      const recovered = await service.recoverUserSources({ workspace: s.workspace });
      assert.equal(recovered.status, 'restored');
      assert.deepEqual(recovered.dependencyConflicts, []);
      assert.deepEqual(await readClaudeProfileFiles(s.context), s.originalFiles);
    } else {
      // The state write is the last step; a completed transaction stays applied.
      assert.equal(
        await readFile(join(s.context.claudeHome, 'CLAUDE.md'), 'utf8'),
        getMinimalGuide().text
      );
    }
    // A second recovery is a no-op, never a second rollback.
    const again = await service.recoverUserSources({ workspace: s.workspace });
    assert.ok(['nothing-pending', 'restored'].includes(again.status));
  });

test('recovery refuses to overwrite an independent edit made during the interruption', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const plan = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
  await interrupt(t, s.workspace, plan.planId, 'write-0');
  const foreign = '# written by someone else during recovery\n';
  await writeFile(join(s.context.claudeHome, 'CLAUDE.md'), foreign, { mode: 0o600 });
  await assert.rejects(service.recoverUserSources({ workspace: s.workspace }), {
    kind: 'source-conflict'
  });
  assert.equal(
    await readFile(join(s.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    foreign,
    'the independent edit is left untouched'
  );
});

test('recovery runs from the CLI without the settings or catalog modules', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const plan = await service.planUserMode({ workspace: s.workspace, mode: 'trueform' });
  await interrupt(t, s.workspace, plan.planId, 'write-1');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const result = await promisify(execFile)(process.execPath, [
    resolve('test-support/claude-source-node-only-recovery.mjs'),
    s.workspace
  ]);
  assert.equal(JSON.parse(result.stdout).status, 'restored');
  assert.deepEqual(await readClaudeProfileFiles(s.context), s.originalFiles);
});

test('a retained-only settings edit is reviewable and recordable in every mode', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  for (const mode of ['unseal', 'trueform', 'normal']) {
    const plan = await service.planUserMode({ workspace: s.workspace, mode });
    await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });

    const before = JSON.parse(await settingsText(s.context));
    const edited = { ...before, cleanupPeriodDays: (before.cleanupPeriodDays ?? 1) + 1 };
    await writeFile(
      join(s.context.claudeHome, 'settings.json'),
      JSON.stringify(edited, null, 2) + '\n',
      { mode: 0o600 }
    );
    const state = await service.userSourceState({ workspace: s.workspace });
    assert.equal(state.conflict.kind, 'source-conflict');

    const review = await service.planUserRetainedSettings({ workspace: s.workspace });
    assert.equal(review.managedFilesChanged, 0);
    assert.deepEqual(review.changedCategories, ['Claude Code settings']);
    // The summary never exposes a key, a value or raw configuration.
    assert.equal(JSON.stringify(review).includes('cleanupPeriodDays'), false);

    const accepted = await service.acceptUserRetainedSettings({
      workspace: s.workspace,
      planId: review.planId
    });
    assert.equal(accepted.recorded, true);
    // Accepting records state only; no managed file is rewritten.
    assert.deepEqual(JSON.parse(await settingsText(s.context)), edited);
    const after = await service.userSourceState({ workspace: s.workspace });
    assert.equal(after.conflict, null);
    assert.equal(after.observation, null);
  }
  // Returning to Normal keeps the accepted retained value and restores the
  // selected sources to their saved bytes.
  const normal = await service.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await service.applyUserPlan({ workspace: s.workspace, planId: normal.planId });
  const final = JSON.parse(await settingsText(s.context));
  assert.equal(final.cleanupPeriodDays, 33);
  assert.equal(final.skillOverrides, undefined);
  assert.equal(
    await readFile(join(s.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    s.originalFiles.instructions.text
  );
});

test('an edit to a selected Skill override is a conflict, not a retained change', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const plan = await service.planUserMode({ workspace: s.workspace, mode: 'trueform' });
  await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const settings = JSON.parse(await settingsText(s.context));
  settings.skillOverrides.example = 'on';
  await writeFile(
    join(s.context.claudeHome, 'settings.json'),
    JSON.stringify(settings, null, 2) + '\n',
    { mode: 0o600 }
  );
  await assert.rejects(
    service.planUserRetainedSettings({ workspace: s.workspace }),
    { kind: 'config-transform-failed' }
  );
});

test('an edit to the instruction file is a conflict, not a retained change', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  await writeFile(join(s.context.claudeHome, 'CLAUDE.md'), '# independent\n', {
    mode: 0o600
  });
  await assert.rejects(
    service.planUserRetainedSettings({ workspace: s.workspace }),
    { kind: 'source-conflict' }
  );
});

test('a favorite from an older Normal adapts explicitly and keeps current retained settings', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const unseal = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
  await service.applyUserPlan({ workspace: s.workspace, planId: unseal.planId });
  const favorite = await service.saveUserFavorite({
    workspace: s.workspace,
    name: 'Before the retained edit'
  });

  const normal = await service.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await service.applyUserPlan({ workspace: s.workspace, planId: normal.planId });
  const edited = { ...JSON.parse(await settingsText(s.context)), statusLine: 'demo' };
  await writeFile(
    join(s.context.claudeHome, 'settings.json'),
    JSON.stringify(edited, null, 2) + '\n',
    { mode: 0o600 }
  );
  const review = await service.planUserRetainedSettings({ workspace: s.workspace });
  await service.acceptUserRetainedSettings({
    workspace: s.workspace,
    planId: review.planId
  });

  const list = await service.listUserFavorites({ workspace: s.workspace });
  assert.equal(list.favorites[0].needsAdaptation, true);
  const plan = await service.planUserFavorite({
    workspace: s.workspace,
    favoriteId: favorite.favoriteId
  });
  assert.equal(plan.adaptation.kind, 'retained-settings');
  await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const restored = JSON.parse(await settingsText(s.context));
  // The old favorite's selected state returns on top of the newer retained value.
  assert.equal(restored.skillOverrides.example, 'user-invocable-only');
  assert.equal(restored.statusLine, 'demo');
  assert.equal(
    await readFile(join(s.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    getMinimalGuide().text
  );
});
