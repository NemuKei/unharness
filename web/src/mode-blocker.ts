import { text as t } from './locale.ts';
import type { SourceMode } from './sources';

export type ModeBlocker = { kind: 'busy' | 'connect' | 'refresh' | 'initial' | 'settings' | 'changes' | 'recovery' | 'operation'; message: string };
export function modeBlocker(state: {
  busy: boolean; connected: boolean; confirmed: boolean; registered: boolean; conflict: boolean;
  recoveryPending: boolean; setupRequired: boolean; operationUncertain?: boolean; modePlanningAvailable?: boolean;
}, mode: SourceMode): ModeBlocker | null {
  if (state.busy) return { kind: 'busy', message: t("処理中です。終わると操作できます。", "Working on it. Controls return when it finishes.") };
  if (!state.connected) return { kind: 'connect', message: t("このMacとつながっていません。「状態を再取得」を押してください。", "Not connected to this Mac. Press Refresh state.") };
  if (!state.confirmed) return { kind: 'refresh', message: t("今の設定をまだ確かめていません。「状態を再取得」を押してください。", "The current settings are not checked yet. Press Refresh state.") };
  if (!state.registered) return { kind: 'initial', message: t("まず初期設定が必要です。チャットで「アンハーネスの初期設定をして」と頼めます。", "Initial setup comes first. Ask your AI: “Set up Unharness.”") };
  if (state.recoveryPending) return { kind: 'recovery', message: t("途中で止まった変更があります。切り替える前に、復旧を確かめてください。", "A change stopped partway. Check recovery before switching.") };
  if (state.conflict && !state.modePlanningAvailable) return { kind: 'changes', message: t("前に保存したときから設定が変わっています。安全のため、切り替えを止めています。", "Settings changed since they were saved, so switching is paused for safety.") };
  if (state.operationUncertain) return { kind: 'operation', message: t("前の操作の結果をまだ確かめていません。もう一度押さずに、「状態を再取得」で確かめてください。", "The previous result is not confirmed yet. Don’t press again — use Refresh state.") };
  if (mode !== 'normal' && state.setupRequired) return { kind: 'settings', message: t("零式と限定解除の中身がまだ決まっていません。チャットで「零式と限定解除のSkill構成を見直して」と頼めます。", "TRUEFORM and UNSEAL are not set up yet. Ask your AI to review them.") };
  return null;
}
