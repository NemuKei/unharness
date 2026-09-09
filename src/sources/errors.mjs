export const USER_SOURCE_ERROR_KINDS = Object.freeze([
  'invalid-request',
  'appearance-recipe-invalid',
  'appearance-state-invalid',
  'appearance-record-invalid',
  'appearance-state-conflict',
  'appearance-publication-uncertain',
  'appearance-recovery-required',
  'appearance-not-owned',
  'appearance-ineligible',
  'appearance-candidate-unavailable',
  'appearance-choice-final',
  'appearance-collection-full',
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
  'replay-destination-occupied',
  'replay-destination-changed',
  'replay-files-unsupported',
  'replay-materialization-incomplete',
  'replay-repository-unavailable',
  'replay-location-invalid',
  'replay-location-exists',
  'replay-location-incomplete',
  'replay-source-unmapped',
  'replay-source-input-mismatch',
  'replay-source-state-unavailable',
  'replay-application-unsupported',
  'replay-native-conditions-unavailable',
  'replay-retained-conditions-changed',
  'replay-record-invalid',
  'replay-publication-uncertain',
  'replay-preparation-stale',
  'replay-active-attempt',
  'replay-attempt-unavailable',
  'replay-attempt-budget-exhausted',
  'replay-git-state-changed',
  'replay-assessment-invalid',
  'replay-assessment-conflict',
  'replay-result-unavailable',
  'replay-task-record-unavailable',
  'replay-task-record-invalid',
  'replay-task-record-changed',
  'replay-outcome-files-unavailable',
  'replay-desktop-open-unavailable',
  'replay-desktop-open-uncertain',
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
