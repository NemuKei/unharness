import type { SourceMode } from './sources';

export const chatRequests = [
  { id: 'initial', label: '初期設定', example: 'アンハーネスの初期設定をして', description: '対象を確認し、いつもの構成を保存する。' },
  { id: 'settings', label: '設定変更', example: '零式と限定解除のSkill構成を見直して', description: '各モードに残す指示やSkillを相談する。' },
  { id: 'mode', label: 'モード切替', example: '零式に切り替えて', description: '保存したモードを、新しいタスクで使う。' },
  { id: 'appearance', label: '外観', example: 'アンハーネスのオリジナルイメージを作成したい', description: '自分のAIと、好きな姿を作る。' },
] as const;

export const reviewSetupRequest = 'アンハーネスの零式と限定解除のSkill構成を見直して。現在の接続先・登録対象と保存済みのNormalを確認し、Normalを残したまま、両モードの指示とSkill構成を相談してください。私が確認してから構成を保存し、モード切替は別に扱ってください。';
export function bindChatScope(prompt: string, scopeId?: string): string {
  return scopeId ? prompt + '\n表示中の登録範囲ID: ' + scopeId + '。statusでこの範囲と一致することを確認してください。一致しない場合は別の接続で進めず、対象を確認してください。' : prompt;
}
export function modeChatRequest(mode: SourceMode) {
  const name = mode === 'normal' ? '通常装備（Normal）' : mode === 'unseal' ? '限定解除' : '零式';
  return 'アンハーネスを' + name + 'に切り替えて。現在の接続先と保存した構成を確認して進め、アプリ内ブラウザで操作画面も開いてください。';
}
