import { useEffect, useRef, useState } from 'react';
import { ApiError } from './api';
import { comparisonContextKey } from './useComparisonController';
import { mergeHistoryRows } from './source-updates';
import { appearanceErrorMessage, validAppearanceView, validAppearanceReceipt, validOriginalCandidates } from './appearances';
import type { AppearanceView, AppearancePresentation, OriginalCandidates } from './appearances';
import type { useSourceController } from './useSourceController';

type Shared = ReturnType<typeof useSourceController>;
type State = { key: string; view: AppearanceView | null; candidates: OriginalCandidates | null;
  error: string; notice: string; uncertain: boolean; busy: boolean };
const initial = (key: string): State => ({ key, view: null, candidates: null, error: '', notice: '', uncertain: false, busy: false });
export function useAppearanceController(shared: Shared) {
  const key = comparisonContextKey(shared.view), keyRef = useRef(key), sharedRef = useRef(shared);
  keyRef.current = key; sharedRef.current = shared;
  const [state, setState] = useState(() => initial(key));
  const stateRef = useRef(state); stateRef.current = state;
  const working = useRef(false), generation = useRef(0), initialized = useRef('');
  const updateSignature = useRef('');
  const current = state.key === key ? state : initial(key);
  useEffect(() => { ++generation.current; initialized.current = ''; updateSignature.current = ''; setState({ ...initial(key), busy: working.current }); }, [key]);
  useEffect(() => {
    const update = shared.externalUpdate, slice = update?.history?.appearance;
    if (!update || !slice || working.current || comparisonContextKey(update.view) !== keyRef.current) return;
    const signature = JSON.stringify([keyRef.current, update.versions.appearance, slice.error?.kind]);
    if (signature === updateSignature.current) return;
    updateSignature.current = signature;
    setState(old => {
      if (old.key !== keyRef.current) return old;
      if (slice.error) return { ...old, error: appearanceErrorMessage(new ApiError(slice.error.kind)) };
      if (old.view && Date.parse(old.view.assessmentCheckedAt) > Date.parse(slice.data.assessmentCheckedAt)) return old;
      return { ...old, view: { ...slice.data, collection: mergeHistoryRows(old.view?.collection ?? [], slice.data.collection, 'id') }, error: '' };
    });
  }, [shared.externalUpdate, current.busy]);

  async function perform(action: string, input: object, requestKey: string) {
    const response = await sharedRef.current.executeComparison<unknown>(action, input);
    if (keyRef.current !== requestKey || response.status === 'context-updated') return null;
    if (response.status === 'failed') throw response.error;
    const scope = response.state.source?.registration.scopeId;
    if (!scope || comparisonContextKey(response.state) !== requestKey) return null;
    const previousScopes = response.state.source?.registration.previousScopeIds;
    const valid = action === 'appearance' ? validAppearanceView(response.result, scope, previousScopes)
      : action === 'original-candidates' ? validOriginalCandidates(response.result, scope, previousScopes)
        : validAppearanceReceipt(response.result, scope);
    if (!valid) throw new ApiError('invalid-response');
    return response.result;
  }
  async function action(name: string, input: object = {}, mutate = false) {
    if (working.current || !sharedRef.current.view?.source) return false;
    working.current = true;
    const requestKey = keyRef.current, requestGeneration = ++generation.current;
    const applies = () => requestKey === keyRef.current && requestGeneration === generation.current;
    setState(old => ({ ...old, error: '', busy: true }));
    try {
      const result = await perform(name, input, requestKey);
      if (!result || !applies()) return false;
      if (name === 'appearance') {
        const view = result as AppearanceView;
        setState(old => ({ ...old, view: { ...view, collection: 'after' in input ? mergeHistoryRows(old.view?.collection ?? [], view.collection, 'id') : view.collection }, error: '' }));
      } else if (name === 'original-candidates') {
        const candidates = result as OriginalCandidates;
        if (!('achievementId' in input) || candidates.achievement.achievementId !== input.achievementId) throw new ApiError('invalid-response');
        setState(old => ({ ...old, candidates }));
      } else {
        setState(old => ({ ...old, uncertain: false, notice: name === 'adopt-original' ? 'この姿をコレクションに保存しました。今回の採用は確定済みです。'
          : name === 'create-original' ? '3つの候補を保存しました。好きな1つを選べます。'
            : name === 'use-appearance-evidence' ? 'この比較を外観の評価に使用します。適用できる範囲は評価欄で確認できます。'
              : '外観の保存状態を更新しました。装備の設定は変えていません。' }));
        try {
          const view = await perform('appearance', {}, requestKey) as AppearanceView | null;
          if (view && applies()) setState(old => ({ ...old, view, error: '' }));
        } catch {
          if (applies()) setState(old => ({ ...old, error: '保存は確認済みです。外観の表示を読み直してください。' }));
        }
      }
      return true;
    } catch (error) {
      if (applies()) setState(old => ({ ...old, error: appearanceErrorMessage(error),
        uncertain: mutate && (error instanceof ApiError ? error.disposition === 'uncertain' : !(error instanceof Error && error.message === 'source-busy')) }));
      return false;
    } finally {
      working.current = false;
      setState(old => ({ ...old, busy: false }));
    }
  }
  useEffect(() => {
    const view = current.view;
    if (!view || view.stateId !== null || view.recoveryRequired || !shared.confirmed || shared.busy || initialized.current === key) return;
    initialized.current = key;
    void action('discover-appearance', {}, true);
  }, [key, current.view?.stateId, current.view?.recoveryRequired, shared.confirmed, shared.busy]);
  function edit(name: string, input: object = {}) {
    const view = stateRef.current.key === keyRef.current ? stateRef.current.view : null;
    if (!view?.stateId) return Promise.resolve(false);
    return action(name, { ...input, expectedStateId: view.stateId }, true);
  }
  let presentation: AppearancePresentation | null = current.view?.presentation ?? null;
  if (presentation && (current.view?.preparedRevision !== shared.view?.source?.revision || shared.selected !== presentation.mode
    || !shared.confirmed || shared.view?.source?.conflict || shared.view?.source?.recovery.pending)) {
    presentation = { ...presentation, assessment: 'unknown',
      treatment: 'neutral', allowedTreatments: ['neutral'], reason: 'preview-or-unconfirmed-settings' };
  }
  return { ...current, presentation, busy: current.busy || shared.busy,
    load: (after?: string) => action('appearance', after ? { after } : {}),
    discover: () => current.view?.stateId ? edit('discover-appearance') : action('discover-appearance', {}, true),
    select: (itemId: string) => edit('select-appearance', { itemId }),
    rename: (itemId: string, name: string) => edit('name-appearance', { itemId, name }),
    useEvidence: (startId: string) => edit('use-appearance-evidence', { startId }),
    create: () => current.view?.evidence?.achievementId ? edit('create-original', {
      startId: current.view.evidence.startId, achievementId: current.view.evidence.achievementId }) : Promise.resolve(false),
    readCandidates: (achievementId: string) => action('original-candidates', { achievementId }),
    adopt: (achievementId: string, candidateId: string) => edit('adopt-original', { achievementId, candidateId }),
    recover: () => action('recover-appearance', {}, true),
    closeCandidates: () => setState(old => ({ ...old, candidates: null })),
  };
}
