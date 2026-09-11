// Codex host-skill listing grammar, extracted from the task observation so the
// application adapters can share it without importing observation projection.
import { isDeepStrictEqual } from 'node:util';
import { absolute, pathApi, samePath } from '../sources/paths.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A deliberately narrow parser for the native catalog grammar. Any unresolved
// reference prevents absence claims, even when another entry happens to match.
export function parseSkillCatalog(value) {
  if (
    !object(value) ||
    value.includeInstructions !== true ||
    typeof value.body !== 'string'
  )
    return null;
  const lines = value.body.replaceAll('\r\n', '\n').split('\n');
  const roots = new Map(),
    entries = [];
  let section = null,
    rootsSeen = false,
    availableSeen = false;
  for (const line of lines) {
    if (line === '### Skill roots') {
      if (rootsSeen || availableSeen) return null;
      rootsSeen = true;
      section = 'roots';
      continue;
    }
    if (line === '### Available skills') {
      if (availableSeen) return null;
      availableSeen = true;
      section = 'skills';
      continue;
    }
    if (!section || !line.trim() || line === '</skills_instructions>') continue;
    if (section === 'roots') {
      const m = line.match(/^- `([a-zA-Z][a-zA-Z0-9]*)` = `([^`]+)`$/);
      if (!m || roots.has(m[1]) || !absolute(m[2])) return null;
      roots.set(m[1], m[2]);
    } else {
      const m = line.match(/^- (\S+): [^\r\n]* \(file: ([^\r\n]+)\)$/);
      if (!m) return null;
      let path = m[2];
      if (!absolute(path)) {
        const alias = path.match(/^([a-zA-Z][a-zA-Z0-9]*)\/(.+)$/);
        if (
          !alias ||
          !roots.has(alias[1]) ||
          alias[2].split(/[\\/]/).some((p) => !p || p === '.' || p === '..')
        )
          return null;
        path = pathApi(roots.get(alias[1])).join(roots.get(alias[1]), alias[2]);
      }
      if (
        !absolute(path) ||
        entries.some((e) => e.name === m[1] || samePath(e.path, path))
      )
        return null;
      entries.push({ name: m[1], path });
    }
  }
  return availableSeen ? entries : null;
}

export function selectedSkillIntent(normalFlags, preparedFlags, registeredEnabled, { allowEnable = false } = {}) {
  if (isDeepStrictEqual(normalFlags, preparedFlags)) return registeredEnabled;
  if (preparedFlags.length && preparedFlags.every((value) => value === false))
    return false;
  if (allowEnable && preparedFlags.length && preparedFlags.every(value => value === true)) return true;
  return null;
}
