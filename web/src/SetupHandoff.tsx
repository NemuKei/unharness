import { useId, useRef, useState } from 'react';
import type { SourceView } from './sources';
import { setupHandoffPrompt, freshTaskHandoffPrompt } from './setup';
import type { SetupRoute } from './setup';

export function PromptCopy({ prompt, label }: { prompt: string; label: string }) {
  const fieldId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState('');
  const [failed, setFailed] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(prompt); setFailed('');
    } catch {
      setFailed(prompt); setCopied('');
      textarea.current?.focus(); textarea.current?.select();
    }
  }
  return <div className="setup-prompt">
    <label htmlFor={fieldId}>{label}</label>
    <textarea id={fieldId} ref={textarea} readOnly value={prompt} rows={6} />
    <button type="button" className="secondary" onClick={() => void copy()}>依頼文をコピー</button>
    <p role="status" className="muted">{copied === prompt ? 'コピーしました。AIの入力欄に貼り付けて送信してください。'
      : failed === prompt ? 'コピーできませんでした。上の依頼文を選択してコピーしてください。'
        : 'コピーだけではAIへの送信や設定変更は行いません。'}</p>
  </div>;
}

export function SetupHandoff({ view, confirmed, busy }: { view: SourceView; confirmed: boolean; busy: boolean }) {
  const configured = !!view.source?.setup?.setupId;
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState<SetupRoute>(configured ? 'current' : 'zero-first');
  const supported = view.metadata.application === 'codex';
  const usable = confirmed && !busy && !view.source?.conflict && !view.source?.recovery.pending;
  return <section className="control-section setup-handoff" aria-label="AIへの設定相談">
    <button type="button" className="secondary" aria-expanded={open} disabled={!supported || !usable}
      onClick={() => setOpen(value => !value)}>{configured ? '設定をAIに相談' : 'AIと初期設定を作る'}</button>
    {!supported ? <p className="muted">Claude Codeの設定相談への対応は後続です。</p>
      : <p className="muted">Normalを残して、限定解除と零式の構成を相談できます。</p>}
    {view.source?.setup?.setupId && <p className="setup-saved" role="status">解除設定は保存済みです。
      {view.source.setup.preparedSetupId !== view.source.setup.setupId ? ' 次に解除モードを準備するときに使います。' : ' 現在の準備にもこの保存版を使っています。'}</p>}
    {open && usable && <div className="setup-conversation">
      <fieldset>
        <legend>相談を始める構成</legend>
        <label><input type="radio" name="setup-route" checked={route === 'zero-first'} onChange={() => setRoute('zero-first')} />
          <span>零式で初期設定を見直す{!configured && '（推奨）'}</span></label>
        <label><input type="radio" name="setup-route" checked={route === 'current'} onChange={() => setRoute('current')} /><span>現在の構成から相談する</span></label>
      </fieldset>
      <p className="muted">零式を選ぶ場合も、元のNormalの保存と対象の確認が先です。準備後は新しいタスクへ移って相談します。</p>
      <PromptCopy prompt={setupHandoffPrompt(view, route)} label="設定相談の依頼文" />
    </div>}
  </section>;
}

export function FreshTaskHandoff({ view, disabled }: { view: SourceView; disabled: boolean }) {
  const prompt = freshTaskHandoffPrompt(view);
  if (!prompt) return null;
  return <details className="fresh-task-handoff">
    <summary>この設定で新しいタスクを始める</summary>
    <p className="muted">同じプロジェクトで新しいタスクを開き、依頼文を貼り付けてください。現在の会話の読み込みは変わりません。</p>
    {disabled ? <p className="muted">まず現在の準備状態を確認してください。</p>
      : <PromptCopy prompt={prompt} label="新しいタスクへの依頼文" />}
  </details>;
}
