import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import * as sources from '../src/sources/service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import { openWorkspace } from '../src/sources/records.mjs';
import { captureRegistered } from '../src/sources/capture.mjs';
import { captureStartingFiles } from '../src/experiments/files.mjs';
import { writeStartingManifest, readStartingManifest } from '../src/experiments/records.mjs';
import { materializeStartingFiles } from '../src/experiments/materialize.mjs';
const variant = await import('../src/experiments/variant.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const bodyPath = '.agents/skills/optional/SKILL.md';
const policyPath = '.agents/skills/optional/agents/openai.yaml';
const body = '---\nname: optional\ndescription: A synthetic optional Skill.\n---\nKeep this exact text.\n';
const mac = { skip: process.platform !== 'darwin' };
async function fixture(t, { outside = false, format = false, staleBody = false } = {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-replay-variant-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  const { project, codexHome } = owned.context;
  const path = outside ? join(dirname(project), 'outside/SKILL.md') : join(project, bodyPath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  if (format) await writeFile(join(dirname(path), 'SKILL.json'), '{}\n');
  await writeFile(join(project, 'input.bin'), Buffer.from([255, 0, 128]));
  await writeFile(join(project, 'UNSELECTED.md'), 'Retain this project requirement.\n');
  const paths = ['AGENTS.md', 'UNSELECTED.md', 'input.bin', ...(outside ? [] : [bodyPath, ...(format ? ['.agents/skills/optional/SKILL.json'] : [])])];
  const capture = await captureStartingFiles({ project, paths });
  if (staleBody) await writeFile(path, body + 'Changed before registration.\n');
  await writeFile(join(codexHome, 'catalog-extra.json'), JSON.stringify([{ name: 'optional', path, scope: 'repo', enabled: true, pluginId: null }]));
  const d = await sources.discoverUserSources(owned.context);
  const id = d.skills.find(s => s.path === path).id;
  const registration = await sources.registerUserSources({ context: owned.context, discoveryId: d.discoveryId,
    instructionsOptional: true, selectedSkillIds: [id], userAddedOptional: true });
  const manifestId = await writeStartingManifest({ store: registration.workspace, capture });
  const destination = join(parent, 'destination'); await mkdir(destination);
  return { ...registration, ...owned, project, destination, id, manifestId };
}
async function build(f) {
  assert.equal(typeof variant.buildReplayVariant, 'function');
  return variant.buildReplayVariant({ w: await openWorkspace(f.workspace), manifestId: f.manifestId, project: f.destination });
}
async function mode(f, mode) {
  const p = await sources.planUserMode({ workspace: f.workspace, mode });
  await sources.applyUserPlan({ workspace: f.workspace, planId: p.planId });
}
test('Normal replay keeps frozen binary and requirements and maps only the registered repo Skill', mac, async t => {
  const f = await fixture(t), before = await captureRegistered((await openWorkspace(f.workspace)).reg);
  const result = await build(f);
  assert.equal(result.manifestId, f.manifestId);
  assert.deepEqual(result.changes, []);
  assert.equal(result.sourceMappings.length, 1);
  assert.equal(result.sourceMappings[0].sourcePath, join(f.project, bodyPath));
  assert.equal(result.sourceMappings[0].path, join(f.destination, bodyPath));
  assert.equal(result.sourceMappings[0].strategy, 'copy-entrypoints');
  await materializeStartingFiles({ store: f.workspace, manifestId: result.manifestId, project: f.destination });
  assert.deepEqual(await readFile(join(f.destination, 'input.bin')), Buffer.from([255, 0, 128]));
  assert.equal(await readFile(join(f.destination, 'UNSELECTED.md'), 'utf8'), 'Retain this project requirement.\n');
  assert.deepEqual(await captureRegistered((await openWorkspace(f.workspace)).reg), before);
});
test('UNSEAL derives only the prepared invocation policy from a frozen Normal start', mac, async t => {
  const f = await fixture(t); await mode(f, 'unseal');
  const before = await captureRegistered((await openWorkspace(f.workspace)).reg), result = await build(f);
  assert.equal(result.sourceMappings[0].expected, 'manual-only');
  assert.deepEqual(result.changes.map(c => ({ path: c.path, reason: c.reason, before: c.before.present, after: c.after.present })),
    [{ path: policyPath, reason: 'prepared-skill-policy', before: false, after: true }]);
  await materializeStartingFiles({ store: f.workspace, manifestId: result.manifestId, project: f.destination });
  assert.equal(await readFile(join(f.destination, policyPath), 'utf8'), 'policy:\n  allow_implicit_invocation: false\n');
  assert.equal(await readFile(join(f.destination, bodyPath), 'utf8'), body);
  assert.deepEqual(await captureRegistered((await openWorkspace(f.workspace)).reg), before);
});
test('TRUEFORM omits only the registered disabled entrypoints and preserves original files and frozen inputs', mac, async t => {
  const f = await fixture(t, { format: true }); await mode(f, 'trueform');
  const before = await captureRegistered((await openWorkspace(f.workspace)).reg), result = await build(f);
  assert.equal(result.sourceMappings[0].strategy, 'omit-entrypoints');
  assert.equal(result.sourceMappings[0].expected, 'disabled');
  assert.deepEqual(result.changes.map(c => c.path).sort(), ['.agents/skills/optional/SKILL.json', bodyPath]);
  await materializeStartingFiles({ store: f.workspace, manifestId: result.manifestId, project: f.destination });
  await assert.rejects(readFile(join(f.destination, bodyPath)), { code: 'ENOENT' });
  await assert.rejects(readFile(join(f.destination, '.agents/skills/optional/SKILL.json')), { code: 'ENOENT' });
  assert.equal(await readFile(join(f.project, bodyPath), 'utf8'), body);
  assert.equal((await readStartingManifest({ store: f.workspace, manifestId: f.manifestId })).files.find(x => x.path === bodyPath).present, true);
  assert.deepEqual(await captureRegistered((await openWorkspace(f.workspace)).reg), before);
});
test('a moved ancestor Skill is unavailable instead of being silently treated as retained', mac, async t => {
  const f = await fixture(t, { outside: true });
  await assert.rejects(build(f), { kind: 'replay-source-unmapped' });
});
test('a changed frozen Skill body cannot be substituted with a later registered source', mac, async t => {
  const f = await fixture(t, { staleBody: true });
  await assert.rejects(build(f), { kind: 'replay-source-input-mismatch' });
});
test('unknown automatic control stays unavailable and cannot become a ready mapped Skill', mac, async t => {
  const f = await fixture(t, { format: true });
  await assert.rejects(build(f), { kind: 'replay-source-state-unavailable' });
});
