import { ApiError } from './api';
import { comparisonContextKey } from './useComparisonController';
import { projectArtworkReceipt } from './artwork';
import { useAppearanceController } from './useAppearanceController';
import type { useSourceController } from './useSourceController';

export function useLocalAppearance(shared: ReturnType<typeof useSourceController>) {
  const view = shared.view, source = view?.source;
  return useAppearanceController({ key: comparisonContextKey(view), scopeId: source?.registration.scopeId ?? null,
    collectionScopeIds: source ? [source.registration.scopeId, ...(source.registration.previousScopeIds ?? [])] : [],
    enabled: !!source && shared.confirmed && !source.recovery.pending, busy: shared.busy,
    async execute(action, input, requestId) {
      const response = await shared.executeAuxiliary<unknown>(action, { ...input, requestId });
      if (response.status === 'context-updated') throw new ApiError('gui-source-context-changed');
      if (response.status === 'failed') throw response.error;
      return ['save-appearance-import', 'select-appearance', 'name-appearance', 'recover-appearance'].includes(action)
        ? projectArtworkReceipt(response.result) : response.result;
    },
    image: shared.artworkImage,
  }, shared.externalUpdate?.versions.appearance ?? '');
}
