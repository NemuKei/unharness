// Claude Code user settings transform.
//
// Claude Code centralises Skill invocation policy in one user-scope settings
// file rather than in per-Skill sidecars, so this is the only file Unharness
// writes for Skill state. SKILL.md is captured and guarded but never rewritten
// to change invocation policy.
//
// Only the `skillOverrides` entries for explicitly selected Skill names change.
// Every other key, including unselected override entries, must survive
// byte-for-byte in value and in key order; a document that cannot prove that
// is rejected rather than rewritten.
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../core/strict-json.mjs';

export const MAX_SETTINGS_BYTES = 128 * 1024;

// "on" and "name-only" both leave the Skill listed to the model, so neither is
// used as a release-mode target. UNSEAL keeps the Skill manually invocable;
// TRUEFORM removes it from both surfaces.
export const SKILL_OVERRIDE_VALUES = Object.freeze([
  'on',
  'name-only',
  'user-invocable-only',
  'off'
]);
export const MANUAL_ONLY_OVERRIDE = 'user-invocable-only';
export const DISABLED_OVERRIDE = 'off';
// An override that still lets the model select the Skill on its own.
export const AUTOMATIC_OVERRIDES = Object.freeze(['on', 'name-only']);

// A Skill override key is the invocation name Claude Code shows in the "/"
// menu: a personal Skill's directory name, or "plugin:name" for a plugin one.
export const validSkillName = (name) =>
  typeof name === 'string' &&
  name.length > 0 &&
  name.length <= 256 &&
  !/[\u0000-\u001f\u007f\s]/u.test(name);

const failed = () =>
  Object.assign(new Error('Claude settings cannot be safely transformed'), {
    kind: 'config-transform-failed'
  });

const plainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// A JSON document may legitimately contain a "__proto__" member, but carrying
// one through an object literal would mutate a prototype instead of a value.
function assertSafeKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertSafeKeys(item);
    return;
  }
  if (!plainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw failed();
    assertSafeKeys(value[key]);
  }
}

// Strings first, so digits inside a string value are never read as a number.
const JSON_TOKENS = /"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

/**
 * Refuse a document containing a number this process cannot reproduce.
 *
 * Parsing happens before any comparison, so a literal outside the double range
 * - 9007199254740993, say - is already rounded by the time a parsed before/after
 * check runs, and rewriting would silently change a retained value. Comparing
 * each source token against its own re-serialization catches that, and also the
 * narrower cases (1e2, 1.0, -0) where the value survives but the bytes do not.
 */
export function assertReproducibleNumbers(text) {
  for (const [token] of text.matchAll(JSON_TOKENS)) {
    if (token.startsWith('"')) continue;
    let reproduced;
    try {
      reproduced = JSON.stringify(JSON.parse(token));
    } catch {
      throw failed();
    }
    if (reproduced !== token) throw failed();
  }
}

function parseSettings(text) {
  if (typeof text !== 'string') throw failed();
  if (Buffer.byteLength(text, 'utf8') > MAX_SETTINGS_BYTES) throw failed();
  if (!text.trim()) return { value: {}, absent: true };
  let value;
  try {
    value = parseStrictJson(text);
  } catch {
    throw failed();
  }
  if (!plainObject(value)) throw failed();
  assertSafeKeys(value);
  assertReproducibleNumbers(text);
  return { value, absent: false };
}

export function readSkillOverrides(text) {
  const { value } = parseSettings(text ?? '');
  if (!Object.hasOwn(value, 'skillOverrides')) return {};
  const overrides = value.skillOverrides;
  if (!plainObject(overrides)) throw failed();
  for (const [name, setting] of Object.entries(overrides))
    if (!validSkillName(name) || !SKILL_OVERRIDE_VALUES.includes(setting))
      throw failed();
  return { ...overrides };
}

// Reproduce the document's own layout so an unrelated key is not reformatted.
function layoutOf(text, absent) {
  if (absent) return { indent: 2, newline: true };
  const match = text.match(/\n([ \t]+)"/);
  const indent = match ? (match[1].includes('\t') ? '\t' : match[1].length) : 2;
  return { indent, newline: text.endsWith('\n') };
}

function serialize(value, layout) {
  const text = JSON.stringify(value, null, layout.indent);
  return layout.newline ? text + '\n' : text;
}

/**
 * Return the settings text with `skillOverrides` set for exactly `names`.
 * `setting` must be one of SKILL_OVERRIDE_VALUES. Returns the original text
 * unchanged when every selected name already carries that setting.
 */
export function setSkillOverrides(text, names, setting) {
  if (
    !Array.isArray(names) ||
    names.length > 32 ||
    new Set(names).size !== names.length ||
    names.some((name) => !validSkillName(name)) ||
    !SKILL_OVERRIDE_VALUES.includes(setting)
  )
    throw failed();
  const source = text ?? '';
  const { value: before, absent } = parseSettings(source);
  const currentOverrides = readSkillOverrides(source);
  if (names.every((name) => currentOverrides[name] === setting)) return source;
  const overrides = { ...currentOverrides };
  for (const name of names) overrides[name] = setting;

  // Keep skillOverrides in its existing position when the key already exists.
  const after = {};
  for (const [key, keyValue] of Object.entries(before))
    after[key] = key === 'skillOverrides' ? overrides : keyValue;
  if (!Object.hasOwn(after, 'skillOverrides')) after.skillOverrides = overrides;

  const next = serialize(after, layoutOf(source, absent));
  if (Buffer.byteLength(next, 'utf8') > MAX_SETTINGS_BYTES) throw failed();

  // Prove the round trip: every unrelated key keeps its value and position,
  // and the override map is exactly what was intended.
  const { value: verified } = parseSettings(next);
  const strip = (v) => {
    const { skillOverrides, ...rest } = v;
    return rest;
  };
  if (
    !isDeepStrictEqual(strip(verified), strip(before)) ||
    !isDeepStrictEqual(Object.keys(strip(verified)), Object.keys(strip(before))) ||
    !isDeepStrictEqual(verified.skillOverrides, overrides)
  )
    throw failed();
  return next;
}
