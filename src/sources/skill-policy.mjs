import { isDeepStrictEqual } from 'node:util';

const MAX_BYTES = 128 * 1024;
const unsupported = () => Object.assign(new Error('Skill metadata cannot be safely transformed'), { kind: 'unsupported-skill-policy' });

// YAML stays outside the read-only diagnostic import graph until an edit is requested.
export async function makeManualSkillPolicy(originalText) {
  try {
    if (originalText !== null && typeof originalText !== 'string') throw unsupported();
    const text = originalText ?? '';
    if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw unsupported();
    const { parseDocument, parseAllDocuments, isMap, isScalar, isAlias, visit } = await import('yaml');
    const parse = (source) => {
      // In yaml 2.9, silent parseDocument omits MULTIPLE_DOCS errors.
      if (parseAllDocuments(source, { logLevel: 'silent', prettyErrors: false }).length > 1) throw unsupported();
      const doc = parseDocument(source, { logLevel: 'silent', prettyErrors: false, uniqueKeys: true, strict: true, intAsBigInt: true });
      if (doc.errors.length || doc.warnings.length) throw unsupported();
      visit(doc, {
        Node(_key, node) {
          // Anchors, aliases and explicit tags are unsupported rather than resolved
          // into copies that could silently alter unrelated metadata.
          if (isAlias(node) || node.anchor || node.tag) throw unsupported();
          if (isMap(node) && node.items.some(pair => !isScalar(pair.key) || typeof pair.key.value !== 'string')) throw unsupported();
        },
      });
      if (doc.contents !== null && !isMap(doc.contents)) throw unsupported();
      return doc;
    };
    const doc = parse(text);
    const before = doc.toJS({ maxAliasCount: 0 }) ?? {};
    if (Object.hasOwn(before, 'policy') && (before.policy === null || typeof before.policy !== 'object' || Array.isArray(before.policy))) throw unsupported();
    if (before.policy && Object.hasOwn(before.policy, 'allow_implicit_invocation') && typeof before.policy.allow_implicit_invocation !== 'boolean') throw unsupported();
    if (before.policy?.allow_implicit_invocation === false) return text;
    const expected = structuredClone(before);
    expected.policy = { ...expected.policy, allow_implicit_invocation: false };
    doc.setIn(['policy', 'allow_implicit_invocation'], false);
    const next = doc.toString();
    if (Buffer.byteLength(next, 'utf8') > MAX_BYTES || !isDeepStrictEqual(parse(next).toJS({ maxAliasCount: 0 }), expected)) throw unsupported();
    return next;
  } catch {
    // Parser diagnostics may contain source text; never attach them as a cause.
    throw unsupported();
  }
}
