import { useRef, useState } from "react";
import { text as t } from '../locale.ts';
export function CopyRequest({ text, label = t("AIへの依頼文", "Request for your AI"), button = t("依頼文をコピー", "Copy request") }: { text: string; label?: string; button?: string }) {
  const input = useRef<HTMLTextAreaElement>(null), [notice, setNotice] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setNotice('copied'); }
    catch { input.current?.focus(); input.current?.select(); setNotice('failed'); }
  }
  return <div className="copy-request"><label>{label}<textarea aria-label={label} readOnly value={text} ref={input} rows={4} onFocus={() => setNotice('idle')} /></label>
    <button className="secondary" onClick={() => void copy()}>{button}</button>{notice !== 'idle' && <p role="status">{notice === 'copied'
      ? t('コピーしました。AIの入力欄に貼り付けて送信してください。', 'Copied. Paste into your AI and send it when ready.')
      : t('コピーできませんでした。依頼文を選択してコピーしてください。', 'Copy failed. Select the request and copy it manually.')}</p>}
  </div>;
}
