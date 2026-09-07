import nativeTest from 'node:test';
// The source publisher is qualified only on native macOS. These hermetic
// executable tests do not substitute for native Windows filesystem evidence.
const test = (name, fn) =>
  nativeTest(name, { skip: process.platform !== 'darwin' }, fn);
import assert from 'node:assert/strict';
import {
  mkdtemp,
  realpath,
  rm,
  writeFile,
  readFile,
  symlink,
  chmod
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as service from '../src/sources/service.mjs';
import {
  createOwnedSourceProfile,
  readSourceProfileFiles
} from '../src/sources/owned-profile.mjs';
async function setup(t) {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), 'unharness-source-test-'))
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedSourceProfile({
    parent,
    executable: resolve('test-support/user-source-server.mjs')
  });
  const discovery = await service.discoverUserSources(owned.context);
  return { ...owned, discovery, parent };
}
async function register(s) {
  return service.registerUserSources({
    context: s.context,
    discoveryId: s.discovery.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: s.discovery.skills
      .filter((x) => x.eligible)
      .map((x) => x.id),
    userAddedOptional: true
  });
}
test('registration requires declarations, binds fresh discovery and reserves one canonical home', async (t) => {
  const s = await setup(t);
  await assert.rejects(
    service.registerUserSources({
      context: s.context,
      discoveryId: s.discovery.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: [],
      userAddedOptional: false
    }),
    { kind: 'optional-role-required' }
  );
  await writeFile(join(s.context.codexHome, 'AGENTS.md'), 'changed');
  await assert.rejects(register(s), { kind: 'stale-discovery' });
  s.discovery = await service.discoverUserSources(s.context);
  const r = await register(s);
  assert.equal(
    (await service.userSourceState({ workspace: r.workspace })).preparedMode,
    'normal'
  );
  await assert.rejects(register(s), { kind: 'profile-owned' });
  assert.ok(!JSON.stringify(r).includes('PRIVATE_TEST'));
});
test('exact mode loop, frozen favorites and checkpoint undo', async (t) => {
  const s = await setup(t),
    r = await register(s);
  for (const mode of ['unseal', 'trueform', 'normal']) {
    const p = await service.planUserMode({ workspace: r.workspace, mode });
    const result = await service.applyUserPlan({
      workspace: r.workspace,
      planId: p.planId
    });
    assert.equal(result.verification.runtimeStateVerified, false);
  }
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  const f = await service.saveUserFavorite({
    workspace: r.workspace,
    name: 'Saved'
  });
  let p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
  p = await service.planUserFavorite({
    workspace: r.workspace,
    favoriteId: f.favoriteId
  });
  const a = await service.applyUserPlan({
    workspace: r.workspace,
    planId: p.planId
  });
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  const undo = await service.planUserCheckpoint({
    workspace: r.workspace,
    checkpointId: a.checkpointId
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: undo.planId });
  assert.match(
    await readFile(join(s.context.codexHome, 'AGENTS.override.md'), 'utf8'),
    /Minimal working guide/
  );
});
test('independent source/config edits and stale plans refuse writes', async (t) => {
  const s = await setup(t),
    r = await register(s);
  const p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  await writeFile(
    join(s.context.codexHome, 'config.toml'),
    'PRIVATE_TEST_EDIT'
  );
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    { kind: 'source-conflict' }
  );
  assert.equal(
    await readFile(join(s.context.codexHome, 'config.toml'), 'utf8'),
    'PRIVATE_TEST_EDIT'
  );
});
test('canonical roots and metadata changes fail closed', async (t) => {
  const s = await setup(t);
  await symlink(s.context.codexHome, join(s.parent, 'redirect'));
  await assert.rejects(
    service.discoverUserSources({
      ...s.context,
      codexHome: join(s.parent, 'redirect')
    }),
    { kind: 'source-redirection' }
  );
  const r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  await chmod(join(s.context.codexHome, 'AGENTS.md'), 0o644);
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    { kind: 'source-conflict' }
  );
});

test('Normal removes only its owned empty agents directory', async (t) => {
  const s = await setup(t),
    r = await register(s);
  for (const mode of ['unseal', 'normal']) {
    const p = await service.planUserMode({ workspace: r.workspace, mode });
    await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
  }
  await assert.rejects(
    readFile(join(s.context.codexHome, 'skills/example/agents/openai.yaml')),
    { code: 'ENOENT' }
  );
  const { lstat } = await import('node:fs/promises');
  await assert.rejects(
    lstat(join(s.context.codexHome, 'skills/example/agents')),
    { code: 'ENOENT' }
  );
});
test('owned profile excludes external and provider Skills without declaring their roles', async (t) => {
  const s = await setup(t),
    external = join(s.parent, 'outside');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(external);
  await writeFile(join(external, 'SKILL.md'), 'host private Skill');
  await writeFile(
    join(s.context.codexHome, 'catalog-extra.json'),
    JSON.stringify([
      {
        name: 'outside',
        path: join(external, 'SKILL.md'),
        scope: 'user',
        pluginId: null,
        enabled: true
      },
      {
        name: 'provider',
        path: join(external, 'SKILL.md'),
        scope: 'system',
        pluginId: null,
        enabled: true
      }
    ])
  );
  const d = await service.discoverUserSources(s.context);
  assert.equal(d.skills.find((s) => s.label === 'outside').eligible, false);
  assert.equal(d.skills.find((s) => s.label === 'provider').eligible, false);
  await assert.rejects(
    service.registerUserSources({
      context: s.context,
      discoveryId: d.discoveryId,
      instructionsOptional: false,
      selectedSkillIds: [d.skills.find((s) => s.label === 'outside').id],
      userAddedOptional: true
    }),
    { kind: 'unsupported-source' }
  );
});
test('unselected modes compile from Normal and disabled Skills are never enabled by UNSEAL', async (t) => {
  const s = await setup(t);
  const path = join(s.context.codexHome, 'skills/example/SKILL.md');
  await writeFile(
    join(s.context.codexHome, 'config.toml'),
    `[[skills.config]]\npath = ${JSON.stringify(path)}\nenabled = false\n`
  );
  s.discovery = await service.discoverUserSources(s.context);
  const r = await register(s);
  const p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  assert.equal(p.skillStates[0].enabled, false);
  assert.equal(p.skillStates[0].manualOnly, false);
  await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
  const q = await service.planUserMode({
    workspace: r.workspace,
    mode: 'trueform',
    selectedIds: []
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: q.planId });
  assert.equal(
    await readFile(join(s.context.codexHome, 'AGENTS.md'), 'utf8'),
    s.originalFiles.instructions.text
  );
  await assert.rejects(
    readFile(join(s.context.codexHome, 'AGENTS.override.md')),
    { code: 'ENOENT' }
  );
});

async function interrupt(workspace, planId, phase) {
  const { spawn } = await import('node:child_process');
  const child = spawn(
    process.execPath,
    [
      resolve('test-support/user-source-interrupt.mjs'),
      workspace,
      planId,
      phase
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let errors = '';
  child.stderr.on('data', (b) => (errors += b));
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 86, errors);
}
for (const phase of [
  'journal',
  'staged',
  'write-0',
  'write-1',
  'before-completion',
  'state'
])
  test('dead child recovery at ' + phase, async (t) => {
    const s = await setup(t),
      r = await register(s),
      p = await service.planUserMode({
        workspace: r.workspace,
        mode: 'unseal'
      });
    await interrupt(r.workspace, p.planId, phase);
    assert.equal(
      (await service.userSourceState({ workspace: r.workspace })).recovery
        .pending,
      true
    );
    const recovered = await service.recoverUserSources({
      workspace: r.workspace
    });
    assert.equal(recovered.status, 'restored');
    assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  });
test('pending recovery reports edited dependencies and retains foreign directory content', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  await interrupt(r.workspace, p.planId, 'write-1');
  await writeFile(
    join(s.context.codexHome, 'skills/example/SKILL.md'),
    'independent body'
  );
  await writeFile(
    join(s.context.codexHome, 'skills/example/agents/foreign'),
    'keep'
  );
  const result = await service.recoverUserSources({ workspace: r.workspace });
  assert.equal(result.status, 'controls-restored-dependencies-changed');
  assert.equal(result.dependencyConflicts.length, 1);
  assert.equal(result.retainedDirectories.length, 1);
  assert.equal(
    await readFile(
      join(s.context.codexHome, 'skills/example/agents/foreign'),
      'utf8'
    ),
    'keep'
  );
});
test('malformed journal and foreign stages block all recovery mutations', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  await interrupt(r.workspace, p.planId, 'staged');
  const journalPath = join(r.workspace, 'pending.json'),
    j = JSON.parse(await readFile(journalPath, 'utf8'));
  const stage = join(
    s.context.codexHome,
    'AGENTS.override.md.unharness-' + j.nonce
  );
  await writeFile(stage, 'FOREIGN');
  await assert.rejects(service.recoverUserSources({ workspace: r.workspace }), {
    kind: 'foreign-stage'
  });
  assert.equal(await readFile(stage, 'utf8'), 'FOREIGN');
  j.keys.push('base');
  await writeFile(journalPath, JSON.stringify(j));
  await assert.rejects(service.recoverUserSources({ workspace: r.workspace }), {
    kind: 'journal-invalid'
  });
  assert.equal(await readFile(stage, 'utf8'), 'FOREIGN');
});
test('concurrent callers serialize and duplicate readback never hides an independent edit', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  const results = await Promise.allSettled([
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId })
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((x) => x.status === 'rejected').reason.kind,
    'profile-busy'
  );
  const dup = await service.applyUserPlan({
    workspace: r.workspace,
    planId: p.planId
  });
  assert.equal(dup.duplicate, true);
  await writeFile(
    join(s.context.codexHome, 'AGENTS.override.md'),
    'independent'
  );
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    { kind: 'source-conflict' }
  );
});

test('stored plan records cannot expand paths or overwrite registered read-only dependencies', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  const { readRecord, putRecord } = await import('../src/core/local-store.mjs');
  const plan = await readRecord({
    store: r.workspace,
    type: 'application',
    id: p.planId
  });
  const snap = await readRecord({
    store: r.workspace,
    type: 'observation',
    id: plan.afterId
  });
  snap.files.base.text = 'tampered base';
  const after = await putRecord({
    store: r.workspace,
    type: 'observation',
    payload: snap
  });
  plan.afterId = after.id;
  const forged = await putRecord({
    store: r.workspace,
    type: 'application',
    payload: plan
  });
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: forged.id }),
    { kind: 'record-invalid' }
  );
  snap.files.outside = snap.files.base;
  const outside = await putRecord({
    store: r.workspace,
    type: 'observation',
    payload: snap
  });
  plan.afterId = outside.id;
  const forged2 = await putRecord({
    store: r.workspace,
    type: 'application',
    payload: plan
  });
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: forged2.id }),
    { kind: 'record-invalid' }
  );
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});
test('catalog identity changes invalidate plans even while the old Skill file remains', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  await writeFile(join(s.context.codexHome, 'catalog-override.json'), '[]');
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    { kind: 'stale-discovery' }
  );
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});
test('redirected newly created control directories are rejected before publication', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(s.parent, 'foreign'));
  await symlink(
    join(s.parent, 'foreign'),
    join(s.context.codexHome, 'skills/example/agents')
  );
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    { kind: 'source-redirection' }
  );
});
test('source CLI uses structured JSON and fixed private errors', async (t) => {
  const s = await setup(t),
    r = await register(s);
  const { sourcesMain } = await import('../src/sources/cli.mjs');
  let out = '',
    err = '';
  const io = {
    stdout: { write: (s) => (out += s) },
    stderr: { write: (s) => (err += s) }
  };
  assert.equal(
    await sourcesMain(
      [
        'sources',
        'status',
        '--json',
        JSON.stringify({ workspace: r.workspace })
      ],
      io
    ),
    0
  );
  assert.equal(JSON.parse(out).preparedMode, 'normal');
  assert.ok(!out.includes('PRIVATE_TEST'));
  assert.equal(
    await sourcesMain(['sources', 'plan', '--json', 'PRIVATE_TEST'], io),
    1
  );
  assert.ok(!err.includes('PRIVATE_TEST'));
});

test('an independently created missing control directory cannot become an owned directory', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(s.context.codexHome, 'skills/example/agents'));
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    { kind: 'source-redirection' }
  );
});
for (const mode of ['trueform', 'normal'])
  test(
    'recovery after state publication restores previous prepared mode from ' +
      mode,
    async (t) => {
      const s = await setup(t),
        r = await register(s);
      let p = await service.planUserMode({
        workspace: r.workspace,
        mode: 'unseal'
      });
      await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
      const before = await readSourceProfileFiles(s.context);
      p = await service.planUserMode({ workspace: r.workspace, mode });
      await interrupt(r.workspace, p.planId, 'state');
      await service.recoverUserSources({ workspace: r.workspace });
      assert.deepEqual(await readSourceProfileFiles(s.context), before);
      assert.equal(
        (await service.userSourceState({ workspace: r.workspace }))
          .preparedMode,
        'unseal'
      );
    }
  );

test('source IDs bind body identity and local pre-registration review is explicitly scoped', async (t) => {
  const s = await setup(t),
    id = s.discovery.skills.find((s) => s.eligible).id;
  const review = await service.reviewDiscoveredUserSource({
    context: s.context,
    discoveryId: s.discovery.discoveryId,
    sourceId: id
  });
  assert.match(review.text, /PRIVATE_TEST Skill/);
  assert.ok(!review.text.includes('approval_policy'));
  await writeFile(
    join(s.context.codexHome, 'skills/example/SKILL.md'),
    'new body'
  );
  const d = await service.discoverUserSources(s.context);
  assert.notEqual(d.skills.find((s) => s.eligible).id, id);
  await assert.rejects(
    service.reviewDiscoveredUserSource({
      context: s.context,
      discoveryId: s.discovery.discoveryId,
      sourceId: id
    }),
    { kind: 'stale-discovery' }
  );
});
test('stale saved plans are rejected before any new write', async (t) => {
  const s = await setup(t),
    r = await register(s),
    one = await service.planUserMode({
      workspace: r.workspace,
      mode: 'unseal'
    }),
    two = await service.planUserMode({
      workspace: r.workspace,
      mode: 'trueform'
    });
  await service.applyUserPlan({ workspace: r.workspace, planId: one.planId });
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: two.planId }),
    { kind: 'stale-plan' }
  );
});

test('unsupported global metadata stays visible and blocks registration before reservation', async (t) => {
  const s = await setup(t);
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)('/bin/chmod', [
    '+a',
    'everyone allow read',
    join(s.context.codexHome, 'AGENTS.md')
  ]);
  const d = await service.discoverUserSources(s.context);
  assert.equal(d.instructions.eligible, false);
  assert.equal(d.instructions.reason, 'unsupported-metadata');
  await assert.rejects(
    service.registerUserSources({
      context: s.context,
      discoveryId: d.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: [],
      userAddedOptional: true
    }),
    { kind: 'unsupported-source' }
  );
});

test('Node-only recovery neither resolves YAML nor invokes catalog/editor dependencies', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  await interrupt(r.workspace, p.planId, 'write-1');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const result = await promisify(execFile)(process.execPath, [
    resolve('test-support/user-source-node-only-recovery.mjs'),
    r.workspace
  ]);
  assert.equal(JSON.parse(result.stdout).status, 'restored');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});
test('mutable operation state cannot expand a registered directory scope', async (t) => {
  const s = await setup(t),
    r = await register(s);
  const statePath = join(r.workspace, 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  const { mkdir, lstat } = await import('node:fs/promises');
  const outside = join(s.parent, 'outside-empty');
  await mkdir(outside);
  const st = await lstat(outside);
  state.ownedDirs = [
    { key: 'override', path: outside, identity: { dev: st.dev, ino: st.ino } }
  ];
  await writeFile(statePath, JSON.stringify(state));
  await assert.rejects(
    service.planUserMode({ workspace: r.workspace, mode: 'normal' }),
    { kind: 'workspace-invalid' }
  );
  assert.equal((await lstat(outside)).isDirectory(), true);
});

test('conflicting Skill metadata is manual-unavailable and guarded during path disablement', async (t) => {
  const s = await setup(t);
  await writeFile(join(s.context.codexHome, 'skills/example/SKILL.json'), '{}');
  s.discovery = await service.discoverUserSources(s.context);
  const skill = s.discovery.skills.find((s) => s.eligible);
  assert.equal(skill.availability.unseal, false);
  assert.equal(skill.availability.trueform, true);
  const r = await register(s),
    p = await service.planUserMode({
      workspace: r.workspace,
      mode: 'trueform'
    });
  await writeFile(
    join(s.context.codexHome, 'skills/example/SKILL.json'),
    '{"changed":true}'
  );
  await assert.rejects(
    service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
    { kind: 'source-conflict' }
  );
});
test('snapshot limit is enforced on serialization and initialization reservation survives rejection', async (t) => {
  const s = await setup(t);
  const { mkdir } = await import('node:fs/promises');
  for (let i = 0; i < 7; i++) {
    const dir = join(s.context.codexHome, 'skills', 'large-' + i);
    await mkdir(dir);
    await writeFile(join(dir, 'SKILL.md'), 'a'.repeat(123 * 1024), {
      mode: 0o600
    });
  }
  s.discovery = await service.discoverUserSources(s.context);
  await assert.rejects(register(s), { kind: 'snapshot-too-large' });
  await assert.rejects(register(s), { kind: 'profile-owned' });
  assert.equal(
    await readFile(join(s.context.codexHome, 'AGENTS.md'), 'utf8'),
    s.originalFiles.instructions.text
  );
});
for (const phase of ['write-0', 'write-1', 'write-2'])
  test('TRUEFORM config-first interruption ' + phase, async (t) => {
    const s = await setup(t),
      r = await register(s);
    let p = await service.planUserMode({
      workspace: r.workspace,
      mode: 'unseal'
    });
    await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
    const before = await readSourceProfileFiles(s.context);
    p = await service.planUserMode({
      workspace: r.workspace,
      mode: 'trueform'
    });
    await interrupt(r.workspace, p.planId, phase);
    await service.recoverUserSources({ workspace: r.workspace });
    assert.deepEqual(await readSourceProfileFiles(s.context), before);
  });

test('concurrent dead-owner recovery callers cannot both own the profile', async (t) => {
  const s = await setup(t),
    r = await register(s);
  const p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  await interrupt(r.workspace, p.planId, 'write-1');
  const results = await Promise.allSettled([
    service.recoverUserSources({ workspace: r.workspace }),
    service.recoverUserSources({ workspace: r.workspace })
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.kind,
    'profile-busy'
  );
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('locator reopens only the existing canonical context and never recaptures Normal', async (t) => {
  const s = await setup(t);
  assert.equal(await service.locateUserSources({ context: s.context }), null);
  const r = await register(s);
  const p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
  const found = await service.locateUserSources({ context: s.context });
  assert.equal(found.workspace, r.workspace);
  assert.equal(found.normalId, r.normalId);
  const { mkdir } = await import('node:fs/promises');
  const other = join(s.parent, 'other-project');
  await mkdir(other);
  await assert.rejects(
    service.locateUserSources({ context: { ...s.context, project: other } }),
    { kind: 'workspace-invalid' }
  );
});
test('locator rejects unfamiliar initialization and corrupt ownership instead of reporting unregistered', async (t) => {
  const s = await setup(t);
  const { mkdir } = await import('node:fs/promises');
  const owner = join(s.context.codexHome, '.unharness-user-sources');
  await mkdir(owner);
  await assert.rejects(service.locateUserSources({ context: s.context }), {
    kind: 'workspace-invalid'
  });
  await writeFile(join(owner, 'reservation.json'), '{}');
  await assert.rejects(service.locateUserSources({ context: s.context }), {
    kind: 'workspace-invalid'
  });
});

test('frozen Normal/favorite/checkpoint restoration and saving remain Node-only', async (t) => {
  const s = await setup(t),
    r = await register(s);
  const p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  const applied = await service.applyUserPlan({
    workspace: r.workspace,
    planId: p.planId
  });
  const favorite = await service.saveUserFavorite({
    workspace: r.workspace,
    name: 'Offline UNSEAL'
  });
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const result = await promisify(execFile)(process.execPath, [
    resolve('test-support/user-source-node-only-recovery.mjs'),
    r.workspace,
    favorite.favoriteId,
    applied.checkpointId
  ]);
  assert.equal(JSON.parse(result.stdout).status, 'frozen-restores-passed');
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

test('favorite and checkpoint operations preserve the saved prepared mode label', async (t) => {
  const s = await setup(t),
    r = await register(s);
  const p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
  const f = await service.saveUserFavorite({
    workspace: r.workspace,
    name: 'Saved UNSEAL'
  });
  const restore = await service.planUserFavorite({
    workspace: r.workspace,
    favoriteId: f.favoriteId
  });
  await service.applyUserPlan({
    workspace: r.workspace,
    planId: restore.planId
  });
  assert.equal(
    (await service.userSourceState({ workspace: r.workspace })).preparedMode,
    'unseal'
  );
});

nativeTest(
  'unqualified platforms refuse both publication and pending recovery writes',
  { skip: process.platform === 'darwin' },
  async (t) => {
    const parent = await realpath(
      await mkdtemp(join(tmpdir(), 'unharness-platform-gate-'))
    );
    t.after(() => rm(parent, { recursive: true, force: true }));
    const { transact, recoverTransaction } = await import(
      '../src/sources/transaction.mjs'
    );
    await assert.rejects(transact({}, {}, ''), {
      kind: 'unsupported-platform'
    });
    await writeFile(join(parent, 'pending.json'), '{}');
    await assert.rejects(recoverTransaction({ workspace: parent }), {
      kind: 'unsupported-platform'
    });
  }
);

test('recovery retains verified directory ownership so planning can resume with foreign files preserved', async (t) => {
  const s = await setup(t),
    r = await register(s);
  const plan = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  await interrupt(r.workspace, plan.planId, 'write-1');
  const foreign = join(s.context.codexHome, 'skills/example/agents/foreign');
  await writeFile(foreign, 'independent contents');
  const recovered = await service.recoverUserSources({
    workspace: r.workspace
  });
  assert.equal(recovered.status, 'restored');
  assert.deepEqual(recovered.dependencyConflicts, []);
  assert.equal(recovered.retainedDirectories.length, 1);
  assert.equal(
    (await service.userSourceState({ workspace: r.workspace })).conflict,
    null
  );
  for (const mode of ['unseal', 'normal']) {
    const next = await service.planUserMode({ workspace: r.workspace, mode });
    await service.applyUserPlan({
      workspace: r.workspace,
      planId: next.planId
    });
    assert.equal(await readFile(foreign, 'utf8'), 'independent contents');
  }
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  assert.equal(
    (await service.userSourceState({ workspace: r.workspace })).conflict,
    null
  );
});

nativeTest(
  'recognized transform errors are normalized by the facade error boundary',
  async () => {
    const { privateCall } = await import('../src/sources/errors.mjs');
    const { makeManualSkillPolicy } = await import(
      '../src/sources/skill-policy.mjs'
    );
    const { disableSkillConfig } = await import(
      '../src/codex/config-editor.mjs'
    );
    for (const [kind, invoke] of [
      [
        'unsupported-skill-policy',
        () => makeManualSkillPolicy('policy: invalid\n')
      ],
      [
        'config-transform-failed',
        () => disableSkillConfig({ configText: null, skillPaths: [] })
      ]
    ]) {
      await assert.rejects(privateCall(invoke), (error) => {
        assert.equal(error.name, 'UserSourceError');
        assert.equal(error.kind, kind);
        assert.equal(error.message, kind);
        assert.equal(Object.hasOwn(error, 'cause'), false);
        return true;
      });
    }
  }
);

// Synthetic ownership is confined to lstat views of freshly owned test files.
// No foreign uid/gid is ever passed to an OS ownership-changing operation.
async function withOwnershipView(t, entries, run) {
  const { default: fs } = await import('node:fs/promises');
  const { syncBuiltinESMExports } = await import('node:module');
  const original = fs.lstat;
  const view = t.mock.method(fs, 'lstat', async (...args) => {
    const info = await original(...args);
    const override = entries.get(String(args[0]));
    if (override) Object.assign(info, override);
    return info;
  });
  syncBuiltinESMExports();
  try {
    return await run();
  } finally {
    view.mock.restore();
    syncBuiltinESMExports();
  }
}
function unsupportedOwnershipCases() {
  const groups = new Set([process.getegid(), ...process.getgroups()]);
  let gid = 2147483647;
  while (groups.has(gid)) gid -= 1;
  return [
    ['foreign uid', { uid: process.geteuid() === 0 ? 1 : 0 }],
    ['unsupported gid', { gid }]
  ];
}
for (const [label, ownership] of process.platform === 'darwin'
  ? unsupportedOwnershipCases()
  : []) {
  test(`ownership admission rejects ${label} on the selected override before reservation`, async (t) => {
    const s = await setup(t);
    const override = join(s.context.codexHome, 'AGENTS.override.md');
    await writeFile(override, '# Owned optional override\n', { mode: 0o600 });
    await withOwnershipView(t, new Map([[override, ownership]]), async () => {
      const { captureFile } = await import('../src/sources/platform.mjs');
      assert.equal(
        (await captureFile(override)).text,
        '# Owned optional override\n'
      );
      const d = await service.discoverUserSources(s.context);
      assert.equal(d.instructions.eligible, false);
      assert.equal(d.instructions.availability.unseal, false);
      assert.equal(d.instructions.availability.trueform, false);
      assert.equal(d.instructions.reason, 'unsupported-metadata');
      await assert.rejects(
        service.registerUserSources({
          context: s.context,
          discoveryId: d.discoveryId,
          instructionsOptional: true,
          selectedSkillIds: [],
          userAddedOptional: true
        }),
        { kind: 'unsupported-source' }
      );
      const { lstat } = await import('node:fs/promises');
      await assert.rejects(
        lstat(join(s.context.codexHome, '.unharness-user-sources')),
        { code: 'ENOENT' }
      );
    });
  });
  test(`ownership admission makes a ${label} policy manual-unavailable but permits config disablement`, async (t) => {
    const s = await setup(t);
    const { mkdir } = await import('node:fs/promises');
    const dir = join(s.context.codexHome, 'skills/example/agents');
    await mkdir(dir);
    const policy = join(dir, 'openai.yaml');
    await writeFile(policy, 'policy:\n  allow_implicit_invocation: true\n', {
      mode: 0o600
    });
    await withOwnershipView(t, new Map([[policy, ownership]]), async () => {
      s.discovery = await service.discoverUserSources(s.context);
      const skill = s.discovery.skills.find((row) => row.label === 'example');
      assert.equal(skill.eligible, true);
      assert.equal(skill.availability.unseal, false);
      assert.equal(skill.availability.trueform, true);
      assert.equal(skill.reason, 'unsupported-metadata');
      const before = await readSourceProfileFiles(s.context),
        r = await register(s);
      await assert.rejects(
        service.planUserMode({
          workspace: r.workspace,
          mode: 'unseal',
          selectedIds: [skill.id]
        }),
        { kind: 'unsupported-source' }
      );
      for (const mode of ['trueform', 'normal']) {
        const p = await service.planUserMode({
          workspace: r.workspace,
          mode,
          ...(mode === 'trueform' ? { selectedIds: [skill.id] } : {})
        });
        await service.applyUserPlan({
          workspace: r.workspace,
          planId: p.planId
        });
      }
      assert.deepEqual(await readSourceProfileFiles(s.context), before);
    });
  });
  test(`ownership admission retains ${label} config while allowing instruction and manual-policy controls`, async (t) => {
    const s = await setup(t),
      config = join(s.context.codexHome, 'config.toml');
    await withOwnershipView(t, new Map([[config, ownership]]), async () => {
      s.discovery = await service.discoverUserSources(s.context);
      const skill = s.discovery.skills.find((row) => row.label === 'example');
      assert.equal(s.discovery.instructions.eligible, true);
      assert.equal(skill.eligible, true);
      assert.equal(skill.availability.unseal, true);
      assert.equal(skill.availability.trueform, false);
      const before = await readSourceProfileFiles(s.context),
        r = await register(s);
      const manual = await service.planUserMode({
        workspace: r.workspace,
        mode: 'unseal'
      });
      await service.applyUserPlan({
        workspace: r.workspace,
        planId: manual.planId
      });
      const absent = await service.planUserMode({
        workspace: r.workspace,
        mode: 'trueform',
        selectedIds: [s.discovery.instructions.id]
      });
      await service.applyUserPlan({
        workspace: r.workspace,
        planId: absent.planId
      });
      const normal = await service.planUserMode({
        workspace: r.workspace,
        mode: 'normal'
      });
      await service.applyUserPlan({
        workspace: r.workspace,
        planId: normal.planId
      });
      assert.deepEqual(await readSourceProfileFiles(s.context), before);
    });
  });
}
test('ownership admission keeps retained foreign-owned base instructions and Skill bodies readable', async (t) => {
  const s = await setup(t),
    foreign = { uid: process.geteuid() === 0 ? 1 : 0 };
  await withOwnershipView(
    t,
    new Map([
      [join(s.context.codexHome, 'AGENTS.md'), foreign],
      [join(s.context.codexHome, 'skills/example/SKILL.md'), foreign]
    ]),
    async () => {
      s.discovery = await service.discoverUserSources(s.context);
      assert.equal(s.discovery.instructions.eligible, true);
      assert.equal(
        s.discovery.skills.find((row) => row.label === 'example').availability
          .unseal,
        true
      );
      const before = await readSourceProfileFiles(s.context),
        r = await register(s);
      for (const mode of ['unseal', 'trueform', 'normal']) {
        const p = await service.planUserMode({ workspace: r.workspace, mode });
        await service.applyUserPlan({
          workspace: r.workspace,
          planId: p.planId
        });
      }
      assert.deepEqual(await readSourceProfileFiles(s.context), before);
    }
  );
});
for (const label of ['foreign uid', 'unsupported gid'])
  test(`ownership preflight rejects existing plans after ${label} principal change before checkpoint or stage`, async (t) => {
    const s = await setup(t),
      r = await register(s),
      p = await service.planUserMode({
        workspace: r.workspace,
        mode: 'unseal'
      });
    const methods = [];
    if (label === 'foreign uid')
      methods.push(t.mock.method(process, 'geteuid', () => 2147483647));
    else {
      methods.push(t.mock.method(process, 'getegid', () => 2147483647));
      methods.push(t.mock.method(process, 'getgroups', () => []));
    }
    try {
      await assert.rejects(
        service.applyUserPlan({ workspace: r.workspace, planId: p.planId }),
        { kind: 'unsupported-metadata' }
      );
      const { readdir, lstat } = await import('node:fs/promises');
      await assert.rejects(lstat(join(r.workspace, 'pending.json')), {
        code: 'ENOENT'
      });
      assert.deepEqual(
        await readdir(join(r.workspace, 'records/checkpoint')),
        []
      );
      assert.equal(
        (await readdir(s.context.codexHome)).some((name) =>
          name.startsWith('AGENTS.override.md.unharness-')
        ),
        false
      );
      assert.deepEqual(
        await readSourceProfileFiles(s.context),
        s.originalFiles
      );
    } finally {
      methods.forEach((method) => method.mock.restore());
    }
  });

for (const [label, ownership] of process.platform === 'darwin'
  ? unsupportedOwnershipCases()
  : []) {
  test(`ownership admission rejects ${label} when neither selected Skill control is reproducible`, async (t) => {
    const s = await setup(t),
      { mkdir, lstat } = await import('node:fs/promises');
    const dir = join(s.context.codexHome, 'skills/example/agents');
    await mkdir(dir);
    const policy = join(dir, 'openai.yaml');
    await writeFile(policy, 'policy:\n  allow_implicit_invocation: true\n', {
      mode: 0o600
    });
    await withOwnershipView(
      t,
      new Map([
        [policy, ownership],
        [join(s.context.codexHome, 'config.toml'), ownership]
      ]),
      async () => {
        const d = await service.discoverUserSources(s.context),
          skill = d.skills.find((row) => row.label === 'example');
        assert.equal(skill.eligible, false);
        assert.equal(skill.availability.unseal, false);
        assert.equal(skill.availability.trueform, false);
        await assert.rejects(
          service.registerUserSources({
            context: s.context,
            discoveryId: d.discoveryId,
            instructionsOptional: false,
            selectedSkillIds: [skill.id],
            userAddedOptional: true
          }),
          { kind: 'unsupported-source' }
        );
        await assert.rejects(
          lstat(join(s.context.codexHome, '.unharness-user-sources')),
          { code: 'ENOENT' }
        );
      }
    );
  });
}
test('ownership admission preserves a foreign-owned override in a Skill-only registration', async (t) => {
  const s = await setup(t),
    override = join(s.context.codexHome, 'AGENTS.override.md');
  await writeFile(override, '# Retained global requirements\n', {
    mode: 0o600
  });
  await withOwnershipView(
    t,
    new Map([[override, { uid: process.geteuid() === 0 ? 1 : 0 }]]),
    async () => {
      const d = await service.discoverUserSources(s.context),
        skill = d.skills.find((row) => row.label === 'example');
      assert.equal(d.instructions.eligible, false);
      assert.equal(skill.eligible, true);
      const before = await readSourceProfileFiles(s.context);
      const r = await service.registerUserSources({
        context: s.context,
        discoveryId: d.discoveryId,
        instructionsOptional: false,
        selectedSkillIds: [skill.id],
        userAddedOptional: true
      });
      for (const mode of ['unseal', 'trueform', 'normal']) {
        const p = await service.planUserMode({ workspace: r.workspace, mode });
        await service.applyUserPlan({
          workspace: r.workspace,
          planId: p.planId
        });
      }
      assert.deepEqual(await readSourceProfileFiles(s.context), before);
    }
  );
});
test('ownership admission keeps disabled Skills unchanged when their policy and config are read-only', async (t) => {
  const s = await setup(t),
    { mkdir } = await import('node:fs/promises');
  const dir = join(s.context.codexHome, 'skills/example/agents');
  await mkdir(dir);
  const policy = join(dir, 'openai.yaml'),
    config = join(s.context.codexHome, 'config.toml');
  await writeFile(policy, 'policy:\n  allow_implicit_invocation: true\n', {
    mode: 0o600
  });
  await writeFile(
    config,
    `[[skills.config]]\npath = ${JSON.stringify(join(s.context.codexHome, 'skills/example/SKILL.md'))}\nenabled = false\n`,
    { mode: 0o600 }
  );
  const foreign = { uid: process.geteuid() === 0 ? 1 : 0 };
  await withOwnershipView(
    t,
    new Map([
      [policy, foreign],
      [config, foreign]
    ]),
    async () => {
      const d = await service.discoverUserSources(s.context),
        skill = d.skills.find((row) => row.label === 'example');
      assert.equal(skill.enabled, false);
      assert.equal(skill.eligible, true);
      assert.equal(skill.availability.unseal, true);
      assert.equal(skill.availability.trueform, false);
      const before = await readSourceProfileFiles(s.context);
      const r = await service.registerUserSources({
        context: s.context,
        discoveryId: d.discoveryId,
        instructionsOptional: false,
        selectedSkillIds: [skill.id],
        userAddedOptional: true
      });
      const p = await service.planUserMode({
        workspace: r.workspace,
        mode: 'unseal'
      });
      assert.deepEqual(p.changedFiles, []);
      await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
      assert.deepEqual(await readSourceProfileFiles(s.context), before);
    }
  );
});
test('ownership preflight preserves a pending recovery until its ownership can be reproduced', async (t) => {
  const s = await setup(t),
    r = await register(s),
    p = await service.planUserMode({ workspace: r.workspace, mode: 'unseal' });
  await interrupt(r.workspace, p.planId, 'write-1');
  const beforeRecovery = await readSourceProfileFiles(s.context);
  const uid = t.mock.method(process, 'geteuid', () => 2147483647);
  try {
    await assert.rejects(
      service.recoverUserSources({ workspace: r.workspace }),
      { kind: 'unsupported-metadata' }
    );
    assert.deepEqual(await readSourceProfileFiles(s.context), beforeRecovery);
    assert.equal(
      (await service.userSourceState({ workspace: r.workspace })).recovery
        .pending,
      true
    );
  } finally {
    uid.mock.restore();
  }
  assert.equal(
    (await service.recoverUserSources({ workspace: r.workspace })).status,
    'restored'
  );
  assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
});

for (const label of ['foreign uid', 'unsupported gid'])
  test(`ownership stage guard rejects ${label} principal changes before creating a file`, async (t) => {
    const s = await setup(t),
      { captureFile, writeComplete } = await import(
        '../src/sources/platform.mjs'
      );
    const file = await captureFile(join(s.context.codexHome, 'config.toml'));
    const methods =
      label === 'foreign uid'
        ? [t.mock.method(process, 'geteuid', () => 2147483647)]
        : [
            t.mock.method(process, 'getegid', () => 2147483647),
            t.mock.method(process, 'getgroups', () => [])
          ];
    try {
      const stage = join(s.parent, 'never-created.stage');
      await assert.rejects(writeComplete(stage, file), {
        kind: 'unsupported-metadata'
      });
      const { lstat } = await import('node:fs/promises');
      await assert.rejects(lstat(stage), { code: 'ENOENT' });
    } finally {
      methods.forEach((method) => method.mock.restore());
    }
  });
test('ownership predicate admits effective and supplementary groups without changing file metadata', async (t) => {
  const s = await setup(t),
    { captureFile, canReproduceOwnership } = await import(
      '../src/sources/platform.mjs'
    );
  const file = await captureFile(join(s.context.codexHome, 'config.toml'));
  const group = file.meta.gid;
  const primary = t.mock.method(process, 'getegid', () => group),
    groups = t.mock.method(process, 'getgroups', () => []);
  try {
    assert.equal(canReproduceOwnership(file), true);
  } finally {
    primary.mock.restore();
    groups.mock.restore();
  }
  const otherPrimary = t.mock.method(process, 'getegid', () => 2147483647),
    supplementary = t.mock.method(process, 'getgroups', () => [group]);
  try {
    assert.equal(canReproduceOwnership(file), true);
  } finally {
    otherPrimary.mock.restore();
    supplementary.mock.restore();
  }
  assert.deepEqual(
    await captureFile(join(s.context.codexHome, 'config.toml')),
    file
  );
});
