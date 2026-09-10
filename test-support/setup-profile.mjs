import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from './ai-profile.mjs';
import { reviewSetup, applySetup } from '../src/setup/service.mjs';

export async function setupProfile(t, options) {
  const p = await aiProfile(t, options);
  const proposal = { schemaVersion: 1, scopeId: p.scopeId, normalId: p.normalId,
    basis: { application: 'codex', modelId: 'gpt-6-astra', modelSource: 'user-specified', desktopVersion: null, runtimeVersion: '0.153.4',
      references: [{ url: 'https://developers.openai.com/api/docs/guides/latest-model', title: 'Official fixture reference', checkedAt: '2026-09-09T00:00:00.000Z' }],
      rationale: 'A synthetic test configuration with no performance claim.' },
    roles: p.sources.filter(s => s.id.startsWith('skill-')).map(s => ({ sourceId: s.id, origin: 'self', reason: 'Confirmed fixture.' })),
    unseal: { instructions: 'minimal', automaticSkillIds: [] }, trueform: { automaticExternalSkillIds: [] } };
  const review = await reviewSetup({ workspace: p.workspace, proposal });
  const setup = await applySetup({ workspace: p.workspace, reviewId: review.reviewId });
  return { ...p, proposal, setup };
}
export async function addSetupSkill(p, name = 'new-example') {
  const path = join(p.context.codexHome, 'skills', name, 'SKILL.md');
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  await writeFile(path, `---\nname: ${name}\ndescription: A synthetic added Skill\n---\n\nPRIVATE_TEST new body.\n`, { mode: 0o600, flag: 'wx' });
  return { path, bytes: await readFile(path) };
}
