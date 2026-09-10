import { useRef, useState } from "react";
export function CopyRequest({ text, label = "AIへの依頼文", button = "依頼文をコピー" }: { text: string; label?: string; button?: string }) {
  const input = useRef<HTMLTextAreaElement>(null), [notice, setNotice] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(text); setNotice("コピーしました。AIの入力欄に貼り付けて送信してください。"); }
    catch { input.current?.focus(); input.current?.select(); setNotice("コピーできませんでした。依頼文を選択してコピーしてください。"); }
  }
  return <div className="copy-request"><label>{label}<textarea aria-label={label} readOnly value={text} ref={input} rows={4} onFocus={() => setNotice("")} /></label>
    <button className="secondary" onClick={() => void copy()}>{button}</button>{notice && <p role="status">{notice}</p>}
  </div>;
}
