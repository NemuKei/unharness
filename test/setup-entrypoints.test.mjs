import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { sourcesMain } from '../src/sources/cli.mjs';

test('setup CLI preserves the existing strict JSON and sanitized error contract', async t => {
  const p = await aiProfile(t);
  async function run(input) {
    let stdout = '', stderr = '';
    const code = await sourcesMain(input, { stdout: { write: text => { stdout += text; } }, stderr: { write: text => { stderr += text; } } });
    return { code, stdout, stderr };
  }
  const read = await run(['sources', 'setup', '--json', JSON.stringify({ workspace: p.workspace })]);
  assert.equal(read.code, 0); assert.equal(read.stderr, '');
  assert.equal(JSON.parse(read.stdout).setupId, null);
  const duplicated = await run(['sources', 'setup', '--json', `{"workspace":${JSON.stringify(p.workspace)},"workspace":${JSON.stringify(p.workspace)}}`]);
  assert.equal(duplicated.code, 1); assert.equal(duplicated.stdout, '');
  assert.ok(!duplicated.stderr.includes(p.workspace));
  const missing = await run(['sources', 'apply-setup', '--json', JSON.stringify({ workspace: p.workspace, proposal: {} })]);
  assert.equal(missing.code, 1); assert.equal(missing.stdout, '');
  assert.equal(JSON.parse(missing.stderr).error.kind, 'invalid-request');
  assert.match((await run(['sources', '--help'])).stdout, /setup, review-setup, apply-setup/);
  assert.equal((await run(['sources', 'setup'])).code, 2);
});

test('HTTP setup operations keep authentication, fixed scope, duplicate-key rejection and the 16 KiB limit', async t => {
  const p = await aiProfile(t), assetsDirectory = join(p.parent, 'assets');
  await mkdir(assetsDirectory); await writeFile(join(assetsDirectory, 'index.html'), '<!doctype html>');
  const gui = await startGuiServer({ manageSources: p.context, assetsDirectory });
  t.after(() => gui.close());
  const headers = { Origin: gui.url, 'X-Unharness-Client': '1', 'Content-Type': 'application/json' };
  headers['X-Unharness-Token'] = (await (await fetch(gui.url + '/api/bootstrap', { headers })).json()).token;
  const metadata = await (await fetch(gui.url + '/api/sources/metadata', { headers })).json();
  const fields = { requestId: randomUUID(), launchId: metadata.launchId, contextId: metadata.contextId };
  const before = await readFile(join(p.workspace, 'state.json'));
  const post = (action, body, extra = {}) => fetch(gui.url + '/api/sources/' + action, {
    method: 'POST', headers: { ...headers, ...extra }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const read = await post('setup', fields);
  assert.equal(read.status, 200);
  assert.equal((await read.json()).result.setupId, null);
  assert.equal((await post('setup', fields, { Origin: 'https://example.invalid' })).status, 403);
  assert.equal((await post('setup', fields, { 'X-Unharness-Token': 'wrong' })).status, 403);
  assert.equal((await post('setup', { ...fields, requestId: randomUUID(), workspace: p.parent })).status, 400);
  const repeated = JSON.stringify({ ...fields, requestId: randomUUID() }).replace('}', ',"proposal":{},"proposal":{}}');
  assert.equal((await post('review-setup', repeated)).status, 400);
  assert.equal((await post('review-setup', { ...fields, requestId: randomUUID(), proposal: { text: 'x'.repeat(16 * 1024) } })).status, 413);
  assert.deepEqual(await readFile(join(p.workspace, 'state.json')), before);
});
