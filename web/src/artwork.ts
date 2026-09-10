import { validAppearanceRecipe } from './appearances';
import type { AppearanceRecipe } from './appearances';
import { stockLayerManifest, validLayerManifest } from './appearance-layers';
import type { LayerAsset, LayerManifest } from './appearance-layers';

export type ArtworkItem = { id: string; kind: 'recipe'; name: string | null; recipe: AppearanceRecipe }
  | { id: string; kind: 'layered'; name: string | null; author: string; parentItemId: string | null; manifest: LayerManifest };
export type ArtworkRow = { id: string; kind: 'recipe' | 'layered'; name: string | null; origin: 'prepared' | 'original' | 'imported';
  paletteId: string | null; details: string | null; author: string | null; parentItemId: string | null };
export type ArtworkView = { scopeId: string; collectionScopeId: string; collectionRevision: number; stateId: string | null;
  recoveryRequired: boolean; pendingStateId: string | null; selectedItem: ArtworkItem | null;
  itemCount: number; collection: ArtworkRow[]; nextCursor: string | null };
export type ArtworkReview = { scopeId: string; collectionScopeId: string; reviewId: string; expectedStateId: string | null;
  proposedItemId: string; baseItemId: string | null; name: string; author: string; manifest: LayerManifest; replacedParts: string[];
  images: Array<{ fileId: string; assetId: string; sourceWidth: number; sourceHeight: number; resized: boolean }> };
export type ArtworkReceipt = { scopeId: string; collectionRevision: number; stateId: string | null; selectedItemId: string | null;
  recoveryRequired: boolean; pendingStateId: string | null; savedItemId?: string; reviewId?: string };
export type ArtworkAction = 'artwork' | 'artwork-item' | 'review-appearance-import' | 'read-appearance-import'
  | 'save-appearance-import' | 'select-appearance' | 'name-appearance' | 'recover-appearance';
export type ArtworkImageLoader = (asset: LayerAsset, signal: AbortSignal) => Promise<Blob>;
export type ArtworkPort = { key: string; scopeId: string | null; collectionScopeIds: string[]; enabled: boolean; busy: boolean;
  execute: (action: ArtworkAction, input: Record<string, unknown>, requestId: string) => Promise<unknown>;
  image: (referenceId: string, asset: LayerAsset, signal: AbortSignal) => Promise<Blob> };
export type ArtworkUpload = { importId: string; expectedStateId: string | null;
  manifest: { templateId: string; baseItemId: string | null; name: string; author: string; parts: Array<{ partId: string; fileId: string }> };
  files: Array<{ fileId: string; base64: string }> };

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const nullableHash = (v: unknown) => v === null || hash(v);
const label = (v: unknown): v is string => typeof v === 'string' && v.length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const exact = (v: unknown, keys: string[], optional: string[] = []): v is Record<string, unknown> => object(v)
  && keys.every(key => Object.hasOwn(v, key)) && Object.keys(v).every(key => keys.includes(key) || optional.includes(key));
export function validArtworkItem(v: unknown): v is ArtworkItem {
  if (!object(v) || !hash(v.id) || !(v.name === null || label(v.name))) return false;
  return v.kind === 'recipe' ? exact(v, ['id', 'kind', 'name', 'recipe']) && validAppearanceRecipe(v.recipe)
    : v.kind === 'layered' && exact(v, ['id', 'kind', 'name', 'author', 'parentItemId', 'manifest'])
      && label(v.author) && nullableHash(v.parentItemId) && validLayerManifest(v.manifest);
}
export function validArtworkView(v: unknown, scopeId: string, collectionScopes: string[]): v is ArtworkView {
  if (!exact(v, ['scopeId', 'collectionScopeId', 'collectionRevision', 'stateId', 'recoveryRequired', 'pendingStateId', 'selectedItem', 'itemCount', 'collection', 'nextCursor'])
    || v.scopeId !== scopeId || !hash(v.collectionScopeId) || !collectionScopes.includes(v.collectionScopeId)
    || !count(v.collectionRevision) || !nullableHash(v.stateId) || typeof v.recoveryRequired !== 'boolean'
    || !nullableHash(v.pendingStateId) || v.recoveryRequired !== (v.pendingStateId !== null)
    || !count(v.itemCount) || v.itemCount > 128 || !Array.isArray(v.collection) || v.collection.length > 20
    || v.collection.length > v.itemCount || !nullableHash(v.nextCursor)) return false;
  if (v.collection.some(row => !exact(row, ['id', 'kind', 'name', 'origin', 'paletteId', 'details', 'author', 'parentItemId'])
    || !hash(row.id) || !(row.name === null || label(row.name)) || !nullableHash(row.parentItemId)
    || !(row.author === null || label(row.author))
    || !(row.kind === 'layered' ? row.origin === 'imported' && row.paletteId === null && row.details === null
      : row.kind === 'recipe' && ['prepared', 'original'].includes(row.origin as string) && label(row.paletteId)
        && ['filament', 'forked-light', 'facet-light'].includes(row.details as string)))
    || new Set(v.collection.map(row => row.id)).size !== v.collection.length) return false;
  if (v.nextCursor !== null && (!v.collection.length || v.nextCursor !== v.collection.at(-1).id)) return false;
  return v.stateId === null ? v.collectionRevision === 0 && v.selectedItem === null && v.itemCount === 0
    : v.collectionRevision > 0 && v.itemCount > 0 && validArtworkItem(v.selectedItem);
}
export function validArtworkReview(v: unknown, scopeId: string, collectionScopes: string[]): v is ArtworkReview {
  if (!object(v) || !validLayerManifest(v.manifest)) return false;
  const manifest = v.manifest;
  const partIds = ['entity', 'background', ...stockLayerManifest.layers.restraints.map(part => part.partId)];
  return exact(v, ['scopeId', 'collectionScopeId', 'reviewId', 'expectedStateId', 'proposedItemId', 'baseItemId', 'name', 'author', 'manifest', 'replacedParts', 'images'])
    && v.scopeId === scopeId && hash(v.collectionScopeId) && collectionScopes.includes(v.collectionScopeId)
    && hash(v.reviewId) && hash(v.proposedItemId) && nullableHash(v.expectedStateId) && nullableHash(v.baseItemId)
    && label(v.name) && !!v.name.trim() && label(v.author) && validLayerManifest(v.manifest)
    && Array.isArray(v.replacedParts) && v.replacedParts.length > 0 && new Set(v.replacedParts).size === v.replacedParts.length
    && v.replacedParts.every(id => partIds.includes(id)) && Array.isArray(v.images) && v.images.length > 0 && v.images.length <= 64
    && v.images.every(image => exact(image, ['fileId', 'assetId', 'sourceWidth', 'sourceHeight', 'resized'])
      && typeof image.fileId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(image.fileId) && hash(image.assetId)
      && manifest.assets.some(asset => asset.assetId === image.assetId) && count(image.sourceWidth)
      && image.sourceWidth > 0 && image.sourceWidth <= 2048 && image.sourceHeight === image.sourceWidth
      && image.resized === (image.sourceWidth !== 724));
}
export function validArtworkReceipt(v: unknown, scopeId: string): v is ArtworkReceipt {
  return exact(v, ['scopeId', 'collectionRevision', 'stateId', 'selectedItemId', 'recoveryRequired', 'pendingStateId'], ['savedItemId', 'reviewId'])
    && v.scopeId === scopeId && count(v.collectionRevision) && nullableHash(v.stateId) && nullableHash(v.selectedItemId)
    && typeof v.recoveryRequired === 'boolean' && nullableHash(v.pendingStateId) && v.recoveryRequired === (v.pendingStateId !== null)
    && (v.stateId === null ? v.collectionRevision === 0 && v.selectedItemId === null : v.collectionRevision > 0 && hash(v.selectedItemId))
    && ((v.savedItemId === undefined && v.reviewId === undefined) || hash(v.savedItemId) && hash(v.reviewId));
}
export function projectArtworkReceipt(value: unknown): unknown {
  if (!object(value)) return value;
  return Object.fromEntries(['scopeId', 'collectionRevision', 'stateId', 'selectedItemId', 'recoveryRequired', 'pendingStateId', 'savedItemId', 'reviewId']
    .filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}
export function artworkName(item: ArtworkItem | ArtworkRow) {
  if (item.name) return item.name;
  if (item.kind === 'layered') return 'オリジナル';
  const palette = 'recipe' in item ? item.recipe.palette.id : item.paletteId;
  const detail = 'recipe' in item ? item.recipe.details : item.details;
  return `${({ ice: '蒼氷', dawn: '暁光', iris: '紫苑' } as Record<string, string>)[palette ?? ''] ?? '標準'}・${({ filament: '光糸', 'forked-light': '分岐光', 'facet-light': '結晶光' } as Record<string, string>)[detail ?? ''] ?? '外観'}`;
}
