import { presentAppearance } from './lifecycle.mjs';
import { resolveAppearanceEvidence, assertAppearanceEvidenceCurrent } from './evidence.mjs';
import { fail, USER_SOURCE_ERROR_KINDS } from '../sources/errors.mjs';

export async function appearanceView(w, stored, after) {
  const assessmentCheckedAt = new Date().toISOString();
  const state = stored.state, items = state?.items ?? [];
  const index = after === undefined ? -1 : items.findIndex(i => i.id === after);
  if (after !== undefined && index < 0) fail('appearance-not-owned');
  const rows = items.slice(index + 1, index + 21);
  const selectedItem = items.find(i => i.id === state?.selectedItemId) ?? null;
  const evidenceStartId = state?.evidenceStartId ?? null;
  let evidence = null, evidenceIssue = null, applicable = false;
  if (evidenceStartId) {
    try {
      evidence = await resolveAppearanceEvidence(w, evidenceStartId);
      if (evidence.context) {
        await assertAppearanceEvidenceCurrent(w, evidence);
        applicable = true;
      }
    } catch (e) { evidenceIssue = USER_SOURCE_ERROR_KINDS.includes(e?.kind) ? e.kind : 'appearance-ineligible'; }
  }
  if (state && state.scopeId !== w.scopeId) applicable = false;
  const unknownContext = { scopeId: state?.scopeId ?? w.scopeId, app: `${w.reg.context.application ?? 'codex'}-desktop`, model: null,
    loadoutId: w.state.snapshotId, taskCriteriaId: null, baselineId: null, evidenceVersion: null };
  const presentation = state ? presentAppearance(state,
    { ...(applicable ? evidence.context : unknownContext), mode: w.state.preparedMode },
    applicable ? { context: evidence.context, assessment: evidence.assessment } : null) : null;
  return { scopeId: w.scopeId, collectionScopeId: w.rootScopeId ?? w.scopeId, preparedRevision: w.state.revision, stateId: stored.stateId, recoveryRequired: stored.journal !== null,
    pendingStateId: stored.journal?.value.nextStateId ?? null, selectedItem,
    itemCount: items.length, collection: rows.map(i => ({ id: i.id, name: i.name ?? null, kind: i.kind ?? 'recipe',
      origin: i.kind === 'layered' ? 'imported' : i.recipe.origin, paletteId: i.recipe?.palette.id ?? null, details: i.recipe?.details ?? null,
      author: i.author ?? null, parentItemId: i.parentItemId ?? null,
      achievementId: i.acquisition?.achievementId ?? null })),
    nextCursor: index + 1 + rows.length < items.length ? rows.at(-1).id : null,
    achievements: (state?.achievements ?? []).map(a => ({ achievementId: a.achievementId,
      adoptedCandidateId: a.adoptedCandidateId, parentItemId: a.parentItemId, app: a.context.app, model: a.context.model })),
    evidenceStartId, evidence, evidenceIssue, applicable,
    assessmentCheckedAt, assessmentBasis: 'selected-comparison-and-prepared-settings', runningTaskVerified: false,
    creationAvailable: !stored.journal,
    presentation };
}
