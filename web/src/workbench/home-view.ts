import { text as t } from '../locale.ts';
import { modePresentation } from '../sources.ts';
import type { SourceMode, SourceState } from '../sources.ts';

export type HomeProposal = { proposalId: string; kind: 'initial' | 'add' | 'remove' | 'restore'; mode: SourceMode;
  items: { sourceId: string; reason: string }[]; status: 'pending' | 'applying' | 'applied' | 'dismissed' | 'stale';
  result?: { planId: string; preparedMode: SourceMode; revision: number; readback: string } };
type HomeSource = Pick<SourceState, 'preparedMode' | 'revision' | 'conflict' | 'recovery' | 'modePlanningAvailable'>
  & { setup?: Pick<NonNullable<SourceState['setup']>, 'setupId'>; registration: Pick<SourceState['registration'], 'scopeId'> };
export type HomeInput = { source: HomeSource | null; confirmed: boolean; busy: boolean; proposals: HomeProposal[]; failure: string | null };
export type HomeView = { mode: SourceMode | null; proposal: HomeProposal | null;
  switchTargets: SourceMode[]; canRestore: boolean; notice: string | null };

export function homeView(state: HomeInput): HomeView {
  const ready = !!state.source && state.confirmed && !state.source.conflict && !state.source.recovery.pending;
  const canPlan = !!state.source && state.confirmed && !state.source.recovery.pending
    && (!state.source.conflict || state.source.modePlanningAvailable === true);
  return { mode: ready ? state.source!.preparedMode : null,
    proposal: state.proposals.find(p => p.status === 'pending') ?? null,
    switchTargets: ['trueform', 'unseal'], canRestore: canPlan && !state.busy, notice: state.failure };
}
export function modeChoice(source: HomeSource | null, mode: SourceMode): 'switch' | 'consult' {
  return mode === 'unseal' && !source?.setup?.setupId ? 'consult' : 'switch';
}
export function modeForAction(action: SourceMode | 'restore'): SourceMode {
  return action === 'restore' ? 'normal' : action;
}
export function switchSheetText(mode: SourceMode, removed: number): string {
  return t(`${modePresentation[mode].title}にします。外れるもの${removed}件。次の新しいタスクから`,
    `Switch to ${modePresentation[mode].title}. ${removed} items will be removed. From your next new task.`);
}
type SavedMode = { available: boolean; instructions: { style: string };
  skills: { id: string; state: 'automatic' | 'manual' | 'disabled' | 'unknown' }[] };
export function removedCount(contents: { modes: Partial<Record<SourceMode, SavedMode>> } | null,
  from: SourceMode, to: SourceMode): number | null {
  const before = contents?.modes[from], after = contents?.modes[to];
  if (!before?.available || !after?.available) return null;
  const rank = { automatic: 2, manual: 1, disabled: 0, unknown: -1 };
  let removed = before.instructions.style !== 'none' && after.instructions.style === 'none' ? 1 : 0;
  for (const skill of before.skills) {
    const target = after.skills.find(row => row.id === skill.id);
    if (!target || skill.state === 'unknown' || target.state === 'unknown') return null;
    if (rank[skill.state] > rank[target.state]) removed++;
  }
  return removed;
}
export function failureAfterRefresh(before: HomeSource | null, after: HomeSource | null): string {
  const unchanged = !!before && !!after && !after.conflict && !after.recovery.pending
    && before.registration.scopeId === after.registration.scopeId
    && before.revision === after.revision && before.preparedMode === after.preparedMode;
  return unchanged ? t('設定は変わっていません。', 'Settings are unchanged.')
    : after && !after.conflict && !after.recovery.pending
      ? t('状況が変わりました。AIに調べてもらってください。', 'The situation changed. Ask AI to investigate.')
      : t('今の設定を確認できませんでした。', 'The current settings could not be confirmed.');
}
export function proposalFailureMessage(kind: string, before: HomeSource | null, after: HomeSource | null): string {
  return kind === 'proposal-stale'
    ? t('状況が変わりました。AIにもう一度聞いてください。', 'The situation changed. Ask AI for a new proposal.')
    : t('うまくいきませんでした。', 'That did not work.') + ' ' + failureAfterRefresh(before, after);
}
