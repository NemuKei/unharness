// Only versions whose native configuration write and readback contract has
// been qualified may authorize a new source configuration.
export const QUALIFIED_CODEX_CONFIG_VERSIONS = Object.freeze(['0.153.4']);

const identifier = '[0-9A-Za-z](?:[0-9A-Za-z-]{0,30}[0-9A-Za-z])?';
const suffix = `(?:${identifier})(?:\\.${identifier}){0,4}`;
const version = new RegExp(`^\\d{1,8}\\.\\d{1,8}\\.\\d{1,8}(?:-${suffix})?(?:\\+${suffix})?$`);

export const isCodexVersion = value => typeof value === 'string' && value.length <= 160 && version.test(value);
export const isQualifiedCodexConfigVersion = value => QUALIFIED_CODEX_CONFIG_VERSIONS.includes(value);

export function parseCodexVersionFromUserAgent(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.match(/^[^/\r\n]{1,80}\/([^\s(]{1,160})(?=[ (]|$)/)?.[1];
  return isCodexVersion(candidate) ? candidate : null;
}

export function assertQualifiedCodexConfigVersion(value) {
  if (!isQualifiedCodexConfigVersion(value))
    throw Object.assign(new Error('Codex configuration version is not qualified'), { kind: 'codex-version-unqualified' });
}
