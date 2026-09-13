import type { ReactNode } from 'react';
import type { ModeBlocker } from './mode-blocker';

export function ModeActions({ title, blocker, planReady, review, confirm, resolve, statusMessage, children }: {
  title: string; blocker: ModeBlocker | null; planReady: boolean; review: () => void; confirm: () => void;
  resolve?: ReactNode; statusMessage?: string; children?: ReactNode;
}) {
  return <section className="mode-action" aria-label="モード切替">
    <h2>{title}を次のタスク用に準備</h2>
    {blocker ? <div className="mode-blocker"><p role="status">{blocker.message}</p>{resolve}</div>
      : planReady ? children : <p className="muted">保存した構成の変更内容を確認してから、確定します。</p>}
    <div className="mode-action-buttons">
      {(!planReady || blocker) && <button type="button" className="secondary" disabled={!!blocker} onClick={review}>変更内容を確認</button>}
      <button type="button" className="primary" disabled={!!blocker || !planReady} onClick={confirm}>この内容で確定する</button>
    </div>
    {statusMessage && <p className="mode-action-status" role="status">{statusMessage}</p>}
    <p className="muted">新しいタスクで使う設定です。今のタスクの読み込みは変わりません。</p>
  </section>;
}

export function InstructionScopeNote({ application = 'codex', compact = false }: { application?: 'codex' | 'claude'; compact?: boolean }) {
  if (application === 'claude') return <p className="instruction-scope muted">登録した任意の指示とSkillだけを切り替えます。プロジェクトの必須条件は保持します。</p>;
  return <div className={'instruction-scope' + (compact ? ' compact' : '')}>
    <p><strong>グローバルAGENTS.mdなど、登録した指示とSkillの読み込みを切り替えます。</strong><br/>リポジトリ内のAGENTS.mdは変更しません。</p>
    <details><summary>指示の切り替わり方</summary><p>登録した任意のグローバル指示の読み込ませ方を切り替えます。元のAGENTS.mdを残し、AGENTS.override.mdを使って切り替えます。同じCodex設定を使う、他のプロジェクトの新しいタスクにも共通する変更です。登録対象外の指示・Skill、メモリ、実行権限は保持します。</p></details>
  </div>;
}
