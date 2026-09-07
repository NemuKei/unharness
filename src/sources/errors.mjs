export const USER_SOURCE_ERROR_KINDS = Object.freeze([
  'invalid-request',
  'source-redirection',
  'unsupported-metadata',
  'unsupported-platform',
  'source-too-large',
  'snapshot-too-large',
  'discovery-failed',
  'stale-discovery',
  'optional-role-required',
  'unsupported-source',
  'profile-owned',
  'workspace-invalid',
  'record-invalid',
  'source-conflict',
  'stale-plan',
  'profile-busy',
  'recovery-required',
  'journal-invalid',
  'foreign-stage',
  'operation-failed',
  'unsupported-skill-policy',
  'config-transform-failed'
]);
export function fail(kind) {
  const e = new Error(kind);
  e.name = 'UserSourceError';
  e.kind = kind;
  throw e;
}
export async function privateCall(fn) {
  try {
    return await fn();
  } catch (e) {
    if (USER_SOURCE_ERROR_KINDS.includes(e?.kind)) throw e;
    fail('operation-failed');
  }
}
export const verification = Object.freeze({
  runtimeStateVerified: false,
  modeSwitchingVerified: false,
  sourceCoverage: 'unknown',
  nextTaskRequired: true
});
