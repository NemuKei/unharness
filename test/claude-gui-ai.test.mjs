import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { guiMain } from '../src/gui/cli.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import {
  createOwnedClaudeProfile,
  readClaudeProfileFiles,
  writeOwnedClaudeSession
} from '../src/claude/owned-profile.mjs';
import { getMinimalGuide } from '../src/sources/guide.mjs';

const darwin = process.platform === 'darwin';

async function setup(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-gui-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const profile = await createOwnedClaudeProfile({ parent });
  const assetsDirectory = join(parent, 'dist');
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const running = await startGuiServer({
    manageSources: profile.context,
    assetsDirectory
  });
  t.after(() => running.close());
  const headers = { 'X-Unharness-Client': '1', Origin: running.url };
  const request = async (path, body) => {
    const response = await fetch(running.url + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...headers,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: response.status, data: await response.json() };
  };
  const bootstrap = await request('/bootstrap');
  headers['X-Unharness-Token'] = bootstrap.data.token;
  let metadata = (await request('/sources/metadata')).data;
  const refresh = async () => {
    metadata = (await request('/sources/metadata')).data;
    return metadata;
  };
  const post = (action, input = {}, requestId = randomUUID()) =>
    request('/sources/' + action, {
      requestId,
      launchId: metadata.launchId,
      contextId: metadata.contextId,
      ...input
    });
  return { parent, profile, running, request, post, refresh, get metadata() {
    return metadata;
  }, assetsDirectory };
}

test('the launch identity names the application and its own home fields', async (t) => {
  const s = await setup(t);
  assert.equal(s.metadata.kind, 'user-sources');
  assert.equal(s.metadata.application, 'claude');
  assert.equal(s.metadata.applicationLabel, 'Claude Code');
  assert.deepEqual(s.metadata.context, s.profile.context);
  assert.equal(s.metadata.workspace, null);
  // A browser response never carries a Codex launch identity for this app.
  assert.equal(s.metadata.context.codexHome, undefined);
  assert.equal(s.metadata.context.executable, undefined);
});

test('the browser cannot register an arbitrary configuration path', async (t) => {
  const s = await setup(t);
  const rogue = await s.post('discover', {
    context: { application: 'claude', claudeHome: '/etc', project: '/etc', appBundle: '/etc' }
  });
  assert.equal(rogue.status, 400);
  assert.equal(rogue.data.error.kind, 'gui-invalid-request');
  const discovered = await s.post('discover');
  assert.equal(discovered.status, 200);
  assert.deepEqual(discovered.data.result.context, s.profile.context);
});

test('the full loop runs through the loopback interface for a Claude registration', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const discovered = (await s.post('discover')).data.result;
  assert.equal(discovered.application, 'claude');
  assert.equal(discovered.registrationAvailable, true);

  const registered = await s.post('register', {
    discoveryId: discovered.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: discovered.skills.filter((x) => x.eligible).map((x) => x.id),
    userAddedOptional: true
  });
  assert.equal(registered.status, 200);
  await s.refresh();
  assert.equal(typeof s.metadata.workspace, 'string');

  const planned = (await s.post('plan', { mode: 'unseal' })).data.result;
  assert.equal(planned.guide.id, 'unharness-minimal-v1');
  const applied = (await s.post('apply', { planId: planned.planId })).data.result;
  assert.equal(applied.readback, 'matched');
  assert.equal(
    await readFile(join(s.profile.context.claudeHome, 'CLAUDE.md'), 'utf8'),
    getMinimalGuide().text
  );

  const state = (await s.request('/sources/state')).data;
  assert.equal(state.metadata.application, 'claude');
  assert.equal(state.source.preparedMode, 'unseal');
  assert.equal(state.source.verification.runtimeStateVerified, false);

  const saved = (await s.post('save', { name: 'Manual guide' })).data.result;
  assert.equal(saved.preparedMode, 'unseal');

  const normal = (await s.post('plan', { mode: 'normal' })).data.result;
  await s.post('apply', { planId: normal.planId });
  assert.deepEqual(
    await readClaudeProfileFiles(s.profile.context),
    s.profile.originalFiles
  );
});

test('a duplicate request identifier returns the first result once', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const discovered = (await s.post('discover')).data.result;
  await s.post('register', {
    discoveryId: discovered.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: [],
    userAddedOptional: true
  });
  await s.refresh();
  const planned = (await s.post('plan', { mode: 'trueform' })).data.result;
  const requestId = randomUUID();
  const first = await s.post('apply', { planId: planned.planId }, requestId);
  const repeat = await s.post('apply', { planId: planned.planId }, requestId);
  assert.equal(first.status, 200);
  assert.deepEqual(repeat.data, first.data);
  // A different payload under the same identifier is refused, not applied.
  const changed = await s.post('apply', { planId: 'f'.repeat(64) }, requestId);
  assert.equal(changed.status, 409);
});

test('an accepted launch identity is required for every write', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const stale = await s.request('/sources/plan', {
    requestId: randomUUID(),
    launchId: randomUUID(),
    contextId: s.metadata.contextId,
    mode: 'unseal'
  });
  assert.equal(stale.data.error.kind, 'gui-source-context-changed');
  const staleContext = await s.request('/sources/plan', {
    requestId: randomUUID(),
    launchId: s.metadata.launchId,
    contextId: 'f'.repeat(64),
    mode: 'unseal'
  });
  assert.equal(staleContext.data.error.kind, 'gui-source-context-changed');
});

test('the AI entry point drives the same operations over stdio', async (t) => {
  if (!darwin) return t.skip('publication is macOS-only');
  const s = await setup(t);
  const discovered = (await s.post('discover')).data.result;
  const registered = (
    await s.post('register', {
      discoveryId: discovered.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: discovered.skills.filter((x) => x.eligible).map((x) => x.id),
      userAddedOptional: true
    })
  ).data.result;

  const { fixtureAiClient } = await import('../test-support/ai-client.mjs');
  const ai = await fixtureAiClient(t, registered.workspace);

  const status = await ai.call('status');
  assert.equal(status.source.preparedMode, 'normal');
  assert.equal(status.source.context.application, 'claude');

  const applied = await ai.mode('trueform');
  assert.equal(applied.preparedMode, 'trueform');
  const settings = JSON.parse(
    await readFile(join(s.profile.context.claudeHome, 'settings.json'), 'utf8')
  );
  assert.equal(settings.skillOverrides.example, 'off');

  const taskId = randomUUID().toLowerCase();
  await writeOwnedClaudeSession(s.profile.context, {
    sessionId: taskId,
    instructionFiles: [
      {
        path: join(s.profile.context.claudeHome, 'CLAUDE.md'),
        type: 'User',
        content: '<!-- -->\n'
      }
    ],
    skillNames: []
  });
  const observed = await ai.mutate('observe_task', { taskId });
  assert.equal(observed.status, 'matched-record');
  assert.equal(observed.application, 'claude');

  // An open workbench sees the externally applied state.
  const refreshed = (await s.request('/sources/state')).data;
  assert.equal(refreshed.source.preparedMode, 'trueform');
  assert.equal(refreshed.source.observation.taskId, taskId);
});

test('the gui CLI accepts a Claude launch and rejects a mixed one', async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-claude-cli-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const profile = await createOwnedClaudeProfile({ parent });
  const assetsDirectory = join(parent, 'dist');
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const out = { value: '', write(text) { this.value += text; } };
  const err = { value: '', write(text) { this.value += text; } };
  let closed = false;
  const code = await guiMain(
    [
      'gui',
      '--manage-sources',
      '--app',
      'claude',
      '--claude-home',
      profile.context.claudeHome,
      '--project',
      profile.context.project,
      '--app-bundle',
      profile.context.appBundle
    ],
    {
      stdout: out,
      stderr: err,
      assetsDirectory,
      startServer: async () => ({
        url: 'http://127.0.0.1:0',
        close: async () => {
          closed = true;
        }
      })
    }
  );
  assert.equal(code, 0, err.value);
  const summary = JSON.parse(out.value);
  assert.equal(summary.application, 'claude');
  assert.deepEqual(summary.context, profile.context);
  assert.ok(summary.resumeArgv.includes('--app'));
  assert.ok(summary.resumeArgv.includes('--claude-home'));
  assert.ok(!summary.resumeArgv.includes('--codex-home'));
  process.emit('SIGTERM');
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(closed, true);

  // A launch mixing two applications' identity flags is a usage error.
  for (const argv of [
    ['gui', '--manage-sources', '--app', 'claude', '--codex-home', profile.context.claudeHome, '--project', profile.context.project, '--app-bundle', profile.context.appBundle],
    ['gui', '--manage-sources', '--app', 'claude', '--claude-home', profile.context.claudeHome, '--project', profile.context.project],
    ['gui', '--manage-sources', '--claude-home', profile.context.claudeHome, '--project', profile.context.project],
    ['gui', '--manage-sources', '--app', 'other', '--claude-home', profile.context.claudeHome, '--project', profile.context.project, '--app-bundle', profile.context.appBundle]
  ]) {
    const badOut = { value: '', write(t) { this.value += t; } };
    const badErr = { value: '', write(t) { this.value += t; } };
    assert.equal(
      await guiMain(argv, { stdout: badOut, stderr: badErr, assetsDirectory }),
      2,
      argv.join(' ')
    );
  }
});
