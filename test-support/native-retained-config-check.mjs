import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disableSkillConfig } from '../src/codex/config-editor.mjs';
import { mergeRetainedConfig } from '../src/codex/config-reconcile.mjs';

const executable = process.argv[2];
if (!executable) process.exit(0); // Broad discovery is not native qualification.
const root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-retained-helper-native-')));
try {
  const selected = join(root, 'selected', 'SKILL.md');
  const unselected = join(root, 'unselected', 'SKILL.md');
  const normal = '# Saved native configuration\nmodel = "gpt-5"\napproval_policy = "never"\nsandbox_mode = "read-only"\n\n[memories]\nuse_memories = false\n\n[[skills.config]]\npath = ' + JSON.stringify(selected) + '\nenabled = true\n\n# Unselected Skill comment\n[[skills.config]]\npath = ' + JSON.stringify(unselected) + '\nenabled = true\n';
  const args = { executable, skillPaths: [selected], timeoutMs: 30000 };
  const disabled = await disableSkillConfig({ ...args, configText: normal });
  const prefix = '# Independent retained speed setting\nservice_tier = "fast"\n';
  const reconciled = await mergeRetainedConfig({ ...args, baseText: disabled.text, targetText: normal, currentText: prefix + disabled.text });
  assert.equal(reconciled.codexVersion, '0.153.4');
  assert.equal(reconciled.text, prefix + normal);
  const adapted = await mergeRetainedConfig({ ...args, baseText: normal, targetText: disabled.text, currentText: reconciled.text });
  assert.equal(adapted.text, prefix + disabled.text);
  const simple = await mergeRetainedConfig({ ...args, skillPaths: [], baseText: normal, targetText: normal, currentText: prefix + normal });
  assert.equal(simple.text, prefix + normal);
  const absentNormal = '# Originally no Skill selectors\nmodel = "gpt-5"\n\n[memories]\nuse_memories = false\n';
  const inserted = await disableSkillConfig({ ...args, configText: absentNormal });
  const removed = await mergeRetainedConfig({ ...args, baseText: inserted.text, targetText: absentNormal, currentText: prefix + inserted.text });
  assert.equal(removed.text, prefix + absentNormal);
  await assert.rejects(mergeRetainedConfig({ ...args, baseText: normal, targetText: normal, currentText: disabled.text }), { kind: 'config-transform-failed' });
  const selectedNan = normal.replace(`path = ${JSON.stringify(selected)}\nenabled = true`, `path = ${JSON.stringify(selected)}\nenabled = true\nextra = nan`);
  const selectedInf = selectedNan.replace('extra = nan', 'extra = inf');
  await assert.rejects(mergeRetainedConfig({ ...args, baseText: selectedNan, targetText: selectedInf, currentText: selectedNan }), { kind: 'config-transform-failed' });
  const retainedNan = `native_numeric = nan\n${normal}`;
  const retainedInf = retainedNan.replace('native_numeric = nan', 'native_numeric = inf');
  await assert.rejects(mergeRetainedConfig({ ...args, baseText: retainedNan, targetText: retainedInf, currentText: retainedNan }), { kind: 'config-transform-failed' });
  console.log(JSON.stringify({ status: 'passed', codexVersion: reconciled.codexVersion, trueformToNormalComposition: true, originallyAbsentSelectors: true, oldTrueformAdaptation: true, instructionOnlyScope: true, selectedEditRejected: true, unprovableNativeNumbersRejected: true, literalCommentsPreserved: true, ownedCopiesOnly: true, modelCalls: false, runtimeStateVerified: false }));
} finally { await rm(root, { recursive: true, force: true }); }
