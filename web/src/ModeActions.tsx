import { text as t } from './locale.ts';
import type { ReactNode } from 'react';
import type { ModeBlocker } from './mode-blocker';

export function ModeActions({ title, blocker, planReady, review, confirm, resolve, statusMessage, children, compact = false }: {
  title: string; blocker: ModeBlocker | null; planReady: boolean; review: () => void; confirm: () => void;
  resolve?: ReactNode; statusMessage?: string; children?: ReactNode; compact?: boolean;
}) {
  return <section className="mode-action" aria-label={t("モード切替", "Change mode")}>
    <h2>{t(title + 'を次のタスク用に準備', 'Prepare ' + title + ' for a fresh task')}</h2>
    {blocker ? <div className="mode-blocker"><p role="status">{blocker.message}</p>{resolve}</div>
      : planReady ? compact ? <details><summary>{t('変更内容の詳細', 'Change details')}</summary>{children}</details> : children : !compact && <p className="muted">{t("保存した構成の変更内容を確認してから、確定します。", "Review the saved configuration changes before applying them.")}</p>}
    <div className="mode-action-buttons">
      {(!planReady || blocker) && <button type="button" className="secondary" disabled={!!blocker} onClick={review}>{t("変更内容を確認", "Review changes")}</button>}
      <button type="button" className="primary" disabled={!!blocker || !planReady} onClick={confirm}>{t("この内容で確定する", "Apply these changes")}</button>
    </div>
    {statusMessage && <p className="mode-action-status" role="status">{statusMessage}</p>}
    <p className="muted">{t("新しいタスクで使う設定です。今のタスクの読み込みは変わりません。", "These settings are for a fresh task. The current task's loaded instructions stay unchanged.")}</p>
  </section>;
}

export function InstructionScopeNote({ application = 'codex', compact = false }: { application?: 'codex' | 'claude'; compact?: boolean }) {
  if (application === 'claude') return <p className="instruction-scope muted">{t("登録した任意の指示とSkillだけを切り替えます。プロジェクトの必須条件は保持します。", "Only registered optional instructions and Skills change. Project requirements stay in place.")}</p>;
  return <div className={'instruction-scope' + (compact ? ' compact' : '')}>
    <p><strong>{t("グローバルAGENTS.mdなど、登録した指示とSkillの読み込みを切り替えます。", "Change how registered instructions and Skills, including global AGENTS.md, are loaded.")}</strong><br/>{t("リポジトリ内のAGENTS.mdは変更しません。", "Repository AGENTS.md stays unchanged.")}</p>
    <details><summary>{t("指示の切り替わり方", "How instructions change")}</summary><p>{t("登録した任意のグローバル指示の読み込ませ方を切り替えます。元のAGENTS.mdを残し、AGENTS.override.mdを使って切り替えます。同じCodex設定を使う、他のプロジェクトの新しいタスクにも共通する変更です。登録対象外の指示・Skill、メモリ、実行権限は保持します。", "Changes use AGENTS.override.md while preserving the original global AGENTS.md. They also affect fresh tasks in other projects using the same Codex profile. Unregistered instructions and Skills, memory and execution permissions stay unchanged.")}</p></details>
  </div>;
}
