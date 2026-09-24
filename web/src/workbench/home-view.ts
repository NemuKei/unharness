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
  const canPlan = !!state.source && state.source.preparedMode !== 'normal' && state.confirmed && !state.source.recovery.pending
    && (!state.source.conflict || state.source.modePlanningAvailable === true);
  return { mode: ready ? state.source!.preparedMode : null,
    proposal: state.proposals.find(p => p.status === 'pending') ?? null,
    switchTargets: ['trueform', 'unseal'], canRestore: canPlan && !state.busy,
    notice: state.failure ?? (state.source && state.confirmed && state.source.preparedMode === 'normal' && !state.source.setup?.setupId
      ? t('次はAIと零式の中身を決める', 'Next, decide TRUEFORM with AI') : null) };
}
export function modeChoice(source: HomeSource | null, mode: SourceMode): 'switch' | 'consult' {
  return mode !== 'normal' && !source?.setup?.setupId ? 'consult' : 'switch';
}
export function consultationCopy(mode: SourceMode): { label: string; prompt: string } {
  return mode === 'trueform' ? {
    label: t('AIと零式の中身を決める', 'Plan TRUEFORM with AI'),
    prompt: t('Unharnessの零式の中身を決めたいです。登録した追加指示とSkillを確認し、外すものと残すものを、それぞれ理由つきで提案してください。仕事の決まり、権限、メモリ、管理機能は残してください。まだ設定は変えないでください。',
      'Help decide what TRUEFORM should remove and keep. Review registered optional instructions and Skills, give a reason for each choice, preserve work requirements, permissions, memory and management, and do not change settings yet.'),
  } : {
    label: t('AIと足すものを相談', 'Ask AI what to add'),
    prompt: t('Unharnessの限定解除に足すSkillを一緒に考えてください。今の零式と保存した構成を確認し、試す候補を1〜2件、理由と戻し方を添えて提案してください。まだ設定は変えないでください。',
      'Help me choose one or two Skills to try in UNSEAL. Check the current TRUEFORM and saved setup, explain the reasons and how to return, and do not change settings yet.'),
  };
}
export function restoreHint(source: HomeSource | null): string | null {
  return source?.preparedMode === 'normal' ? t('今は元の構成です', 'You are already using the original setup') : null;
}
export function savedDetailsVisible(source: HomeSource | null): boolean { return source !== null; }
export type HomeUsageSummary = { byMode: Record<SourceMode, { tasks: number; perTask: number | null }>;
  ratioToTrueform: Record<SourceMode, number | null>; availability: 'none' | 'partial' | 'complete' };
export function usageDisplay(summary: HomeUsageSummary | null): { message: string; details: string[] } {
  const details = summary ? (['trueform', 'unseal', 'normal'] as const)
    .filter(mode => summary.byMode[mode]?.perTask !== null && summary.byMode[mode]?.perTask !== undefined)
    .map(mode => t(`${modePresentation[mode].title}：約${Number(summary.byMode[mode].perTask).toLocaleString('ja-JP')}／タスク`,
      `${modePresentation[mode].title}: about ${Number(summary.byMode[mode].perTask).toLocaleString('en-US')} per task`)) : [];
  const comparison = summary && summary.availability !== 'none'
    ? (['unseal', 'normal'] as const).find(mode => summary.ratioToTrueform[mode] !== null && Number.isFinite(summary.ratioToTrueform[mode])
      && summary.ratioToTrueform[mode]! > 0) : null;
  const ratio = comparison ? summary!.ratioToTrueform[comparison]! : null;
  return { message: comparison && ratio !== null
    ? t(`${modePresentation[comparison].title}は零式に比べて約${ratio.toFixed(1)}倍です。`,
      `${modePresentation[comparison].title} is about ${ratio.toFixed(1)} times TRUEFORM.`)
    : t('まだ目安がありません', 'No estimate yet'), details };
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
  return kind === 'codex-version-unqualified'
    ? t('このCodexの版は、まだ確認していません。今の設定はそのままです', 'This Codex version has not been checked yet. Your settings are unchanged.')
    : kind === 'proposal-stale'
    ? t('状況が変わりました。AIにもう一度聞いてください。', 'The situation changed. Ask AI for a new proposal.')
    : t('うまくいきませんでした。', 'That did not work.') + ' ' + failureAfterRefresh(before, after);
}
