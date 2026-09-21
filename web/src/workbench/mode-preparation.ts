import type { SourceMode } from '../sources';

type PreparationSource = {
  preparedMode: SourceMode;
  conflict: object | null;
  recovery: { pending: boolean };
  registration: { modeChangeRequired?: boolean };
  setup?: { setupId?: string | null; preparedSetupId?: string | null; setupRequired?: boolean };
};

export function savedModeIsPrepared(source: PreparationSource | null | undefined, confirmed: boolean, mode: SourceMode) {
  if (!source || !confirmed || source.conflict || source.recovery.pending || source.registration.modeChangeRequired
    || source.setup?.setupRequired || source.preparedMode !== mode) return false;
  if (mode === 'normal' || !source.setup?.setupId) return true;
  return source.setup.preparedSetupId === source.setup.setupId;
}
