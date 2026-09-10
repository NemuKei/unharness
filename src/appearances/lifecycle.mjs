import { isDeepStrictEqual } from 'node:util';
import { recordId } from '../core/local-store.mjs';
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { discoverRecipe, candidateRecipes, validateRecipe, appearanceRecipeId } from './recipe.mjs';
import { validateLayeredAppearance } from './template.mjs';

const invalid = () => fail('appearance-state-invalid');
const shape = (value, keys, optional = []) => exactKeys(value, keys, optional, 'appearance-state-invalid');
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const contextKeys = ['scopeId', 'app', 'model', 'loadoutId', 'taskCriteriaId', 'baselineId', 'evidenceVersion'];
function validateContext(value, allowUnknown = false) {
  shape(value, contextKeys);
  const unknown = key => allowUnknown && key !== 'scopeId' && value[key] === null;
  if (contextKeys.filter(k => !['app', 'model'].includes(k)).some(k => !unknown(k) && !hash(value[k]))
    || !unknown('app') && (typeof value.app !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value.app))) invalid();
  if (!unknown('model')) boundedText(value.model, 200, false, 'appearance-state-invalid');
}
function results(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 40 || !value.every(hash) || new Set(value).size !== value.length) invalid();
}
function candidate(value) {
  shape(value, ['id', 'recipe']);
  validateRecipe(value.recipe);
  if (value.id !== appearanceRecipeId(value.recipe)) invalid();
}
function acquisition(value, scopeId) {
  shape(value, ['achievementId', 'context', 'resultIds']);
  if (!hash(value.achievementId)) invalid();
  validateContext(value.context); results(value.resultIds);
  if (value.context.scopeId !== scopeId) invalid();
}
export function validateLegacyAppearanceState(value) {
  try {
    recordId('observation', value);
    shape(value, ['kind', 'schemaVersion', 'scopeId', 'revision', 'selectedItemId', 'items', 'achievements'], ['evidenceStartId']);
    if (value.kind !== 'unharness-appearance-state' || value.schemaVersion !== 1 || !hash(value.scopeId)
      || !Number.isSafeInteger(value.revision) || value.revision < 1 || !hash(value.selectedItemId)
      || !Array.isArray(value.items) || !value.items.length || value.items.length > 128
      || !Array.isArray(value.achievements) || value.achievements.length > 64
      || Object.hasOwn(value, 'evidenceStartId') && value.evidenceStartId !== null && !hash(value.evidenceStartId)) invalid();
    const items = new Map(), achievements = new Set();
    for (const item of value.items) {
      shape(item, ['id', 'recipe', 'acquisition'], ['name']); candidate({ id: item.id, recipe: item.recipe });
      if (Object.hasOwn(item, 'name')) boundedText(item.name, 80, false, 'appearance-state-invalid');
      if (items.has(item.id)) invalid();
      if (item.acquisition !== null) acquisition(item.acquisition, value.scopeId);
      if ((item.acquisition === null) !== (item.recipe.origin === 'prepared')) invalid();
      items.set(item.id, item);
    }
    if (!items.has(value.selectedItemId)) invalid();
    for (const set of value.achievements) {
      shape(set, ['achievementId', 'context', 'resultIds', 'seed', 'parentItemId', 'candidates', 'adoptedCandidateId']);
      acquisition({ achievementId: set.achievementId, context: set.context, resultIds: set.resultIds }, value.scopeId);
      if (achievements.has(set.achievementId) || !hash(set.seed) || !items.has(set.parentItemId)
        || !Array.isArray(set.candidates) || set.candidates.length !== 3) invalid();
      achievements.add(set.achievementId);
      for (const c of set.candidates) {
        candidate(c);
        if (c.recipe.origin !== 'original' || c.recipe.body !== items.get(set.parentItemId).recipe.body) invalid();
      }
      if (new Set(set.candidates.map(c => c.id)).size !== 3) invalid();
      if (set.adoptedCandidateId !== null) {
        const selected = set.candidates.find(c => c.id === set.adoptedCandidateId), owned = items.get(set.adoptedCandidateId);
        if (!selected || !owned || !isDeepStrictEqual(selected.recipe, owned.recipe)
          || !isDeepStrictEqual(owned.acquisition, { achievementId: set.achievementId, context: set.context, resultIds: set.resultIds })) invalid();
      }
    }
    for (const item of value.items) {
      if (item.acquisition !== null && !value.achievements.some(a => a.achievementId === item.acquisition.achievementId && a.adoptedCandidateId === item.id)) invalid();
    }
    return structuredClone(value);
  } catch { invalid(); }
}
export function layeredItemId(item) {
  const { reviewId, requestId, parentItemId, manifest, author } = item;
  return recordId('appearance', { kind: 'unharness-layered-item', schemaVersion: 1, reviewId, requestId, parentItemId, manifest, author });
}
export function validateAppearanceState(value) {
  if (value?.schemaVersion !== 2) return validateLegacyAppearanceState(value);
  try {
    recordId('appearance', value);
    shape(value, ['kind', 'schemaVersion', 'scopeId', 'revision', 'selectedItemId', 'items', 'achievements', 'evidenceStartId', 'legacyStateId']);
    if (value.kind !== 'unharness-appearance-state' || value.legacyStateId !== null && !hash(value.legacyStateId)
      || !Array.isArray(value.items) || value.items.length > 128 || !hash(value.selectedItemId)) invalid();
    const recipes = value.items.filter(item => !Object.hasOwn(item, 'kind'));
    if (!recipes.length) invalid();
    const { legacyStateId, ...legacy } = value;
    validateLegacyAppearanceState({ ...legacy, schemaVersion: 1, selectedItemId: recipes[0].id, items: recipes });
    const seen = new Set();
    for (const item of value.items) {
      if (seen.has(item.id)) invalid();
      if (Object.hasOwn(item, 'kind')) {
        shape(item, ['id', 'kind', 'reviewId', 'requestId', 'parentItemId', 'manifest', 'author'], ['name']);
        if (item.kind !== 'layered' || !hash(item.reviewId) || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(item.requestId)
          || item.parentItemId !== null && !seen.has(item.parentItemId)) invalid();
        validateLayeredAppearance(item.manifest);
        boundedText(item.author, 80, false, 'appearance-state-invalid', true);
        if (Object.hasOwn(item, 'name')) boundedText(item.name, 80, false, 'appearance-state-invalid');
        if (item.id !== layeredItemId(item)) invalid();
      }
      seen.add(item.id);
    }
    if (!seen.has(value.selectedItemId)) invalid();
    return structuredClone(value);
  } catch { invalid(); }
}
export function appendLayeredAppearance(state, scopeId, item) {
  const current = state === null ? null : validateAppearanceState(state);
  if (current && current.scopeId !== scopeId) invalid();
  const existing = current?.items.find(value => value.reviewId === item.reviewId);
  if (existing) { if (!isDeepStrictEqual(existing, item)) invalid(); return current; }
  const result = current ?? initializeAppearance(scopeId, '0'.repeat(64));
  if (result.items.length >= 128) fail('appearance-collection-full');
  if (result.schemaVersion === 1) {
    result.legacyStateId = current ? recordId('appearance', current) : null;
    result.schemaVersion = 2;
  }
  result.evidenceStartId ??= null;
  result.revision = current ? current.revision + 1 : 1;
  result.items.push(structuredClone(item)); result.selectedItemId = item.id;
  return validateAppearanceState(result);
}
function next(state) {
  const result = validateAppearanceState(state);
  if (!Number.isSafeInteger(result.revision + 1)) invalid();
  result.revision++;
  return result;
}
export function initializeAppearance(scopeId, seed) {
  if (!hash(scopeId)) invalid();
  const recipe = discoverRecipe(seed), id = appearanceRecipeId(recipe);
  return { kind: 'unharness-appearance-state', schemaVersion: 1, scopeId, revision: 1,
    selectedItemId: id, items: [{ id, recipe, acquisition: null }], achievements: [], evidenceStartId: null };
}
export function discoverPrepared(state, seed) {
  const recipe = discoverRecipe(seed), id = appearanceRecipeId(recipe), result = next(state);
  if (!result.items.some(item => item.id === id)) {
    if (result.items.length >= 128) fail('appearance-collection-full');
    result.items.push({ id, recipe, acquisition: null });
  }
  result.selectedItemId = id;
  return validateAppearanceState(result);
}
// Internal reducer. Public callers must resolve an achievement from canonical
// evidence; this decision object is never accepted by GUI/CLI/MCP operations.
export function beginOriginal(state, decision, seed) {
  const current = validateAppearanceState(state);
  if (current.schemaVersion !== 1) fail('appearance-legacy-operation-unavailable');
  recordId('observation', decision);
  shape(decision, ['achievementId', 'eligible', 'context', 'resultIds']);
  acquisition({ achievementId: decision.achievementId, context: decision.context, resultIds: decision.resultIds }, current.scopeId);
  if (decision.eligible !== true) fail('appearance-ineligible');
  if (current.achievements.some(a => a.achievementId === decision.achievementId)) return current;
  if (current.achievements.length >= 64 || current.items.length >= 128) fail('appearance-collection-full');
  const parent = current.items.find(i => i.id === current.selectedItemId), result = next(current);
  const candidates = candidateRecipes(seed, parent.recipe).map(recipe => ({ id: appearanceRecipeId(recipe), recipe }));
  result.achievements.push({ achievementId: decision.achievementId, context: structuredClone(decision.context),
    resultIds: [...decision.resultIds], seed, parentItemId: parent.id, candidates, adoptedCandidateId: null });
  return validateAppearanceState(result);
}
export function adoptOriginal(state, achievementId, candidateId) {
  const current = validateAppearanceState(state), set = current.achievements.find(a => a.achievementId === achievementId);
  if (current.schemaVersion !== 1) fail('appearance-legacy-operation-unavailable');
  if (!set || !set.candidates.some(c => c.id === candidateId)) fail('appearance-candidate-unavailable');
  if (set.adoptedCandidateId !== null) {
    if (set.adoptedCandidateId !== candidateId) fail('appearance-choice-final');
    return current;
  }
  if (current.items.length >= 128) fail('appearance-collection-full');
  const result = next(current), chosen = result.achievements.find(a => a.achievementId === achievementId);
  const item = chosen.candidates.find(c => c.id === candidateId);
  chosen.adoptedCandidateId = candidateId;
  result.items.push({ ...item, acquisition: { achievementId, context: chosen.context, resultIds: chosen.resultIds } });
  result.selectedItemId = candidateId;
  return validateAppearanceState(result);
}
export function selectOwned(state, itemId) {
  const current = validateAppearanceState(state);
  if (!current.items.some(i => i.id === itemId)) fail('appearance-not-owned');
  if (current.selectedItemId === itemId) return current;
  const result = next(current); result.selectedItemId = itemId;
  return result;
}
export function renameAppearance(state, itemId, name) {
  const current = validateAppearanceState(state), item = current.items.find(i => i.id === itemId);
  if (!item) fail('appearance-not-owned');
  const normalized = boundedText(name, 80, false, 'invalid-request', true).trim();
  if ((item.name ?? '') === normalized) return current;
  const result = next(current), selected = result.items.find(i => i.id === itemId);
  if (normalized) selected.name = normalized;
  else delete selected.name;
  return validateAppearanceState(result);
}
export function useAppearanceEvidence(state, startId) {
  const current = validateAppearanceState(state);
  if (!hash(startId)) invalid();
  if (current.evidenceStartId === startId) return current;
  const result = next(current); result.evidenceStartId = startId;
  return result;
}
export function presentAppearance(state, context, evidence) {
  const current = validateAppearanceState(state);
  recordId('observation', context);
  shape(context, [...contextKeys, 'mode']);
  const { mode, ...identity } = context;
  validateContext(identity, true);
  if (!['normal', 'unseal', 'trueform', 'favorite', 'checkpoint', 'unknown'].includes(mode) || current.scopeId !== identity.scopeId) invalid();
  let assessment = 'unknown';
  if (evidence !== null) {
    recordId('observation', evidence);
    shape(evidence, ['context', 'assessment']); validateContext(evidence.context);
    if (!['unknown', 'favorable', 'adverse'].includes(evidence.assessment)) invalid();
    if (isDeepStrictEqual(identity, evidence.context)) assessment = evidence.assessment;
  }
  const selected = current.items.find(i => i.id === current.selectedItemId);
  // Assessments remain evidence. They never recolor or replace the user's
  // selected artwork, including a recipe preserved from the legacy format.
  const layered = selected.kind === 'layered';
  const fallback = !layered && ['normal', 'unseal', 'trueform'].includes(mode) && !selected.recipe.modes.includes(mode);
  return { itemId: selected.id, mode, assessment, treatment: 'neutral', allowedTreatments: ['neutral'],
    fallback, reason: fallback ? 'appearance-mode-unavailable' : assessment === 'unknown' ? 'applicable-evidence-unavailable' : null,
    recipe: layered ? null : fallback ? discoverRecipe('0'.repeat(64)) : selected.recipe,
    ...(layered ? { manifest: selected.manifest } : {}) };
}
