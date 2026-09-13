import { useEffect, useId, useRef, useState } from 'react';

export const stateCheckPrompt = 'Unharnessのstatusで接続先と現在の保存状態を確認し、操作できない理由と復旧の必要を調べてください。確認なしに設定変更やNormalの更新をしないでください。結果が不明な操作は元の操作IDで照会し、新しい操作IDで再実行しないでください。保存時と現在の差分を示し、次に必要な操作を案内してください。';

export function AiRequestButton({ label, prompt, description, fieldLabel = 'AIへの依頼文', disabled = false, primary = false, preview = true, recipient = 'Codex' }: {
  label: string; prompt: string; description?: string | null; fieldLabel?: string; disabled?: boolean; primary?: boolean; preview?: boolean; recipient?: string;
}) {
  const id = useId(), field = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(''), [failed, setFailed] = useState(''), [open, setOpen] = useState(false);
  useEffect(() => {
    if (failed === prompt) { field.current?.focus(); field.current?.select(); }
  }, [failed, prompt, open]);
  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(prompt); setFailed(''); }
    catch { setFailed(prompt); setCopied(''); setOpen(true); }
  }
  const note = copied === prompt ? '依頼文をコピーしました。' + recipient + 'に貼り付けて送ってください。'
    : failed === prompt ? 'コピーできませんでした。下の依頼文を選択してコピーしてください。'
      : description === null ? null : description ?? '依頼文をコピーして、' + recipient + 'に貼り付けます。';
  return <div className="ai-request-action">
    <button type="button" className={primary ? 'primary' : 'secondary'} disabled={disabled} onClick={() => void copy()}>{label}</button>
    {note && <p className="muted" role="status">{note}</p>}
    {(preview || failed === prompt) && <details open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>依頼文を確認</summary>
      <label htmlFor={id}>{fieldLabel}</label><textarea id={id} ref={field} value={prompt} readOnly rows={5}/>
    </details>}
  </div>;
}
