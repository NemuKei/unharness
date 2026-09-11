import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setSkillStatesConfig } from '../src/codex/config-editor.mjs';
import { selectedSkillIntent } from '../src/codex/skill-listing.mjs';

const fixture = fileURLToPath(new URL('./fixtures/config-editor-server.mjs', import.meta.url));
const selected = '/skills/selected/SKILL.md', added = '/skills/new/SKILL.md';
const entry = (path, enabled) => `[[skills.config]]\npath = ${JSON.stringify(path)}\nenabled = ${enabled}\n`;

test('only the v3 observation contract recognizes an explicitly enabled selector', () => {
  for (const before of [[], [false], [true, false]]) {
    assert.equal(selectedSkillIntent(before, [true], false), null);
    assert.equal(selectedSkillIntent(before, [true], false, { allowEnable: true }), true);
    assert.equal(selectedSkillIntent(before, [true, true], false, { allowEnable: true }), true);
  }
  assert.equal(selectedSkillIntent([], [true, false], false, { allowEnable: true }), null);
  assert.equal(selectedSkillIntent([false], [false], false, { allowEnable: true }), false);
});
async function context(t) {
  const root = await mkdtemp(join(tmpdir(), 'unharness-state-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const log = join(root, 'requests.jsonl');
  return { run: (configText, skillStates) => setSkillStatesConfig({ configText, skillStates,
    executable: process.execPath, executableArgs: [fixture, 'states-v3', log] }),
    events: async () => (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse) };
}

test('v3 explicitly enables a disabled Skill while disabling another exact path', async t => {
  const c = await context(t), prefix = '# preserved\nmodel = "example"\n';
  const before = prefix + entry(selected, false) + entry('/unselected', true);
  const after = await c.run(before, [{ path: selected, enabled: true }, { path: added, enabled: false }]);
  assert.equal(after.text, prefix + entry(selected, true) + entry('/unselected', true) + entry(added, false));
  const events = await c.events();
  assert.deepEqual(events.filter(e => e.method === 'skills/config/write').map(e => e.params),
    [{ path: selected, enabled: true }, { path: added, enabled: false }]);
  assert.equal(events.some(e => e.method && !['initialize', 'initialized', 'config/read', 'skills/config/write'].includes(e.method)), false);
  await assert.rejects(stat(events[0].profile), { code: 'ENOENT' });
});

test('v3 enables every duplicate selector through one guarded owned-array edit', async t => {
  const c = await context(t), before = entry(selected, false) + entry(selected, true) + entry('/unselected', false);
  const after = await c.run(before, [{ path: selected, enabled: true }]);
  assert.equal(after.text, entry(selected, true) + entry(selected, true) + entry('/unselected', false));
  const writes = (await c.events()).filter(e => ['config/batchWrite', 'skills/config/write'].includes(e.method));
  assert.equal(writes.length, 1); assert.equal(writes[0].method, 'config/batchWrite');
  assert.equal(writes[0].params.edits[0].keyPath, 'skills.config');
  assert.equal(writes[0].params.reloadUserConfig, false);
});

test('unchanged states preserve exact bytes and invalid state inputs start no child', async t => {
  const c = await context(t), before = entry(selected, true);
  assert.equal((await c.run(before, [{ path: selected, enabled: true }])).text, before);
  assert.equal((await c.events()).some(e => ['config/batchWrite', 'skills/config/write'].includes(e.method)), false);
  const bad = await context(t);
  for (const skillStates of [null, [{ path: selected, enabled: 'true' }], [{ path: selected, enabled: true, target: 'other' }],
    [{ path: selected, enabled: false }, { path: selected, enabled: true }], [{ path: 'relative', enabled: true }]])
    await assert.rejects(bad.run(before, skillStates), { kind: 'config-transform-failed' });
  await assert.rejects(bad.events(), { code: 'ENOENT' });
  assert.deepEqual(await setSkillStatesConfig({ configText: before, skillStates: [], executable: 'absent' }),
    { text: before, changed: false, codexVersion: null });
});
