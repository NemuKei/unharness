export const USER_SOURCE_ERROR_KINDS = Object.freeze([
  'invalid-request',
  'starting-declaration-invalid',
  'starting-path-invalid',
  'starting-files-limit',
  'starting-files-unsupported',
  'starting-files-changed',
  'starting-record-invalid',
  'starting-inventory-unavailable',
  'starting-project-root-required',
  'starting-project-contains-store',
  'starting-publication-uncertain',
  'comparison-record-invalid',
  'comparison-assessment-invalid',
  'comparison-source-unavailable',
  'comparison-task-record-unavailable',
  'comparison-task-record-invalid',
  'comparison-measurement-invalid',
  'comparison-run-input-invalid',
  'comparison-run-task-mismatch',
  'comparison-run-project-mismatch',
  'comparison-run-cutoff-invalid',
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
  'no-retained-change',
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
    fail(
      USER_SOURCE_ERROR_KINDS.includes(e?.kind) ? e.kind : 'operation-failed'
    );
  }
}
export const verification = Object.freeze({
  runtimeStateVerified: false,
  modeSwitchingVerified: false,
  sourceCoverage: 'unknown',
  nextTaskRequired: true
});
