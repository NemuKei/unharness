import { text as t } from './locale.ts';
import type { SourceMode } from './sources';

export type ModeBlocker = { kind: 'busy' | 'connect' | 'refresh' | 'initial' | 'settings' | 'changes' | 'recovery' | 'operation'; message: string };
export function modeBlocker(state: {
  busy: boolean; connected: boolean; confirmed: boolean; registered: boolean; conflict: boolean;
  recoveryPending: boolean; setupRequired: boolean; operationUncertain?: boolean;
}, mode: SourceMode): ModeBlocker | null {
  if (state.busy) return { kind: 'busy', message: t("処理中です。完了すると操作できるようになります。", "An operation is running. Controls will be available when it finishes.") };
  if (!state.connected) return { kind: 'connect', message: t("このMacとの接続を確認してから切り替えます。", "Confirm the connection to this Mac before changing modes.") };
  if (!state.confirmed) return { kind: 'refresh', message: t("現在の設定を確認できていません。状態を読み直してください。", "The current settings are unconfirmed. Read the state again.") };
  if (!state.registered) return { kind: 'initial', message: t("対象の確認と、いつもの構成の保存がまだです。初期設定から始めてください。", "Review the targets and save your everyday setup first. Start with initial setup.") };
  if (state.recoveryPending) return { kind: 'recovery', message: t("中断した変更があります。復旧内容を確認してから切り替えます。", "An interrupted change needs recovery review before switching.") };
  if (state.conflict) return { kind: 'changes', message: t("保存時と今の設定が異なるため、切替を止めています。", "Switching is paused because current settings differ from the saved version.") };
  if (state.operationUncertain) return { kind: 'operation', message: t("前の操作結果が未確認です。同じ操作の結果を確認してください。", "The previous operation is unconfirmed. Check that same operation's result.") };
  if (mode !== 'normal' && state.setupRequired) return { kind: 'settings', message: t("零式と限定解除の構成が確認・保存待ちです。先に設定を見直してください。", "TRUEFORM and UNSEAL are awaiting review and saving. Review Settings first.") };
  return null;
}
