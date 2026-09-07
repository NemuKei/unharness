import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir, release, arch } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import * as service from '../src/sources/service.mjs';
import {
  createOwnedSourceProfile,
  readSourceProfileFiles
} from '../src/sources/owned-profile.mjs';
import { disableSkillConfig } from '../src/codex/config-editor.mjs';
const executable = process.argv[2];
if (!executable || process.platform !== 'darwin')
  throw Error('Explicit native executable and macOS required');
const exec = promisify(execFile),
  parent = await realpath(
    await mkdtemp(join(tmpdir(), 'unharness-native-sources-'))
  ),
  checks = [];
const register = async (setup) => {
  const discovery = await service.discoverUserSources(setup.context);
  const selected = discovery.skills.filter((s) => s.eligible);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].label, 'example');
  return service.registerUserSources({
    context: setup.context,
    discoveryId: discovery.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: selected.map((s) => s.id),
    userAddedOptional: true
  });
};
try {
  const setup = await createOwnedSourceProfile({ parent, executable });
  const override = join(setup.context.codexHome, 'AGENTS.override.md');
  await writeFile(override, '# Owned optional override\n', { mode: 0o640 });
  await exec('/usr/bin/xattr', [
    '-w',
    'com.unharness.fixture',
    'preserve-value',
    override
  ]);
  const original = await readSourceProfileFiles(setup.context);
  assert.ok(original.override.meta.xattrs['com.apple.provenance']);
  const r = await register(setup);
  for (const mode of ['unseal', 'trueform', 'normal']) {
    const p = await service.planUserMode({ workspace: r.workspace, mode });
    const result = await service.applyUserPlan({
      workspace: r.workspace,
      planId: p.planId
    });
    assert.equal(result.verification.runtimeStateVerified, false);
  }
  assert.deepEqual(await readSourceProfileFiles(setup.context), original);
  checks.push(
    'Native exact mode loop retains uid/gid/mode/provenance/custom xattr, protected config and project contents'
  );
  const favorite = await service.saveUserFavorite({
    workspace: r.workspace,
    name: 'Owned native saved'
  });
  let p = await service.planUserMode({
    workspace: r.workspace,
    mode: 'unseal'
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
  p = await service.planUserFavorite({
    workspace: r.workspace,
    favoriteId: favorite.favoriteId
  });
  const restored = await service.applyUserPlan({
    workspace: r.workspace,
    planId: p.planId
  });
  assert.deepEqual(await readSourceProfileFiles(setup.context), original);
  p = await service.planUserCheckpoint({
    workspace: r.workspace,
    checkpointId: restored.checkpointId
  });
  await service.applyUserPlan({ workspace: r.workspace, planId: p.planId });
  checks.push(
    'Native frozen favorite restoration and reviewed checkpoint undo'
  );
  const phases = [
    'journal',
    'directory',
    'staged',
    'write-0',
    'write-1',
    'before-completion',
    'state'
  ];
  for (const phase of phases) {
    const s = await createOwnedSourceProfile({ parent, executable }),
      registration = await register(s),
      plan = await service.planUserMode({
        workspace: registration.workspace,
        mode: 'unseal'
      });
    const child = spawn(
      process.execPath,
      [
        resolve('test-support/user-source-interrupt.mjs'),
        registration.workspace,
        plan.planId,
        phase
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let error = '';
    child.stderr.on('data', (b) => (error += b));
    assert.equal(await new Promise((r) => child.on('close', r)), 86, error);
    assert.equal(
      (await service.recoverUserSources({ workspace: registration.workspace }))
        .status,
      'restored'
    );
    assert.deepEqual(await readSourceProfileFiles(s.context), s.originalFiles);
  }
  checks.push(
    'Abandoned native-profile child recovery at ' + phases.join(', ')
  );
  const acl = await createOwnedSourceProfile({ parent, executable });
  const base = join(acl.context.codexHome, 'AGENTS.md');
  await exec('/bin/chmod', ['+a', 'everyone allow read', base]);
  assert.equal(
    (await service.discoverUserSources(acl.context)).instructions.reason,
    'unsupported-metadata'
  );
  await exec('/bin/chmod', ['-N', base]);
  try {
    await exec('/usr/bin/chflags', ['uchg', base]);
    assert.equal(
      (await service.discoverUserSources(acl.context)).instructions.reason,
      'unsupported-metadata'
    );
  } finally {
    await exec('/usr/bin/chflags', ['nouchg', base]);
  }
  checks.push(
    'ACL and immutable flags remain visible/unavailable before source registration'
  );
  const numeric =
    '[[skills.config]]\npath = "/owned/selected/SKILL.md"\nenabled = true\n\n[[skills.config]]\npath = "/owned/untouched/SKILL.md"\nenabled = true\ncustom_integer = 9007199254740993\n';
  await assert.rejects(
    disableSkillConfig({
      configText: numeric,
      skillPaths: ['/owned/selected/SKILL.md'],
      executable
    }),
    { kind: 'config-transform-failed' }
  );
  const noOp = numeric.replace('enabled = true', 'enabled = false');
  assert.equal(
    (
      await disableSkillConfig({
        configText: noOp,
        skillPaths: ['/owned/selected/SKILL.md'],
        executable
      })
    ).text,
    noOp
  );
  checks.push(
    'Unrepresentable numeric extra metadata refuses changed native array writes; no-op bytes remain exact'
  );
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        observedAt: new Date().toISOString(),
        platform: process.platform,
        osRelease: release(),
        architecture: arch(),
        nodeVersion: process.version,
        codexVersion: (await exec(executable, ['--version'])).stdout.trim(),
        checks,
        sourceWrites: 'freshly owned synthetic profiles only',
        modelTasksStarted: false,
        desktopRuntimeVerified: false,
        nativeWindowsVerified: false
      },
      null,
      2
    )
  );
} finally {
  await rm(parent, { recursive: true, force: true });
}
