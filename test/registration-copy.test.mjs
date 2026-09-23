import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { discoverUserSources } from '../src/sources/service.mjs';

test('discovery projects a readable Skill description without returning its body', async t => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-registration-copy-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const profile = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const first = await discoverUserSources(profile.context);
  const skill = first.skills.find(row => row.label === 'example');
  assert.equal(skill.description, 'Synthetic optional example');
  assert.equal('body' in skill, false);
  await writeFile(join(profile.context.codexHome, 'skills', 'example', 'SKILL.md'),
    '---\nname: example\n---\n\nSynthetic body.\n');
  const second = await discoverUserSources(profile.context);
  assert.equal(second.skills.find(row => row.label === 'example').description, null);
});
