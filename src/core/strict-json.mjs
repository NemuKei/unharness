// Parse JSON without last-key-wins ambiguity. Callers own byte limits and
// operation-specific schema validation; this returns any valid JSON value.
// Every failure throws Error with kind and message exactly "invalid-request".
export function parseStrictJson(text) {
  try {
    if (typeof text !== 'string') throw Error();
    const value = JSON.parse(text);
    rejectDuplicateKeys(text);
    return value;
  } catch {
    throw Object.assign(new Error('invalid-request'), { kind: 'invalid-request' });
  }
}

// JSON.parse has already checked syntax. Inspect object-key tokens separately
// because its last-key-wins behavior would silently change an assessment.
function rejectDuplicateKeys(text) {
  const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|[{}[\]:,]/g) ?? [];
  const stack = [];
  for (const [index, token] of tokens.entries()) {
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const key = JSON.parse(token), keys = stack.at(-1);
      if (keys.has(key)) throw Error('invalid-request');
      keys.add(key);
    }
  }
}
