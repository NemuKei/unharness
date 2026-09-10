import artPack from '../assets/hangar-v4.json' with { type: 'json' };
import { ApiError } from './api.ts';
import { validLayerManifest } from './appearance-layers.ts';
import type { LayerManifest } from './appearance-layers';

export type AppearanceTreatment = 'neutral' | 'good' | 'bad';
export type AppearanceRecipe = {
  schemaVersion: 1; selectorVersion: 'weighted-sha256/v1'; rendererVersion: 'mechanical-appearance/v1'; seed: string;
  origin: 'prepared' | 'original'; body: 'mechanical-lattice';
  artPack: { version: string; sourceSha256: string; backgroundSha256: string };
  palette: { id: string; colors: { core: string; light: string; metal: string; dark: string } };
  details: 'filament' | 'forked-light' | 'facet-light'; modes: Array<'normal' | 'unseal' | 'trueform'>; treatments: AppearanceTreatment[];
};
export type AppearanceContext = { scopeId: string; app: string; model: string; loadoutId: string;
  taskCriteriaId: string; baselineId: string; evidenceVersion: string };
export type RecipeAppearanceItem = { id: string; kind?: 'recipe'; name?: string; recipe: AppearanceRecipe;
  acquisition: null | { achievementId: string; context: AppearanceContext; resultIds: string[] } };
export type LayeredAppearanceItem = { id: string; kind: 'layered'; name?: string; author: string; manifest: LayerManifest;
  reviewId: string; requestId: string; parentItemId: string | null };
export type AppearanceItem = RecipeAppearanceItem | LayeredAppearanceItem;
export type AppearanceCollectionItem = { id: string; name: string | null; kind: 'recipe' | 'layered'; origin: AppearanceRecipe['origin'] | 'imported';
  paletteId: string | null; details: AppearanceRecipe['details'] | null; achievementId: string | null; author: string | null; parentItemId: string | null };
export type AppearanceGroup = { snapshotId: string; attemptCount: number; recordedCount: number; acceptedCount: number;
  totalTokens: number | null; tokensPerAcceptedTask: number | null };
export type AppearanceEvidence = { scopeId: string; startId: string; eligible: boolean; assessment: 'unknown' | 'favorable' | 'adverse';
  achievementId: string | null; context: AppearanceContext | null; resultIds: string[]; reasons: string[];
  baseline: AppearanceGroup | null; candidate: AppearanceGroup | null; completeIsolationVerified: false };
export type AppearancePresentation = { itemId: string; mode: string; assessment: AppearanceEvidence['assessment'];
  treatment: AppearanceTreatment; allowedTreatments: AppearanceTreatment[]; fallback: boolean; reason: string | null; recipe: AppearanceRecipe | null; manifest?: LayerManifest };
export type AppearanceView = { scopeId: string; collectionScopeId?: string; preparedRevision: number; stateId: string | null; recoveryRequired: boolean; pendingStateId: string | null;
  selectedItem: AppearanceItem | null; itemCount: number; collection: AppearanceCollectionItem[]; nextCursor: string | null;
  achievements: Array<{ achievementId: string; adoptedCandidateId: string | null; parentItemId: string; app: string; model: string }>;
  evidenceStartId: string | null; evidence: AppearanceEvidence | null; evidenceIssue: string | null; applicable: boolean;
  creationAvailable: boolean; assessmentCheckedAt: string; assessmentBasis: 'selected-comparison-and-prepared-settings';
  runningTaskVerified: false; presentation: AppearancePresentation | null };
export type AppearanceReceipt = Pick<AppearanceView, 'scopeId' | 'stateId' | 'recoveryRequired' | 'pendingStateId' | 'evidenceStartId'> & { selectedItemId: string | null };
export type OriginalCandidates = { scopeId: string; collectionScopeId?: string; stateId: string; recoveryRequired: boolean; evidenceTiming: 'at-creation';
  achievement: { achievementId: string; context: AppearanceContext; resultIds: string[]; seed: string; parentItemId: string;
    candidates: Array<{ id: string; recipe: AppearanceRecipe }>; adoptedCandidateId: string | null } };

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const nullableHash = (v: unknown) => v === null || hash(v);
const label = (v: unknown): v is string => typeof v === 'string' && v.length <= 200 && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const hashes = (v: unknown, max = 40) => Array.isArray(v) && v.length <= max && v.every(hash) && new Set(v).size === v.length;
const assessment = (v: unknown) => ['unknown', 'favorable', 'adverse'].includes(v as string);
const details = (v: unknown) => ['filament', 'forked-light', 'facet-light'].includes(v as string);
const origin = (v: unknown) => v === 'prepared' || v === 'original';
const context = (v: unknown, scopeId: string) => object(v) && v.scopeId === scopeId && label(v.app) && label(v.model)
  && [v.loadoutId, v.taskCriteriaId, v.baselineId, v.evidenceVersion].every(hash);
export function validAppearanceRecipe(v: unknown): v is AppearanceRecipe {
  if (!object(v) || v.schemaVersion !== 1 || v.selectorVersion !== 'weighted-sha256/v1' || v.rendererVersion !== 'mechanical-appearance/v1'
    || !hash(v.seed) || !origin(v.origin) || v.body !== 'mechanical-lattice' || !details(v.details)
    || !object(v.artPack) || v.artPack.version !== artPack.artPackVersion || v.artPack.sourceSha256 !== artPack.source.sha256
    || v.artPack.backgroundSha256 !== artPack.emptyPlate.sha256 || !object(v.palette) || !label(v.palette.id)) return false;
  const colors = v.palette.colors;
  if (!object(colors) || Object.keys(colors).length !== 4 || !['core', 'light', 'metal', 'dark'].every(k =>
    typeof colors[k] === 'string' && /^#[a-f0-9]{6}$/.test(colors[k]))) return false;
  return Array.isArray(v.modes) && v.modes.length > 0 && v.modes.length <= 3 && new Set(v.modes).size === v.modes.length
    && v.modes.every(m => ['normal', 'unseal', 'trueform'].includes(m))
    && Array.isArray(v.treatments) && v.treatments.length > 0 && v.treatments.length <= 3 && new Set(v.treatments).size === v.treatments.length
    && v.treatments.every(t => ['neutral', 'good', 'bad'].includes(t));
}
function validItem(v: unknown, scopeId: string) {
  if (!object(v) || !hash(v.id) || !(v.name === undefined || label(v.name) && v.name.length <= 80 && !!v.name.trim())) return false;
  if (v.kind === 'layered') return validLayerManifest(v.manifest) && hash(v.reviewId) && nullableHash(v.parentItemId)
    && label(v.author) && v.author.length <= 80 && typeof v.requestId === 'string'
    && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v.requestId);
  return validAppearanceRecipe(v.recipe) && (v.acquisition === null || object(v.acquisition) && hash(v.acquisition.achievementId)
      && context(v.acquisition.context, scopeId) && hashes(v.acquisition.resultIds));
}
function validGroup(v: unknown) {
  return v === null || object(v) && hash(v.snapshotId) && [v.attemptCount, v.recordedCount, v.acceptedCount].every(count)
    && (v.totalTokens === null || count(v.totalTokens))
    && (v.tokensPerAcceptedTask === null || typeof v.tokensPerAcceptedTask === 'number' && Number.isFinite(v.tokensPerAcceptedTask) && v.tokensPerAcceptedTask >= 0);
}
export function validAppearanceEvidence(v: unknown, scopeId: string): v is AppearanceEvidence {
  return object(v) && v.scopeId === scopeId && hash(v.startId) && typeof v.eligible === 'boolean' && assessment(v.assessment)
    && nullableHash(v.achievementId) && (v.context === null || context(v.context, scopeId)) && hashes(v.resultIds)
    && Array.isArray(v.reasons) && v.reasons.length <= 32 && v.reasons.every(label)
    && validGroup(v.baseline) && validGroup(v.candidate) && v.completeIsolationVerified === false
    && (!v.eligible || v.assessment === 'favorable' && v.context !== null && v.achievementId !== null && v.reasons.length === 0);
}
export function validAppearanceView(v: unknown, scopeId: string, previousScopeIds: string[] = []): v is AppearanceView {
  if (!object(v) || v.scopeId !== scopeId || !count(v.preparedRevision) || !nullableHash(v.stateId) || typeof v.recoveryRequired !== 'boolean'
    || !nullableHash(v.pendingStateId) || v.recoveryRequired !== (v.pendingStateId !== null)
    || !count(v.itemCount) || v.itemCount > 128 || !Array.isArray(v.collection) || v.collection.length > 20 || v.collection.length > v.itemCount
    || v.collection.some(i => !object(i) || !hash(i.id) || !(i.name === null || label(i.name))
      || !(i.kind === 'layered' ? i.origin === 'imported' && i.paletteId === null && i.details === null
        : i.kind === 'recipe' && origin(i.origin) && label(i.paletteId) && details(i.details))
      || !nullableHash(i.achievementId) || !nullableHash(i.parentItemId) || !(i.author === null || label(i.author)))
    || new Set(v.collection.map(i => i.id)).size !== v.collection.length || !nullableHash(v.nextCursor)
    || !Array.isArray(v.achievements) || v.achievements.length > 64 || v.achievements.some(a => !object(a)
      || !hash(a.achievementId) || !nullableHash(a.adoptedCandidateId) || !hash(a.parentItemId) || !label(a.app) || !label(a.model))
    || !nullableHash(v.evidenceStartId) || !(v.evidenceIssue === null || label(v.evidenceIssue))
    || typeof v.applicable !== 'boolean' || typeof v.creationAvailable !== 'boolean' || !label(v.assessmentCheckedAt)
    || !Number.isFinite(Date.parse(v.assessmentCheckedAt)) || v.assessmentBasis !== 'selected-comparison-and-prepared-settings'
    || v.runningTaskVerified !== false || !(v.evidence === null || validAppearanceEvidence(v.evidence, scopeId))
    || v.evidence !== null && object(v.evidence) && v.evidence.startId !== v.evidenceStartId
    || v.applicable && (!object(v.evidence) || v.evidence.context === null)) return false;
  const collectionScopeId = v.collectionScopeId ?? scopeId;
  if (!hash(collectionScopeId) || ![scopeId, ...previousScopeIds].includes(collectionScopeId)) return false;
  if (v.creationAvailable !== !v.recoveryRequired) return false;
  if (v.stateId === null) return v.selectedItem === null && v.presentation === null && v.itemCount === 0 && v.collection.length === 0;
  if (!validItem(v.selectedItem, collectionScopeId) || !object(v.selectedItem) || !object(v.presentation)) return false;
  const p = v.presentation;
  return p.itemId === v.selectedItem.id && ['normal', 'unseal', 'trueform', 'favorite', 'checkpoint', 'unknown'].includes(p.mode as string)
    && assessment(p.assessment) && p.treatment === 'neutral'
    && Array.isArray(p.allowedTreatments) && JSON.stringify(p.allowedTreatments) === JSON.stringify(['neutral'])
    && typeof p.fallback === 'boolean' && (p.reason === null || label(p.reason))
    && (v.selectedItem.kind === 'layered' ? p.recipe === null && validLayerManifest(p.manifest)
      && JSON.stringify(p.manifest) === JSON.stringify(v.selectedItem.manifest) && !p.fallback : validAppearanceRecipe(p.recipe))
    && (v.applicable ? object(v.evidence) && p.assessment === v.evidence.assessment : p.assessment === 'unknown');
}
export function validOriginalCandidates(v: unknown, scopeId: string, previousScopeIds: string[] = []): v is OriginalCandidates {
  if (!object(v) || v.scopeId !== scopeId || !hash(v.stateId) || typeof v.recoveryRequired !== 'boolean'
    || v.evidenceTiming !== 'at-creation' || !object(v.achievement)) return false;
  const a = v.achievement;
  const collectionScopeId = v.collectionScopeId ?? scopeId;
  return hash(collectionScopeId) && [scopeId, ...previousScopeIds].includes(collectionScopeId)
    && hash(a.achievementId) && context(a.context, collectionScopeId) && hashes(a.resultIds) && hash(a.seed) && hash(a.parentItemId)
    && nullableHash(a.adoptedCandidateId) && Array.isArray(a.candidates) && a.candidates.length === 3
    && a.candidates.every(c => object(c) && hash(c.id) && validAppearanceRecipe(c.recipe) && c.recipe.origin === 'original')
    && new Set(a.candidates.map(c => c.id)).size === 3 && (a.adoptedCandidateId === null || a.candidates.some(c => c.id === a.adoptedCandidateId));
}
export function validAppearanceReceipt(v: unknown, scopeId: string): v is AppearanceReceipt {
  return object(v) && v.scopeId === scopeId && nullableHash(v.stateId) && nullableHash(v.selectedItemId)
    && nullableHash(v.pendingStateId) && nullableHash(v.evidenceStartId) && typeof v.recoveryRequired === 'boolean';
}
const paletteLabels: Record<string, string> = { ice: '蒼氷', dawn: '暁光', iris: '紫苑' };
const detailLabels: Record<string, string> = { filament: '光糸', 'forked-light': '分岐光', 'facet-light': '結晶光' };
export function appearanceName(item: AppearanceItem | AppearanceCollectionItem) {
  if (item.name) return item.name;
  if (item.kind === 'layered') return 'オリジナル';
  const recipe = 'recipe' in item ? item.recipe : { palette: { id: item.paletteId }, details: item.details };
  return `${paletteLabels[recipe.palette.id ?? ''] ?? 'ローカル'}・${detailLabels[recipe.details ?? ''] ?? '標準'}`;
}
export function appearanceErrorMessage(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : 'unavailable';
  const messages: Record<string, string> = {
    'appearance-state-conflict': '外観の選択が更新されています。現在の内容を読み直してください。',
    'appearance-ineligible': '現在の装備・条件では、オリジナル作成の条件を満たしていません。',
    'appearance-choice-final': 'この比較での採用は確定済みです。コレクションから別の姿を選べます。',
    'appearance-recovery-required': '外観の保存が中断しています。「外観の保存を復旧」で同じ内容を再開できます。',
    'appearance-collection-full': '保存できる外観の上限に達しています。既存のコレクションは引き続き使えます。',
    'appearance-record-invalid': '外観の保存データを確認できません。装備の操作・復旧は引き続き利用できます。',
  };
  return messages[kind] ?? (error instanceof ApiError && error.disposition === 'uncertain'
    ? '外観の保存結果は未確認です。読み直してから、必要な場合だけ復旧してください。'
    : '外観を確認できませんでした。読み直してください。装備の設定は変更していません。');
}
