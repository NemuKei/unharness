// Reproducible native parser check. Every path and profile is newly owned;
// no personal configuration or real task recording is opened or modified.
import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSkillSelectors, disableSkillConfig } from '../src/codex/config-editor.mjs';
const executable = process.argv[2];
if (!executable) process.exit(0); // Broad Node discovery is not native qualification.
const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-native-observation-')));
try {
  const selected = join(parent, 'selected', 'SKILL.md');
  const absent = join(parent, 'absent', 'SKILL.md');
  const text = '# Keep native comment\nmodel = \"gpt-5\"\n[[skills.config]]\npath = ' + JSON.stringify(selected) + '\nenabled = true\n[[skills.config]]\npath = ' + JSON.stringify(selected) + '\nenabled = false\n';
  const args = { executable, skillPaths: [selected, absent], timeoutMs: 30000 };
  const normal = await readSkillSelectors({ ...args, configText: text });
  assert.equal(normal.codexVersion, '0.153.4');
  assert.deepEqual(normal.selectors, [[true, false], []]);
  const disabled = await disableSkillConfig({ ...args, configText: text });
  const prepared = await readSkillSelectors({ ...args, configText: disabled.text });
  assert.deepEqual(prepared.selectors, [[false, false], [false]]);
  assert.ok(disabled.text.includes('# Keep native comment'));
  console.log(JSON.stringify({ status: 'passed', codexVersion: normal.codexVersion, nativeSelectorProjection: true, duplicateSelectors: true, absentSelectors: true, ownedCopiesOnly: true, modelCalls: false, runtimeStateVerified: false }));
} finally { await rm(parent, { recursive: true, force: true }); }
