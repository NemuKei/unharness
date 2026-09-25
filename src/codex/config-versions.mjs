// Native configuration contracts are qualified per operation. In particular,
// a successful disable/readback cannot authorize enabling a Skill or editing
// plugin tables on the same version.
export const CODEX_CONFIG_OPERATIONS = Object.freeze({
  '0.153.4': Object.freeze(['read', 'disable', 'enable', 'plugin-disable']),
  '0.155.0-alpha.16.3': Object.freeze(['read', 'disable']),
});
export const QUALIFIED_CODEX_CONFIG_VERSIONS = Object.freeze(Object.keys(CODEX_CONFIG_OPERATIONS));

const identifier = '[0-9A-Za-z](?:[0-9A-Za-z-]{0,30}[0-9A-Za-z])?';
const suffix = `(?:${identifier})(?:\\.${identifier}){0,4}`;
const version = new RegExp(`^\\d{1,8}\\.\\d{1,8}\\.\\d{1,8}(?:-${suffix})?(?:\\+${suffix})?$`);

export const isCodexVersion = value => typeof value === 'string' && value.length <= 160 && version.test(value);
export const canCodexConfigOperation = (value, operation) => typeof value === 'string'
  && Object.hasOwn(CODEX_CONFIG_OPERATIONS, value) && CODEX_CONFIG_OPERATIONS[value].includes(operation);
// A fully qualified version also supports the legacy enable and plugin paths.
// Task-observation qualification remains conservative until separately tested.
export const isQualifiedCodexConfigVersion = value => ['read', 'disable', 'enable', 'plugin-disable']
  .every(operation => canCodexConfigOperation(value, operation));

export function parseCodexVersionFromUserAgent(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.match(/^[^/\r\n]{1,80}\/([^\s(]{1,160})(?=[ (]|$)/)?.[1];
  return isCodexVersion(candidate) ? candidate : null;
}

export function assertQualifiedCodexConfigVersion(value, operation = 'enable') {
  if (!canCodexConfigOperation(value, operation))
    throw Object.assign(new Error('Codex configuration operation is not qualified'), {
      kind: 'codex-version-unqualified',
      ...(operation === 'enable' && canCodexConfigOperation(value, 'disable') ? { reason: 'skill-enable' } : {}),
    });
}

// Bundled decisions remain synchronous for old records and task-observation
// proof. A live configuration operation also checks a result bound to the
// actual executable and this Unharness source revision.
export async function assertQualifiedCodexConfigOperation(input) {
  const { assertCodexConfigOperation } = await import('./config-self-qualify.mjs');
  return assertCodexConfigOperation(input);
}
