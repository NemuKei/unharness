// Optional owned-profile integration check. This never runs via `node --test`.
// Usage: node test-support/native-source-transforms-check.mjs /path/to/codex
import assert from 'node:assert/strict';
import { arch, platform, release } from 'node:os';
import { disableSkillConfig } from '../src/codex/config-editor.mjs';

const executable = process.argv[2];
if (!executable || process.argv.length !== 3) throw new Error('Provide one explicit native Codex executable');
const checks = [];
const run = (configText, skillPaths) => disableSkillConfig({ configText, skillPaths, executable });
const configText = '# keep-comment\nmodel = "gpt-6-astra"\napproval_policy = "never"\nsandbox_mode = "read-only"\n[memories]\nuse_memories = false\n[hooks]\nenabled = true\n[custom_fixture]\nvalue = "RETAIN_SENTINEL"\ntext = "hash # is data"\n[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\n[[skills.config]]\npath = "/synthetic/untouched/SKILL.md"\nenabled = false\n';
const result = await run(configText, ['/synthetic/selected/SKILL.md', '/synthetic/new/SKILL.md']);
assert.equal(result.changed, true);
assert.match(result.text, /^# keep-comment\nmodel = "gpt-6-astra"/);
assert.match(result.text, /RETAIN_SENTINEL/);
// The production editor has also compared the complete native parsed user layer,
// including selected/appended paths and all protected/unselected values.
checks.push('selected and appended paths disabled with full semantic preservation', 'outer comment remains attached before model');
const again = await run(result.text, ['/synthetic/selected/SKILL.md']);
assert.equal(again.changed, false);
assert.equal(again.text, result.text);
checks.push('already-disabled selections preserve exact bytes');
const empty = await run('', ['/synthetic/new/SKILL.md']);
assert.equal(empty.changed, true);
checks.push('empty TOML accepted');
await assert.rejects(run('SECRET_MARKER = [', ['/synthetic/new/SKILL.md']), { kind: 'config-transform-failed' });
checks.push('malformed TOML privately rejected');
for (const [label, input, paths] of [
  ['leading array-only comment', '# leading\n[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\n', ['/synthetic/selected/SKILL.md']],
  ['selected extra metadata', '[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\nextra = "retained"\n', ['/synthetic/selected/SKILL.md']],
  ['already-disabled entry comments during another change', '[[skills.config]] # array comment\npath = "/synthetic/untouched/SKILL.md" # path comment\nenabled = false # enabled comment\n[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\n', ['/synthetic/selected/SKILL.md', '/synthetic/untouched/SKILL.md']],
  ['already-disabled duplicate comments during another change', '[[skills.config]]\npath = "/synthetic/untouched/SKILL.md" # first\nenabled = false\n[[skills.config]]\npath = "/synthetic/untouched/SKILL.md" # second\nenabled = false\n[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\n', ['/synthetic/selected/SKILL.md', '/synthetic/untouched/SKILL.md']],
]) {
  const disabled = input.replace('enabled = true', 'enabled = false');
  const changed = await run(input, paths);
  assert.equal(changed.changed, true);
  assert.equal(changed.text, disabled);
  const noOp = await run(disabled, paths);
  assert.equal(noOp.changed, false);
  assert.equal(noOp.text, disabled);
  checks.push(`${label}: only enabled value changes and no-op bytes retained`);
}
const entryComments = '[[skills.config]] # array comment\npath = "/synthetic/selected/SKILL.md" # path comment\nenabled = true # enabled comment\n';
await assert.rejects(run(entryComments, ['/synthetic/selected/SKILL.md']), { kind: 'config-transform-failed' });
const disabledComments = entryComments.replace('enabled = true', 'enabled = false');
assert.equal((await run(disabledComments, ['/synthetic/selected/SKILL.md'])).text, disabledComments);
checks.push('lossy selected-entry inline comment edit rejected; exact no-op retained');
const duplicates = '[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\nextra = "first"\n[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\nextra = "second"\n';
const duplicateResult = await run(duplicates, ['/synthetic/selected/SKILL.md']);
assert.equal(duplicateResult.changed, true);
assert.equal((duplicateResult.text.match(/enabled = false/g) ?? []).length, 2);
assert.doesNotMatch(duplicateResult.text, /enabled = true/);
checks.push('every duplicate selected entry disabled with all metadata preserved');
const hashPath = await run('[[skills.config]]\npath = "/synthetic/#data/SKILL.md"\nenabled = true\n', ['/synthetic/#data/SKILL.md']);
assert.equal(hashPath.changed, true);
checks.push('quoted hash in Skill path treated as data');
console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  environment: { platform: platform(), architecture: arch(), osRelease: release(), nodeVersion: process.version },
  nativeVersion: result.codexVersion,
  status: 'passed',
  checks,
  scope: 'fresh owned temporary CODEX_HOME only; no model task requests',
  desktopRuntimeVerified: false,
  nativeWindowsVerified: false,
}, null, 2));
