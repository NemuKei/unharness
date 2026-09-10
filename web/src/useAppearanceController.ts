import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { appearanceErrorMessage } from './appearances';
import { validArtworkItem, validArtworkView, validArtworkReview, validArtworkReceipt } from './artwork';
import type { ArtworkAction, ArtworkItem, ArtworkPort, ArtworkReceipt, ArtworkReview, ArtworkUpload, ArtworkView } from './artwork';
import type { LayerAsset } from './appearance-layers';

type Pending = { key: string; action: ArtworkAction; input: Record<string, unknown>; requestId: string; expectedItemId?: string };
type State = { key: string; view: ArtworkView | null; review: ArtworkReview | null; error: string; notice: string;
  busy: boolean; confirmed: boolean; uncertain: boolean; operationId: string | null; lastReceipt: ArtworkReceipt | null };
const initial = (key: string): State => ({ key, view: null, review: null, error: '', notice: '', busy: false,
  confirmed: false, uncertain: false, operationId: null, lastReceipt: null });
const changed = () => new ApiError('gui-source-context-changed');
function matchesUpload(review: ArtworkReview, input: Record<string, unknown>) {
  const upload = input as ArtworkUpload, manifest = upload.manifest;
  if (!manifest || !Array.isArray(manifest.parts) || !Array.isArray(upload.files)) return false;
  const sameIds = (a: unknown[], b: unknown[]) => a.length === b.length && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return review.expectedStateId === upload.expectedStateId && review.baseItemId === manifest.baseItemId
    && review.manifest.templateId === manifest.templateId && review.name === manifest.name.trim() && review.author === manifest.author.trim()
    && sameIds(review.replacedParts, manifest.parts.map(part => part.partId))
    && sameIds(review.images.map(file => file.fileId), upload.files.map(file => file.fileId));
}
export function useAppearanceController(port: ArtworkPort, externalVersion = '') {
  const portRef = useRef(port); portRef.current = port;
  const [state, setState] = useState(() => initial(port.key)), stateRef = useRef(state); stateRef.current = state;
  const working = useRef(false), generation = useRef(0), loadedKey = useRef(''), observedVersion = useRef('');
  const idleWaiter = useRef<(() => void) | null>(null), waiting = useRef(false), alive = useRef(true);
  const [queued, setQueued] = useState(false);
  const pending = useRef<Pending | null>(null), items = useRef(new Map<string, ArtworkItem>());
  const current = state.key === port.key ? state : initial(port.key);
  function wakeWaiting() {
    if ((!working.current && !portRef.current.busy) || !portRef.current.enabled || !alive.current) {
      const resolve = idleWaiter.current; idleWaiter.current = null; resolve?.();
    }
  }
  useEffect(wakeWaiting, [port.busy, port.enabled, current.busy]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; wakeWaiting(); }; }, []);
  useEffect(() => {
    ++generation.current; loadedKey.current = ''; observedVersion.current = ''; items.current.clear();
    pending.current = null; setState({ ...initial(port.key), busy: working.current });
    const resolve = idleWaiter.current; idleWaiter.current = null; resolve?.();
  }, [port.key]);
  async function call(action: ArtworkAction, input: Record<string, unknown>, key: string, requestId: string = crypto.randomUUID()) {
    const target = portRef.current;
    if (!target.enabled || !target.scopeId || target.key !== key) throw changed();
    const result = await target.execute(action, input, requestId);
    if (portRef.current.key !== key || !portRef.current.enabled) throw changed();
    const valid = action === 'artwork' ? validArtworkView(result, target.scopeId, target.collectionScopeIds)
      : ['review-appearance-import', 'read-appearance-import'].includes(action) ? validArtworkReview(result, target.scopeId, target.collectionScopeIds)
        : action === 'artwork-item' ? result !== null && typeof result === 'object' && 'scopeId' in result && result.scopeId === target.scopeId
          && 'collectionScopeId' in result && target.collectionScopeIds.includes(String(result.collectionScopeId))
          && 'item' in result && validArtworkItem(result.item)
          : validArtworkReceipt(result, target.scopeId);
    if (!valid) throw new ApiError('invalid-response', undefined, 'uncertain');
    return result;
  }
  async function readView(key: string, after?: string) {
    let view = await call('artwork', after ? { after } : {}, key) as ArtworkView;
    const before = stateRef.current.key === key ? stateRef.current.view : null;
    if (after && before && before.collectionRevision !== view.collectionRevision) {
      view = await call('artwork', {}, key) as ArtworkView; after = undefined;
    }
    setState(old => {
      if (old.key !== key || old.view && old.view.collectionRevision > view.collectionRevision) return old;
      const collection = after && old.view?.collectionRevision === view.collectionRevision
        ? [...new Map([...old.view.collection, ...view.collection].map(row => [row.id, row])).values()] : view.collection;
      return { ...old, view: { ...view, collection }, confirmed: true };
    });
    if (view.selectedItem) items.current.set(view.selectedItem.id, view.selectedItem);
    return view;
  }
  async function run(action: ArtworkAction, input: Record<string, unknown> = {}, write = false, retry = false) {
    const target = portRef.current, key = target.key;
    if (!target.enabled || waiting.current) return false;
    if (working.current || target.busy) {
      if (!write) return false;
      // A refresh can start between the pointer event and React disabling a button.
      // Keep that one explicit action and its reviewed input until the shared queue is free.
      waiting.current = true; setQueued(true);
      try {
        while (working.current || portRef.current.busy) {
          await new Promise<void>(resolve => { idleWaiter.current = resolve; wakeWaiting(); });
          if (!alive.current || portRef.current.key !== key || !portRef.current.enabled) return false;
        }
      } finally { waiting.current = false; setQueued(false); }
    }
    if (!alive.current || portRef.current.key !== key || !portRef.current.enabled) return false;
    if (write && pending.current && !retry && action !== 'recover-appearance') return false;
    const activeReview = stateRef.current.review;
    const command: Pending = retry && pending.current ? pending.current : { key, action, input, requestId: crypto.randomUUID(),
      ...(action === 'save-appearance-import' && activeReview && activeReview.reviewId === input.reviewId
        ? { expectedItemId: activeReview.proposedItemId } : {}) };
    if (command.key !== key) return false;
    working.current = true;
    const epoch = ++generation.current, applies = () => key === portRef.current.key && epoch === generation.current;
    if (write) pending.current = command;
    setState(old => ({ ...old, busy: true, error: '', ...(write ? { operationId: command.requestId } : {}) }));
    try {
      if (action === 'artwork') {
        await readView(key, typeof input.after === 'string' ? input.after : undefined);
        if (applies()) setState(old => ({ ...old, error: '' }));
        return applies();
      }
      const result = await call(command.action, command.input, key, command.requestId);
      if (!applies()) return false;
      if (['review-appearance-import', 'read-appearance-import'].includes(command.action)) {
        const review = result as ArtworkReview;
        if (command.action === 'read-appearance-import' && review.reviewId !== command.input.reviewId) throw new ApiError('invalid-response', undefined, 'uncertain');
        if (command.action === 'review-appearance-import' && !matchesUpload(review, command.input)) throw new ApiError('invalid-response', undefined, 'uncertain');
        setState(old => ({ ...old, review, error: '', notice: '', uncertain: false }));
      } else {
        const receipt = result as ArtworkReceipt;
        if (command.action === 'save-appearance-import' && (receipt.reviewId !== command.input.reviewId || !receipt.savedItemId
          || command.expectedItemId && receipt.savedItemId !== command.expectedItemId)) throw new ApiError('invalid-response', undefined, 'uncertain');
        if (command.action === 'select-appearance' && receipt.selectedItemId !== command.input.itemId) throw new ApiError('invalid-response', undefined, 'uncertain');
        setState(old => ({ ...old, uncertain: false, lastReceipt: receipt, notice: command.action === 'save-appearance-import'
          ? '作品をコレクションに保存しました。' : command.action === 'recover-appearance' ? '作品の保存を再開しました。'
            : command.action === 'select-appearance' ? 'この作品を選びました。' : '作品の名前を保存しました。' }));
        try { await readView(key); }
        catch { if (applies()) setState(old => ({ ...old, confirmed: false, error: '保存は確認できました。外観の表示を読み直してください。' })); }
      }
      pending.current = null;
      return true;
    } catch (error) {
      if (applies()) {
        const uncertain = write && (!(error instanceof ApiError) || error.disposition === 'uncertain');
        if (!uncertain) pending.current = null;
        setState(old => ({ ...old, error: appearanceErrorMessage(error), uncertain,
          ...(action === 'artwork' ? { confirmed: false } : {}) }));
      }
      return false;
    } finally {
      working.current = false;
      setState(old => ({ ...old, busy: false }));
      wakeWaiting();
    }
  }
  useEffect(() => {
    if (port.enabled && !port.busy && !working.current && !waiting.current && loadedKey.current !== port.key) {
      loadedKey.current = port.key; void run('artwork');
    }
  }, [port.key, port.enabled, current.busy, port.busy]);
  useEffect(() => {
    if (!externalVersion || !port.enabled || port.busy || working.current || waiting.current || observedVersion.current === externalVersion) return;
    observedVersion.current = externalVersion; void run('artwork');
  }, [externalVersion, port.key, port.enabled, current.busy, port.busy]);
  const image = useCallback(async (referenceId: string, asset: LayerAsset, signal: AbortSignal, key = portRef.current.key) => {
    const target = portRef.current;
    if (target.key !== key || !target.enabled || signal.aborted) throw changed();
    const blob = await target.image(referenceId, asset, signal);
    if (portRef.current.key !== key || !portRef.current.enabled || signal.aborted) throw changed();
    return blob;
  }, []);
  async function item(itemId: string) {
    if (portRef.current.key !== port.key) throw changed();
    const key = portRef.current.key, cached = items.current.get(itemId);
    if (cached) return cached;
    const response = await call('artwork-item', { itemId }, key) as { item: ArtworkItem };
    if (response.item.id !== itemId) throw new ApiError('invalid-response');
    if (key !== portRef.current.key) throw changed();
    items.current.set(itemId, response.item); return response.item;
  }
  function edit(action: ArtworkAction, input: Record<string, unknown>) {
    if (portRef.current.key !== port.key) return Promise.resolve(false);
    const view = stateRef.current.key === portRef.current.key ? stateRef.current.view : null;
    if (!view) return Promise.resolve(false);
    return run(action, { ...input, expectedStateId: view.stateId }, true);
  }
  return { ...current, enabled: port.enabled, busy: current.busy || port.busy || queued,
    mutating: queued || current.busy && pending.current !== null, image, item,
    load: (after?: string) => portRef.current.key === port.key ? run('artwork', after ? { after } : {}) : Promise.resolve(false),
    reviewUpload: (upload: ArtworkUpload) => portRef.current.key === port.key ? run('review-appearance-import', upload, true) : Promise.resolve(false),
    readReview: (reviewId: string) => portRef.current.key === port.key ? run('read-appearance-import', { reviewId }) : Promise.resolve(false),
    saveReview: () => current.review && portRef.current.key === port.key ? run('save-appearance-import', { reviewId: current.review.reviewId, expectedStateId: current.review.expectedStateId }, true) : Promise.resolve(false),
    select: (itemId: string) => edit('select-appearance', { itemId }),
    rename: (itemId: string, name: string) => edit('name-appearance', { itemId, name }),
    recover: () => portRef.current.key === port.key ? run('recover-appearance', {}, true) : Promise.resolve(false),
    retry: () => pending.current && portRef.current.key === port.key ? run(pending.current.action, pending.current.input, true, true) : Promise.resolve(false),
    clearReview: () => { if (portRef.current.key === port.key) setState(old => ({ ...old, review: null })); },
  };
}
export type AppearanceController = ReturnType<typeof useAppearanceController>;
