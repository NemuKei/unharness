import { isDeepStrictEqual } from 'node:util';
import { parse } from '../vendor/smol-toml/parse.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function retained(text, selectedPaths) {
  // The pinned, bundled reader supports native TOML forms during offline
  // frozen restores. BigInt keeps integer type and precision distinct.
  const config = parse(text, { integersAsBigInt: true, maxDepth: 100 });
  if (Object.hasOwn(config, 'skills') && !object(config.skills)) throw Error();
  const entries = config.skills?.config ?? [];
  if (!Array.isArray(entries) || entries.some(entry => !object(entry)
    || typeof entry.path !== 'string' || typeof entry.enabled !== 'boolean')) throw Error();
  const kept = [];
  for (const entry of entries) {
    if (!selectedPaths.has(entry.path)) kept.push(entry);
    else {
      // Only invocation enablement is mutable. Retain any extra metadata on a
      // selected entry, including across older frozen snapshots.
      const { enabled, ...other } = entry;
      if (Object.keys(other).length > 1) kept.push(other);
    }
  }
  if (config.skills) {
    if (kept.length) config.skills.config = kept;
    else delete config.skills.config;
    if (!Object.keys(config.skills).length) delete config.skills;
  }
  return config;
}

export function preservesUnselectedConfig(before, after, selectedPaths) {
  if (before === after) return true;
  try {
    const paths = new Set(selectedPaths);
    return isDeepStrictEqual(retained(before, paths), retained(after, paths));
  } catch { return false; }
}
