import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mergeFrozenRetainedConfig } from '../src/codex/config-reconcile.mjs';
const id = 'selected@fixture', path = '/fixture/skill/SKILL.md';
const baseText = '# retained\nmodel = "original"\nprecision = 9007199254740993\n\n[[skills.config]]\npath = "' + path + '"\nenabled = true\n\n[plugins."' + id + '"]\nenabled = true\n\n\nnote = "retained plugin data"\n';
const targetText = baseText.replaceAll('enabled = true', 'enabled = false');
const currentText = baseText.replace('model = "original"', 'model = "latest"');
test('frozen composition proves selected flags and retained values using only Node and bundled readers', async () => {
  const script = `import { registerHooks, isBuiltin } from 'node:module';
registerHooks({resolve(s,c,n){if ((!isBuiltin(s) && !s.startsWith('.') && !s.startsWith('file:')) || /config-native-profile|rpc-transport/.test(s)) throw Error('native dependency');return n(s,c);}});
const {mergeFrozenRetainedConfig}=await import(${JSON.stringify(new URL('../src/codex/config-reconcile.mjs', import.meta.url).href)});
console.log(JSON.stringify(mergeFrozenRetainedConfig(${JSON.stringify({baseText,targetText,currentText,skillPaths:[path],pluginIds:[id]})})));`;
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script]);
  const merged = JSON.parse(result.stdout);
  assert.equal(merged.text, targetText.replace('model = "original"', 'model = "latest"'));
  assert.equal(merged.proof, 'frozen-typed-toml');
});
test('the new plugin Normal remains retained when composing a favorite from its earlier scope', () => {
  const newNormal = currentText.replace('[plugins."selected@fixture"]\nenabled = true', '[plugins."selected@fixture"]\nenabled = false');
  const saved = baseText.replace('path = "' + path + '"\nenabled = true', 'path = "' + path + '"\nenabled = false');
  const result = mergeFrozenRetainedConfig({baseText, targetText:saved,currentText:newNormal,skillPaths:[path],pluginIds:[]});
  assert.equal(result.text, newNormal.replace('path = "' + path + '"\nenabled = true', 'path = "' + path + '"\nenabled = false'));
});
for (const [name, edit] of [
  ['retained target value', {targetText:targetText.replace('retained plugin data','changed')}],
  ['selected current flag', {currentText:currentText.replaceAll('enabled = true','enabled = false')}],
  ['unknown control', {pluginIds:[]}],
  ['overlapping retained edit', {currentText:currentText.replaceAll('enabled = true','enabled = false')}],
]) test('frozen composition refuses ' + name, () => {
  assert.throws(() => mergeFrozenRetainedConfig({baseText,targetText,currentText,skillPaths:[path],pluginIds:[id],...edit}), {kind:'config-transform-failed'});
});
