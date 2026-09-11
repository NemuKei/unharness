import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, rm, writeFile, readFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import * as service from '../src/sources/service.mjs';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';

async function setup(t, beforeRegister = async () => {}) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-observe-test-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const owned = await createOwnedSourceProfile({ parent, executable: resolve('test-support/user-source-server.mjs') });
  await beforeRegister(owned);
  const discovery = await service.discoverUserSources(owned.context);
  const registered = await service.registerUserSources({ context: owned.context, discoveryId: discovery.discoveryId, instructionsOptional: true, selectedSkillIds: discovery.skills.filter(s => s.eligible).map(s => s.id), userAddedOptional: true });
  return { ...owned, ...registered };
}
async function recording(s, mutate = () => {}) {
  const taskId = randomUUID();
  const records = [
    { type: 'session_meta', payload: { id: taskId, timestamp: new Date().toISOString(), cwd: s.context.project, originator: 'Codex Desktop', thread_source: 'user', cli_version: '0.153.4' } },
    { type: 'turn_context', payload: { cwd: s.context.project, turn_id: 'turn-1', model: 'gpt-5', effort: 'high' } },
    { type: 'world_state', payload: { full: true, state: {
      agents_md: { directory: s.context.project, text: s.originalFiles.instructions.text.trim() + '\n\n--- project-doc ---\n\n# Required project instructions' },
      host_skills: { includeInstructions: true, body: `### Skill roots\n- \`r0\` = \`${s.context.codexHome}/skills\`\n### Available skills\n- example: Synthetic optional example (file: r0/example/SKILL.md)` },
      permissions: { instructions: 'PRIVATE permissions' },
    } } },
    { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'PRIVATE answer' }] } },
    { type: 'event_msg', payload: { type: 'task_complete', turn_id: 'turn-1' } },
  ];
  mutate(records);
  const directory = join(s.context.codexHome, 'sessions');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `rollout-${taskId}.jsonl`), records.map(r => JSON.stringify(r)).join('\n') + '\n');
  return taskId;
}

test('registered sources match only a selected fresh task and persist the preparation identity', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t);
  const before = await service.userSourceState({ workspace: s.workspace });
  const taskId = await recording(s);
  assert.equal(typeof service.observeUserTask, 'function');
  const observed = await service.observeUserTask({ workspace: s.workspace, taskId });
  assert.equal(observed.status, 'matched-record');
  assert.equal(observed.preparationId, before.preparation.id);
  assert.equal(observed.snapshotId, before.registration.normalId);
  assert.equal(observed.verification.runtimeStateVerified, false);
  assert.equal((await service.userSourceState({ workspace: s.workspace })).observation.observationId, observed.observationId);
  assert.ok(!JSON.stringify(observed).includes('PRIVATE'));
});
test('the corroborated desktop-work agent origin can qualify unchanged registered sources', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t);
  const taskId = await recording(s, records => Object.assign(records[0].payload,
    { originator: 'codex_work_desktop', source: 'vscode', thread_source: 'agent_created_thread' }));
  const observed = await service.observeUserTask({ workspace: s.workspace, taskId });
  assert.equal(observed.status, 'matched-record');
  assert.equal(observed.verification.runtimeStateVerified, false);
});

test('source matching rejects stale provenance and cannot use pasted, later, or malformed source evidence', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t);
  const cases = [
    ['old', 'unqualified-record', r => { r[0].payload.timestamp = '2000-01-01T00:00:00Z'; }],
    ['future', 'unqualified-record', r => { r[0].payload.timestamp = '2999-01-01T00:00:00Z'; }],
    ['wrong identity', 'unqualified-record', r => { r[0].payload.id = randomUUID(); }],
    ['fork', 'unqualified-record', r => { r[0].payload.forked_from_id = 'PRIVATE'; }],
    ['fork route', 'unqualified-record', r => { r[0].payload.thread_source = 'agent_forked_thread'; }],
    ['unknown route', 'unqualified-record', r => { r[0].payload.thread_source = 'PRIVATE'; }],
    ['CLI origin', 'unqualified-record', r => { r[0].payload.originator = 'codex_cli_rs'; }],
    ['wrong project', 'unqualified-record', r => { r[1].payload.cwd = '/PRIVATE'; }],
    ['incomplete', 'unqualified-record', r => { r.pop(); }],
    ['other turn complete', 'unqualified-record', r => { r[4].payload.turn_id = 'second'; }],
    ['unsupported version', 'unknown-record', r => { r[0].payload.cli_version = '0.999.0'; }],
    ['malformed start', 'unknown-record', r => { r[0].payload.timestamp = 'PRIVATE'; }],
    ['missing world', 'unknown-record', r => { r.splice(2, 1); }],
    ['malformed first world then valid world', 'unknown-record', r => { r.splice(2, 0, { type: 'world_state', payload: { full: true, state: null } }); }],
    ['wrong instruction field directory', 'unknown-record', r => { r[2].payload.state.agents_md.directory = '/PRIVATE'; }],
    ['missing instructions', 'unknown-record', r => { delete r[2].payload.state.agents_md; }],
    ['instruction mismatch', 'not-matched-record', r => { r[2].payload.state.agents_md.text = 'PRIVATE different'; }],
    ['project prose is not global prefix', 'not-matched-record', r => { r[2].payload.state.agents_md.text = 'other\n\n--- project-doc ---\n\n' + s.originalFiles.instructions.text; }],
    ['catalog omission', 'not-matched-record', r => { r[2].payload.state.host_skills.body = '### Available skills\n'; }],
    ['missing catalog', 'unknown-record', r => { delete r[2].payload.state.host_skills; }],
    ['catalog not automatic', 'unknown-record', r => { r[2].payload.state.host_skills.includeInstructions = false; }],
    ['duplicated root', 'unknown-record', r => { r[2].payload.state.host_skills.body = r[2].payload.state.host_skills.body.replace('### Available', '- `r0` = `/PRIVATE`\n### Available'); }],
    ['unknown path alias', 'unknown-record', r => { r[2].payload.state.host_skills.body = '### Available skills\n- example: Synthetic (file: missing/example/SKILL.md)'; }],
    ['same name different path', 'unknown-record', r => { r[2].payload.state.host_skills.body = '### Available skills\n- example: Synthetic (file: /PRIVATE/SKILL.md)'; }],
    ['malformed catalog entry', 'unknown-record', r => { r[2].payload.state.host_skills.body += '\n- PRIVATE'; }],
    ['later matching state cannot replace first state', 'not-matched-record', r => { r.push(structuredClone(r[2])); r[2].payload.state.agents_md.text = 'different'; }],
    ['assistant before full state', 'unknown-record', r => { r.splice(2, 0, structuredClone(r[3])); }],
    ['tool before full state', 'unknown-record', r => { r.splice(2, 0, { type: 'response_item', payload: { type: 'function_call_output', output: 'PRIVATE' } }); }],
    ['pasted source in user message', 'unknown-record', r => { r[2] = { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: JSON.stringify(r[2].payload.state) }] } }; }],
  ];
  for (const [name, status, mutate] of cases) await t.test(name, async () => {
    const taskId = await recording(s, mutate);
    const result = await service.observeUserTask({ workspace: s.workspace, taskId });
    assert.equal(result.status, status);
    assert.ok(result.reasons.length > 0);
    assert.equal(result.verification.sourceCoverage, 'unknown');
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  });
});

test('condition hashes use only recognized first-turn policy fields; plugin names and absolute references match', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t);
  const one = await recording(s, r => { r[1].payload.approval_policy = 'never'; r[1].payload.sandbox_policy = { type: 'read-only' }; });
  const two = await recording(s, r => { r[1].payload.approval_policy = 'on-request'; r[1].payload.sandbox_policy = { type: 'read-only' }; });
  const first = await service.observeUserTask({ workspace: s.workspace, taskId: one });
  const second = await service.observeUserTask({ workspace: s.workspace, taskId: two });
  assert.notEqual(first.conditions.executionPolicyDigest, second.conditions.executionPolicyDigest);
  const thirdId = await recording(s, r => { r[1].payload.approval_policy = 'never'; r[1].payload.sandbox_policy = { type: 'read-only' }; r[1].payload.private_extra = 'PRIVATE different'; r[2].payload.state.permissions = { instructions: 'PRIVATE changed', extra: 8 }; });
  const third = await service.observeUserTask({ workspace: s.workspace, taskId: thirdId });
  assert.equal(third.conditions.executionPolicyDigest, first.conditions.executionPolicyDigest);
  const { parseSkillCatalog } = await import('../src/sources/observation.mjs');
  assert.deepEqual(parseSkillCatalog({ includeInstructions: true, body: '### Available skills\n- plugin:example: Synthetic (file: /skills/example/SKILL.md)' }), [{ name: 'plugin:example', path: '/skills/example/SKILL.md' }]);
});

const emptyCatalog = '### Available skills\n';
const minimalGuide = "# Minimal working guide\n\n- Follow the user's goal and the project's documented requirements.\n- Inspect the relevant code and project information before changing behavior.\n- Keep changes focused and preserve unrelated work.\n- Verify results with checks appropriate to the change, and identify what remains unverified.";
async function apply(s, mode, selectedIds) {
  const plan = await service.planUserMode({ workspace: s.workspace, mode, selectedIds });
  return service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
}
async function observePrepared(s, global, catalog) {
  const taskId = await recording(s, r => {
    if (global !== undefined) r[2].payload.state.agents_md.text = global;
    if (catalog !== undefined) r[2].payload.state.host_skills.body = catalog;
  });
  return service.observeUserTask({ workspace: s.workspace, taskId });
}

test('Normal, UNSEAL, TRUEFORM and subset favorites derive Skill intent from frozen bytes', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t);
  for (const [mode, global, catalog, expectation] of [
    ['unseal', minimalGuide, emptyCatalog, 'manual-only'],
    ['trueform', '<!-- -->', emptyCatalog, 'disabled'],
    ['normal', s.originalFiles.instructions.text.trim(), undefined, 'automatic-catalog'],
  ]) {
    await apply(s, mode);
    const result = await observePrepared(s, global, catalog);
    assert.equal(result.status, 'matched-record');
    assert.equal(result.sources.find(s => s.category === 'skill').expected, expectation);
  }
  await apply(s, 'trueform', [s.sources.find(s => s.id.startsWith('instructions')).id]);
  const favorite = await service.saveUserFavorite({ workspace: s.workspace, name: 'Only instructions' });
  await apply(s, 'unseal');
  const plan = await service.planUserFavorite({ workspace: s.workspace, favoriteId: favorite.favoriteId });
  await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const result = await observePrepared(s, '<!-- -->');
  assert.equal(result.status, 'matched-record');
  assert.equal(result.sources.find(s => s.category === 'skill').expected, 'automatic-catalog');
});

for (const [label, enabled, policy, format, expected] of [
  ['original disabled', false, null, null, 'disabled'],
  ['manual default', true, 'policy:\n  allow_implicit_invocation: false\n', null, 'manual-only'],
  ['unsupported metadata', true, 'policy: PRIVATE\n', null, 'unknown'],
  ['unsupported alternate format', true, null, '{}', 'unknown'],
]) test('frozen policy: ' + label, { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t, async owned => {
    const skill = join(owned.context.codexHome, 'skills/example');
    if (!enabled) await writeFile(join(owned.context.codexHome, 'config.toml'), `[[skills.config]]\npath = ${JSON.stringify(join(skill, 'SKILL.md'))}\nenabled = false\n`);
    if (policy !== null) { await mkdir(join(skill, 'agents')); await writeFile(join(skill, 'agents/openai.yaml'), policy); }
    if (format !== null) await writeFile(join(skill, 'SKILL.json'), format);
  });
  const result = await observePrepared(s, undefined, emptyCatalog);
  assert.equal(result.sources.find(s => s.category === 'skill').expected, expected);
  assert.equal(result.status, expected === 'unknown' ? 'unknown-record' : 'matched-record');
});

test('new preparation invalidates old observation; duplicate apply and no-op recovery keep boundaries', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t), before = await service.userSourceState({ workspace: s.workspace });
  const old = await observePrepared(s);
  await service.recoverUserSources({ workspace: s.workspace });
  assert.equal((await service.userSourceState({ workspace: s.workspace })).preparation.id, before.preparation.id);
  const plan = await service.planUserMode({ workspace: s.workspace, mode: 'normal' });
  await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  const prepared = await service.userSourceState({ workspace: s.workspace });
  assert.notEqual(prepared.preparation.id, before.preparation.id);
  assert.equal(prepared.observation, null);
  await service.applyUserPlan({ workspace: s.workspace, planId: plan.planId });
  assert.equal((await service.userSourceState({ workspace: s.workspace })).preparation.id, prepared.preparation.id);
  const { loadRecord } = await import('../src/sources/records.mjs');
  assert.equal((await loadRecord(s.workspace, 'observation', old.observationId)).role, 'task-observation');
  const statePath = join(s.workspace, 'state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  await writeFile(statePath, JSON.stringify({ ...state, lastObservationId: old.observationId }));
  const stale = await service.userSourceState({ workspace: s.workspace });
  assert.equal(stale.observation, null);
  assert.equal(stale.observationIssue, 'observation-record-invalid');
});

test('legacy and malformed optional metadata leave status, reviewed re-preparation and recovery usable', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t), path = join(s.workspace, 'state.json');
  const initial = JSON.parse(await readFile(path, 'utf8'));
  for (const [preparation, expectedIssue] of [[undefined, 'preparation-boundary-unavailable'], [{ id: 'PRIVATE', preparedAt: 'PRIVATE' }, 'preparation-metadata-invalid']]) {
    await writeFile(path, JSON.stringify({ ...initial, preparation }));
    const state = await service.userSourceState({ workspace: s.workspace });
    assert.equal(state.preparation, null);
    assert.equal(state.observationIssue, expectedIssue);
    const result = await observePrepared(s);
    assert.equal(result.status, 'unknown-record');
    assert.equal(result.preparationId, null);
    await service.recoverUserSources({ workspace: s.workspace });
    await apply(s, 'normal');
    assert.ok((await service.userSourceState({ workspace: s.workspace })).preparation.id);
  }
  for (const pointer of ['PRIVATE', 'f'.repeat(64)]) {
    await writeFile(path, JSON.stringify({ ...initial, lastObservationId: pointer }));
    const state = await service.userSourceState({ workspace: s.workspace });
    assert.equal(state.observation, null);
    assert.ok(['observation-pointer-invalid', 'observation-record-invalid'].includes(state.observationIssue));
    assert.ok(!JSON.stringify(state.observationIssue).includes('PRIVATE'));
    await apply(s, 'normal');
  }
  await writeFile(path, JSON.stringify({ ...initial, revision: 'PRIVATE' }));
  await assert.rejects(service.userSourceState({ workspace: s.workspace }), { kind: 'workspace-invalid' });
});

test('public UUID-only operation canonicalizes IDs and rejects extra controls before reading a task', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t), taskId = await recording(s);
  const result = await service.observeUserTask({ workspace: s.workspace, taskId: taskId.toUpperCase() });
  assert.equal(result.taskId, taskId);
  assert.equal(result.status, 'matched-record');
  for (const args of [{ workspace: '/PRIVATE', taskId: '/PRIVATE' }, { workspace: s.workspace, taskId, expected: 'PRIVATE' }, { workspace: s.workspace, taskId, session: '/PRIVATE' }]) await assert.rejects(service.observeUserTask(args), e => e.kind === 'invalid-request' && !String(e).includes('PRIVATE'));
  const { sourcesMain, SOURCES_USAGE } = await import('../src/sources/cli.mjs');
  let stdout = '', stderr = '';
  const io = { stdout: { write: s => { stdout += s; } }, stderr: { write: s => { stderr += s; } } };
  assert.equal(await sourcesMain(['sources', 'observe', '--json', JSON.stringify({ workspace: s.workspace, taskId })], io), 0);
  assert.equal(JSON.parse(stdout).status, 'matched-record');
  assert.equal(await sourcesMain(['sources', 'observe', '--json', '{"taskId":"PRIVATE","workspace":"PRIVATE"}'], io), 1);
  assert.equal(stderr, '{"error":{"kind":"invalid-request"}}\n');
  assert.match(SOURCES_USAGE, /observe/);
});

test('pending recovery advances preparation, retains immutable history and stays Node-only', { skip: process.platform !== 'darwin' }, async t => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const exec = promisify(execFile);
  for (const phase of ['journal', 'staged', 'write-0', 'write-1', 'before-completion', 'state']) await t.test(phase, async t => {
    const s = await setup(t);
    const observed = await observePrepared(s);
    const prior = await service.userSourceState({ workspace: s.workspace });
    const plan = await service.planUserMode({ workspace: s.workspace, mode: 'unseal' });
    await assert.rejects(exec(process.execPath, [resolve('test-support/user-source-interrupt.mjs'), s.workspace, plan.planId, phase]), { code: 86 });
    const pending = await service.userSourceState({ workspace: s.workspace });
    assert.equal(pending.recovery.pending, true);
    assert.equal(pending.observation, null);
    await assert.rejects(service.observeUserTask({ workspace: s.workspace, taskId: observed.taskId }), { kind: 'recovery-required' });
    const recovered = await exec(process.execPath, [resolve('test-support/user-source-node-only-recovery.mjs'), s.workspace]);
    assert.equal(JSON.parse(recovered.stdout).status, 'restored');
    const state = await service.userSourceState({ workspace: s.workspace });
    assert.notEqual(state.preparation.id, prior.preparation.id);
    assert.equal(state.observation, null);
    await service.recoverUserSources({ workspace: s.workspace });
    assert.equal((await service.userSourceState({ workspace: s.workspace })).preparation.id, state.preparation.id);
    const { loadRecord } = await import('../src/sources/records.mjs');
    assert.equal((await loadRecord(s.workspace, 'observation', observed.observationId)).status, 'matched-record');
  });
});

test('source conflict suppresses the current match and rejects another observation without changing sources', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t), observed = await observePrepared(s);
  const file = join(s.context.codexHome, 'AGENTS.md');
  await writeFile(file, 'PRIVATE independent edit');
  const state = await service.userSourceState({ workspace: s.workspace });
  assert.equal(state.observation, null);
  assert.equal(state.observationIssue, 'source-conflict');
  await assert.rejects(service.observeUserTask({ workspace: s.workspace, taskId: observed.taskId }), { kind: 'source-conflict' });
  assert.equal(await readFile(file, 'utf8'), 'PRIVATE independent edit');
});

test('independent source or preparation edits during observation cannot attach a record', { skip: process.platform !== 'darwin' }, async t => {
  for (const change of ['source', 'preparation']) await t.test(change, async t => {
    let trigger;
    const s = await setup(t, async owned => {
      // A synthetic executable mutates this test's registered profile only after
      // an owned-copy parse starts, never during discovery or registration.
      const wrapper = join(owned.context.project, 'synthetic-reader.mjs');
      trigger = join(owned.context.project, 'mutation.json');
      const server = resolve('test-support/user-source-server.mjs');
      const script = `#!/usr/bin/env node\nimport { readFile, writeFile } from 'node:fs/promises';\nif (process.env.CODEX_HOME.includes('unharness-config-edit-')) {\n const c = JSON.parse(await readFile(${JSON.stringify(trigger)}, 'utf8'));\n await writeFile(c.path, c.text);\n}\nawait import(${JSON.stringify(server)});\n`;
      await writeFile(wrapper, script, { mode: 0o700 });
      owned.context.executable = wrapper;
    });
    const statePath = join(s.workspace, 'state.json');
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    const path = change === 'source' ? join(s.context.codexHome, 'AGENTS.md') : statePath;
    const text = change === 'source' ? 'PRIVATE during observation' : JSON.stringify({ ...state, preparation: { ...state.preparation, id: 'f'.repeat(32) } });
    await writeFile(trigger, JSON.stringify({ path, text }));
    const taskId = await recording(s);
    await assert.rejects(service.observeUserTask({ workspace: s.workspace, taskId }), { kind: 'source-conflict' });
    assert.equal(await readFile(path, 'utf8'), text);
    assert.equal(JSON.parse(await readFile(statePath, 'utf8')).lastObservationId, null);
  });
});

test('persisted observations whitelist output and reject mismatched scope, snapshot, boundary and enums', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t), observed = await observePrepared(s);
  const { loadRecord, record } = await import('../src/sources/records.mjs');
  const payload = await loadRecord(s.workspace, 'observation', observed.observationId);
  const path = join(s.workspace, 'state.json'), state = JSON.parse(await readFile(path, 'utf8'));
  for (const mutate of [p => { p.scopeId = 'f'.repeat(64); }, p => { p.snapshotId = 'f'.repeat(64); }, p => { p.preparationId = 'f'.repeat(32); }, p => { p.sources[0].recorded = 'PRIVATE'; }, p => { p.reasons = ['PRIVATE']; }, p => { p.verification.runtimeStateVerified = true; }]) {
    const bad = structuredClone(payload); mutate(bad);
    const id = await record(s.workspace, 'observation', bad);
    await writeFile(path, JSON.stringify({ ...state, lastObservationId: id }));
    const result = await service.userSourceState({ workspace: s.workspace });
    assert.equal(result.observation, null);
    assert.equal(result.observationIssue, 'observation-record-invalid');
  }
  const extra = { ...payload, private: 'PRIVATE' }; extra.sources[0].text = 'PRIVATE';
  const id = await record(s.workspace, 'observation', extra);
  await writeFile(path, JSON.stringify({ ...state, lastObservationId: id }));
  const result = await service.userSourceState({ workspace: s.workspace });
  assert.equal(result.observation.status, 'matched-record');
  assert.ok(!JSON.stringify(result.observation).includes('PRIVATE'));
});

test('catalog resolves POSIX and Windows roots separately and refuses traversal and ambiguous entries', async () => {
  const { parseSkillCatalog } = await import('../src/sources/observation.mjs');
  assert.deepEqual(parseSkillCatalog({ includeInstructions: true, body: '### Skill roots\n- `r0` = `C:\\Users\\Example\\skills`\n### Available skills\n- example: Windows (file: r0/example/SKILL.md)' }), [{ name: 'example', path: 'C:\\Users\\Example\\skills\\example\\SKILL.md' }]);
  for (const body of ['### Skill roots\n- `r0` = `/skills`\n### Available skills\n- example: X (file: r0/../outside/SKILL.md)', '### Available skills\n- example: X (file: /one)\n- example: X (file: /two)', '### Available skills\n- one: X (file: /one)\n- two: X (file: /one)', '### Available skills\n- example: X (file: relative)']) assert.equal(parseSkillCatalog({ includeInstructions: true, body }), null);
});

test('selector intent uses exact array equality before interpreting all-false changed arrays', async () => {
  const { selectedSkillIntent } = await import('../src/sources/observation.mjs');
  assert.equal(typeof selectedSkillIntent, 'function');
  for (const [normal, prepared, registered, expected] of [
    [[], [], true, true], [[true, false], [true, false], true, true],
    [[false], [false], false, false], [[], [false], true, false],
    [[true, true], [false, false], true, false], [[true], [], true, null],
    [[true], [true, false], true, null], [[false], [true], false, null],
  ]) assert.equal(selectedSkillIntent(normal, prepared, registered), expected);
});

test('inconsistent persisted source categories cannot display a match', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t), observed = await observePrepared(s);
  const { loadRecord, record } = await import('../src/sources/records.mjs');
  const payload = await loadRecord(s.workspace, 'observation', observed.observationId);
  const statePath = join(s.workspace, 'state.json'), state = JSON.parse(await readFile(statePath, 'utf8'));
  for (const mutate of [p => { p.sources[0].expected = 'disabled'; }, p => { p.sources[0].recorded = 'absent'; }, p => { p.sources[1].recorded = 'absent'; }]) {
    const altered = structuredClone(payload); mutate(altered);
    const id = await record(s.workspace, 'observation', altered);
    await writeFile(statePath, JSON.stringify({ ...state, lastObservationId: id }));
    assert.equal((await service.userSourceState({ workspace: s.workspace })).observation, null);
  }
});

test('an unknown source identity cannot substitute for a registered source in persisted evidence', { skip: process.platform !== 'darwin' }, async t => {
  const s = await setup(t), observed = await observePrepared(s);
  const { loadRecord, record } = await import('../src/sources/records.mjs');
  const payload = await loadRecord(s.workspace, 'observation', observed.observationId);
  payload.sources[0] = { expected: 'automatic-catalog', recorded: 'present', status: 'matched' };
  const id = await record(s.workspace, 'observation', payload);
  const path = join(s.workspace, 'state.json'), state = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...state, lastObservationId: id }));
  assert.equal((await service.userSourceState({ workspace: s.workspace })).observation, null);
});


test('saved global instructions may contain the native project delimiter as literal text', { skip: process.platform !== 'darwin' }, async t => {
  const global = '# Saved global guide\n\n--- project-doc ---\n\nThis literal separator belongs to the global guide.';
  const project = '# Required project instructions\n\n--- project-doc ---\n\nKeep this project remainder intact.';
  const s = await setup(t, async owned => {
    await writeFile(join(owned.context.codexHome, 'AGENTS.md'), global + '\n');
  });
  for (const [label, remainder] of [['global only', null], ['global plus project', project]]) await t.test(label, async () => {
    const recorded = remainder === null ? global : global + '\n\n--- project-doc ---\n\n' + remainder;
    const observed = await observePrepared(s, recorded);
    assert.equal(observed.status, 'matched-record');
    assert.equal(observed.sources.find(source => source.category === 'instructions').recorded, 'matching-prefix');
    assert.equal(observed.conditions.projectInstructionsDigest, remainder === null ? null : createHash('sha256').update(remainder).digest('hex'));
  });
});
