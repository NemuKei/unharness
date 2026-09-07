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
for (const [label, input] of [
  ['leading array-only comment', '# leading\n[[skills.config]]\npath = "/synthetic/selected/SKILL.md"\nenabled = true\n'],
  ['Skill array/entry comments', '[[skills.config]] # array comment\npath = "/synthetic/selected/SKILL.md" # path comment\nenabled = true # enabled comment\n'],
]) {
  await assert.rejects(run(input, ['/synthetic/selected/SKILL.md']), { kind: 'config-transform-failed' });
  const disabled = input.replace('enabled = true', 'enabled = false');
  const noOp = await run(disabled, ['/synthetic/selected/SKILL.md']);
  assert.equal(noOp.changed, false);
  assert.equal(noOp.text, disabled);
  checks.push(`${label}: lossy native rewrite rejected and no-op bytes retained`);
}
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
