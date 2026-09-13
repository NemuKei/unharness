import type { SourceMode } from './sources';

export type ModeBlocker = { kind: 'busy' | 'connect' | 'refresh' | 'initial' | 'settings' | 'changes' | 'recovery' | 'operation'; message: string };
export function modeBlocker(state: {
  busy: boolean; connected: boolean; confirmed: boolean; registered: boolean; conflict: boolean;
  recoveryPending: boolean; setupRequired: boolean; operationUncertain?: boolean;
}, mode: SourceMode): ModeBlocker | null {
  if (state.busy) return { kind: 'busy', message: '処理中です。完了すると操作できるようになります。' };
  if (!state.connected) return { kind: 'connect', message: 'このMacとの接続を確認してから切り替えます。' };
  if (!state.confirmed) return { kind: 'refresh', message: '現在の設定を確認できていません。状態を読み直してください。' };
  if (!state.registered) return { kind: 'initial', message: '対象の確認と、いつもの構成の保存がまだです。初期設定から始めてください。' };
  if (state.recoveryPending) return { kind: 'recovery', message: '中断した変更があります。復旧内容を確認してから切り替えます。' };
  if (state.conflict) return { kind: 'changes', message: '保存時と今の設定が異なるため、切替を止めています。' };
  if (state.operationUncertain) return { kind: 'operation', message: '前の操作結果が未確認です。同じ操作の結果を確認してください。' };
  if (mode !== 'normal' && state.setupRequired) return { kind: 'settings', message: '零式と限定解除の構成が確認・保存待ちです。先に設定を見直してください。' };
  return null;
}
