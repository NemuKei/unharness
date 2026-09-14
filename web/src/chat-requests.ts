import { text as t } from './locale.ts';
import type { SourceMode } from './sources';

export const chatRequests = [
  { id: 'initial', get label() { return t("初期設定", "Initial setup"); }, get example() { return t("アンハーネスの初期設定をして", "Help me set up Unharness"); }, get description() { return t("対象を確認し、いつもの構成を保存する。", "Review the targets and save your everyday setup."); } },
  { id: 'settings', get label() { return t("設定変更", "Settings"); }, get example() { return t("零式と限定解除のSkill構成を見直して", "Review my TRUEFORM and UNSEAL Skills"); }, get description() { return t("各モードに残す指示やSkillを相談する。", "Discuss the instructions and Skills to keep in each mode."); } },
  { id: 'mode', get label() { return t("モード切替", "Change mode"); }, get example() { return t("零式に切り替えて", "Switch to TRUEFORM"); }, get description() { return t("保存したモードを、新しいタスクで使う。", "Use a saved loadout in a fresh task."); } },
  { id: 'appearance', get label() { return t("外観", "Appearance"); }, get example() { return t("アンハーネスのオリジナルイメージを作成したい", "Help me create an original Unharness appearance"); }, get description() { return t("自分のAIと、好きな姿を作る。", "Create a look you love with your own AI."); } },
] as const;

export function reviewSetupRequest() { return t('アンハーネスの零式と限定解除のSkill構成を見直して。現在の接続先・登録対象と保存済みのNormalを確認し、Normalを残したまま、両モードの指示とSkill構成を相談してください。私が確認してから構成を保存し、モード切替は別に扱ってください。', 'Review my TRUEFORM and UNSEAL Skills in Unharness. Verify the current connection, registered targets and saved Normal. Preserve Normal while proposing instructions and Skills for both modes. Save the proposal after my review; treat applying a mode as a separate action. Please guide me in English.'); }
export function bindChatScope(prompt: string, scopeId?: string): string {
  return scopeId ? prompt + t('\n表示中の登録範囲ID: ' + scopeId + '。statusでこの範囲と一致することを確認してください。一致しない場合は別の接続で進めず、対象を確認してください。', '\nDisplayed registered scope ID: ' + scopeId + '. Verify this scope with status. If it differs, confirm the target before proceeding; do not operate through another connection.') : prompt;
}
export function modeChatRequest(mode: SourceMode) {
  const name = mode === 'normal' ? '通常装備（Normal）' : mode === 'unseal' ? '限定解除' : '零式';
  return t('アンハーネスを' + name + 'に切り替えて。現在の接続先と保存した構成を確認して進め、アプリ内ブラウザで操作画面も開いてください。', 'Switch Unharness to ' + (mode === 'normal' ? 'Normal' : mode === 'unseal' ? 'UNSEAL' : 'TRUEFORM') + '. Verify the current connection and saved loadout, then carry out the operation and open the workbench in the in-app browser. Please guide me in English.');
}
