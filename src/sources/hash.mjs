// Stable content hashing shared by capture and the application adapters.
// Key order never affects an identity, so a re-read of the same sources
// reproduces the same discovery, source and snapshot identifiers.
import { createHash } from 'node:crypto';

const ordered = (x) =>
  Array.isArray(x)
    ? x.map(ordered)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, ordered(x[k])])
        )
      : x;

export const hash = (x) =>
  createHash('sha256')
    .update(JSON.stringify(ordered(x)))
    .digest('hex');
