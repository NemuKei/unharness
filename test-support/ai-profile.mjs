import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import * as service from '../src/sources/service.mjs';

export async function aiProfile(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-ai-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const profile = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const discovery = await service.discoverUserSources(profile.context);
  const registration = await service.registerUserSources({
    context: profile.context, discoveryId: discovery.discoveryId,
    instructionsOptional: true, selectedSkillIds: discovery.skills.filter(s => s.eligible).map(s => s.id),
    userAddedOptional: true,
  });
  return { ...profile, ...registration, parent };
}
