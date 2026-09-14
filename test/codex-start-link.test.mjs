import test from 'node:test';
import assert from 'node:assert/strict';
import { codexDraftLink } from '../web/src/entry/codex-start.ts';

test('Codex handoff preserves multilingual prompts without turning their URLs into routing parameters', () => {
  for (const prompt of [
    'アンハーネスを始めたいです。\n配布元: https://example.invalid/release?a=1&mode=chat#確認 + 100%',
    'Start Unharness.\nCheck https://example.invalid/?path=/tmp/example&prompt=other first.',
  ]) {
    const url = new URL(codexDraftLink(prompt));
    assert.equal(url.protocol, 'codex:');
    assert.equal(url.hostname, 'new');
    assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams.keys()].sort(), ['mode', 'prompt']);
    assert.equal(url.searchParams.get('mode'), 'codex');
    assert.equal(url.searchParams.get('prompt'), prompt);
  }
});
