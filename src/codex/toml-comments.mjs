import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

// This is a conservative trivia guard, not a TOML parser. Native config/read
// validates semantics. Comments bind to their lexical prefix, inline/standalone
// placement and (for standalone comments) the following key or table header.
// Formatting changes are allowed; ambiguous associations fail closed.
function comments(text) {
  const found = [];
  const prefix = createHash('sha256');
  let following = null;
  let followingHash;
  let previous = [];
  let lineHasCode = false;
  let quote = null;
  let multiline = false;
  let stringStart;

  function finishFollowing() {
    if (following) following.digest = followingHash.digest('hex');
    following = null;
  }

  function token(value) {
    if (following) {
      followingHash.update(JSON.stringify(value));
      if (value === '=') finishFollowing();
    }
    // The only permitted value edit is selected enabled=true -> false. Keep
    // those two values at the same lexical position without masking strings,
    // keys, paths, or any other token. Full semantic validation remains separate.
    const comparable = previous[0] === 'enabled' && previous[1] === '='
      && (value === 'true' || value === 'false') ? '<enabled-boolean>' : value;
    prefix.update(JSON.stringify(comparable));
    previous = [previous.at(-1), value];
    lineHasCode = true;
  }

  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (quote === null) {
      if (char === '#') {
        const start = i;
        while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i += 1;
        if (!lineHasCode && !following) {
          following = {};
          followingHash = createHash('sha256');
        }
        found.push({ text: text.slice(start, i), prefix: prefix.copy().digest('hex'), inline: lineHasCode, following: lineHasCode ? null : following });
      } else if (char === '"' || char === "'") {
        stringStart = i;
        quote = char;
        multiline = text.slice(i, i + 3) === char.repeat(3);
        i += multiline ? 3 : 1;
      } else if (/\s/.test(char)) {
        if (char === '\n' || char === '\r') {
          if (lineHasCode) finishFollowing();
          lineHasCode = false;
        }
        i += 1;
      } else {
        const start = i;
        if (/[A-Za-z0-9_+-]/.test(char)) {
          while (i < text.length && /[A-Za-z0-9_+-]/.test(text[i])) i += 1;
        } else i += 1;
        token(text.slice(start, i));
      }
    } else if (quote === '"' && char === '\\') {
      if (i + 1 >= text.length) return null;
      i += 2;
    } else if (char === quote) {
      if (!multiline) { quote = null; i += 1; }
      else {
        let end = i;
        while (text[end] === quote) end += 1;
        const count = end - i;
        if (count > 5) return null;
        if (count >= 3) quote = null;
        i = end;
      }
      if (quote === null) token(text.slice(stringStart, i));
    } else {
      if (!multiline && (char === '\n' || char === '\r')) return null;
      i += 1;
    }
  }
  finishFollowing();
  return quote === null ? found : null;
}

export function preservesTomlComments(before, after) {
  const original = comments(before);
  const next = comments(after);
  return original !== null && next !== null && isDeepStrictEqual(original, next);
}
