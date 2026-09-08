import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStrictJson } from '../src/core/strict-json.mjs';

test('strict JSON rejects decoded duplicate object keys at every depth without leaking input', () => {
  for (const text of [
    '{"outcome":"failed","outcome":"accepted"}',
    '{"nested":{"id":1,"\\u0069d":2}}',
    '[{"id":1,"id":2}]', '{"a":1,"a":2,"raw":"PRIVATE"}',
    '{"__proto__":1,"__proto__":2}',
  ]) assert.throws(() => parseStrictJson(text), error => error.kind === 'invalid-request' && error.message === 'invalid-request');
});
test('strict JSON preserves valid values and independent keys, including escaped strings', () => {
  for (const value of [null, false, 42, 'PRIVATE } \\" :, [ {', [], [1, 'value', { id: 1 }, { id: 2 }], { a: { id: 1 }, b: { id: 2 }, braces: '{"a":2,"a":3}', '\\': '"' }]) {
    assert.deepEqual(parseStrictJson(JSON.stringify(value)), value);
  }
});
test('strict JSON syntax and non-string errors use only the fixed error contract', () => {
  for (const input of [null, 1, {}, '', '{', '{"a":NaN}', '{"PRIVATE":}', '{"a":1} trailing']) {
    assert.throws(() => parseStrictJson(input), error => error.kind === 'invalid-request' && error.message === 'invalid-request');
  }
});
