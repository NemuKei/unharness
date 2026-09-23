// Parse only bounded leading YAML data. The content never becomes authority.
const MAX_FRONTMATTER_BYTES = 64 * 1024;
export async function readSkillFrontmatter(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) return {};
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = normalized.slice(4, end + 1);
  if (Buffer.byteLength(block, 'utf8') > MAX_FRONTMATTER_BYTES) return null;
  try {
    const { parseDocument, isMap, isScalar, isAlias, visit } = await import('yaml');
    const doc = parseDocument(block, { logLevel: 'silent', prettyErrors: false, uniqueKeys: true, strict: true });
    if (doc.errors.length || doc.warnings.length) return null;
    visit(doc, { Node(_key, node) {
      if (isAlias(node) || node.anchor || node.tag) throw Error('unsupported');
      if (isMap(node) && node.items.some(pair => !isScalar(pair.key) || typeof pair.key.value !== 'string')) throw Error('unsupported');
    } });
    if (doc.contents === null) return {};
    if (!isMap(doc.contents)) return null;
    return doc.toJS({ maxAliasCount: 0 }) ?? {};
  } catch { return null; }
}
export function descriptionFromFrontmatter(front) {
  const value = front?.description;
  if (typeof value !== 'string') return null;
  const description = value.replace(/\s+/g, ' ').trim();
  return description && description.length <= 500 && !/[\u0000-\u001f\u007f-\u009f]/.test(description)
    ? description : null;
}
export async function readSkillDescription(text) {
  return descriptionFromFrontmatter(await readSkillFrontmatter(text));
}
