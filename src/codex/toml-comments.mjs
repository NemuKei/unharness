// This is a conservative trivia guard, not a TOML parser. Native config/read
// validates TOML and provides semantic comparison; this detects comment loss
// from the native editor's array replacement without rewriting/re-homing text.
function comments(text) {
  const found = [];
  let quote = null;
  let multiline = false;
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (quote === null) {
      if (char === '#') {
        const start = i;
        while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i += 1;
        found.push(text.slice(start, i));
      } else if (char === '"' || char === "'") {
        quote = char;
        multiline = text.slice(i, i + 3) === char.repeat(3);
        i += multiline ? 3 : 1;
      } else i += 1;
    } else if (quote === '"' && char === '\\') {
      if (i + 1 >= text.length) return null;
      i += 2;
    } else if (char === quote) {
      if (!multiline) { quote = null; i += 1; }
      else {
        let end = i;
        while (text[end] === quote) end += 1;
        const count = end - i;
        if (count > 5) return null; // Ambiguous or unsupported delimiter run.
        if (count >= 3) quote = null;
        i = end;
      }
    } else {
      if (!multiline && (char === '\n' || char === '\r')) return null;
      i += 1;
    }
  }
  return quote === null ? found : null;
}

export function preservesTomlComments(before, after) {
  const original = comments(before);
  const next = comments(after);
  return original !== null && next !== null && original.length === next.length
    && original.every((comment, i) => comment === next[i]);
}
