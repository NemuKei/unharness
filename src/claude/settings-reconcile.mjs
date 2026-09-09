// Three-way reconciliation of independently edited Claude Code user settings.
//
// The settings file holds both managed state (the `skillOverrides` entries for
// registered Skills) and retained state (everything else the user configures:
// permissions, memory, model, status line...). A retained-only edit can be
// recorded as a new Normal; an edit that changes a managed entry is a conflict.
//
// JSON has no comments and no line-level ambiguity, so this is a structural
// merge with the same provable partition contract as the Codex TOML merge,
// rather than a textual three-way diff.
import { isDeepStrictEqual } from 'node:util';
import { parseStrictJson } from '../core/strict-json.mjs';
import {
  MAX_SETTINGS_BYTES,
  SKILL_OVERRIDE_VALUES,
  validSkillName
} from './settings.mjs';

const failed = () =>
  Object.assign(new Error('Claude settings cannot be safely reconciled'), {
    kind: 'config-transform-failed'
  });

const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function parse(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_SETTINGS_BYTES)
    throw failed();
  if (!text.trim()) return {};
  let value;
  try {
    value = parseStrictJson(text);
  } catch {
    throw failed();
  }
  if (!plainObject(value)) throw failed();
  assertProvable(value);
  return value;
}

// A value that cannot round-trip through JSON exactly must not be rewritten.
function assertProvable(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertProvable(item);
    return;
  }
  if (!plainObject(value)) {
    if (
      typeof value === 'number' &&
      (!Number.isFinite(value) ||
        (Number.isInteger(value) && !Number.isSafeInteger(value)))
    )
      throw failed();
    return;
  }
  for (const key of Object.keys(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw failed();
    assertProvable(value[key]);
  }
}

/** Split a settings document into its managed and retained halves. */
export function partition(settings, skillNames) {
  const selectedNames = new Set(skillNames);
  const overrides = Object.hasOwn(settings, 'skillOverrides')
    ? settings.skillOverrides
    : null;
  if (overrides !== null && !plainObject(overrides)) throw failed();
  for (const [name, setting] of Object.entries(overrides ?? {}))
    if (!validSkillName(name) || !SKILL_OVERRIDE_VALUES.includes(setting))
      throw failed();
  const selected = {},
    unselected = {};
  for (const [name, setting] of Object.entries(overrides ?? {}))
    (selectedNames.has(name) ? selected : unselected)[name] = setting;
  const retained = structuredClone(settings);
  if (overrides !== null) {
    if (Object.keys(unselected).length) retained.skillOverrides = unselected;
    else delete retained.skillOverrides;
  }
  return { selected, unselected, retained };
}

function layoutOf(text) {
  if (!text.trim()) return { indent: 2, newline: true };
  const match = text.match(/\n([ \t]+)"/);
  return {
    indent: match ? (match[1].includes('\t') ? '\t' : match[1].length) : 2,
    newline: text.endsWith('\n')
  };
}

/**
 * Compose the user's independently edited retained settings with the managed
 * Skill overrides of the target snapshot. Returns the text of the new Normal.
 */
export function mergeRetainedSettings({ baseText, targetText, currentText, skillNames }) {
  try {
    if (
      !Array.isArray(skillNames) ||
      skillNames.length > 32 ||
      new Set(skillNames).size !== skillNames.length ||
      skillNames.some((name) => !validSkillName(name))
    )
      throw failed();
    const base = parse(baseText),
      target = parse(targetText),
      current = parse(currentText);
    const baseParts = partition(base, skillNames),
      targetParts = partition(target, skillNames),
      currentParts = partition(current, skillNames);
    // The active Normal and the prepared snapshot must agree on retained state,
    // and the independent edit must not have touched a managed entry.
    if (
      !isDeepStrictEqual(targetParts.retained, baseParts.retained) ||
      !isDeepStrictEqual(currentParts.selected, baseParts.selected)
    )
      throw failed();

    const overrides = { ...currentParts.unselected, ...targetParts.selected };
    const merged = {};
    for (const [key, value] of Object.entries(current))
      if (key !== 'skillOverrides') merged[key] = value;
      else if (Object.keys(overrides).length) merged.skillOverrides = overrides;
    if (!Object.hasOwn(merged, 'skillOverrides') && Object.keys(overrides).length)
      merged.skillOverrides = overrides;

    const layout = layoutOf(currentText);
    const text = Object.keys(merged).length
      ? JSON.stringify(merged, null, layout.indent) + (layout.newline ? '\n' : '')
      : '';
    if (Buffer.byteLength(text, 'utf8') > MAX_SETTINGS_BYTES) throw failed();

    const resultParts = partition(parse(text), skillNames);
    if (
      !isDeepStrictEqual(resultParts.selected, targetParts.selected) ||
      !isDeepStrictEqual(resultParts.retained, currentParts.retained)
    )
      throw failed();
    return { text, changed: text !== currentText };
  } catch (e) {
    if (e.kind === 'config-transform-failed') throw e;
    throw failed();
  }
}
