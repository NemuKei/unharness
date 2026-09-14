import { text as t } from './locale.ts';
import { useId, useRef, useState } from 'react';
import type { SourceView } from './sources';
import { setupHandoffPrompt, freshTaskHandoffPrompt } from './setup';
import type { SetupRoute } from './setup';
import type { useSourceController } from './useSourceController';
import { SavedSetupSummary, readableSetup } from './SavedSetupSummary';
import type { SetupRead } from './SavedSetupSummary';
import { AiRequestButton, stateCheckPrompt } from './AiRequestButton';
import { bindChatScope } from './chat-requests';

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
    <button type="button" className="secondary" onClick={() => void copy()}>{t("依頼文をコピー", "Copy request")}</button>
    <p role="status" className="muted">{copied === prompt ? t("コピーしました。AIの入力欄に貼り付けて送信してください。", "Copied. Paste into your AI and send it when ready.")
      : failed === prompt ? t("コピーできませんでした。上の依頼文を選択してコピーしてください。", "Copy failed. Select the request above and copy it manually.")
        : t("コピーだけではAIへの送信や設定変更は行いません。", "Copying does not send anything or change settings.")}</p>
  </div>;
}

export function SetupHandoff({ view, confirmed, busy, execute }: { view: SourceView; confirmed: boolean; busy: boolean;
  execute: ReturnType<typeof useSourceController>['executeAuxiliary'] }) {
  const configured = !!view.source?.setup?.setupId;
  const setupRequired = !!view.source?.setup?.setupRequired;
  const hasHistory = configured || setupRequired;
  const registered = !!view.source;
  const [open, setOpen] = useState(false);
  const [route, setRoute] = useState<SetupRoute>(hasHistory ? 'current' : 'zero-first');
  const [saved, setSaved] = useState<{ key: string; data: SetupRead } | null>(null);
  const [readError, setReadError] = useState('');
  const key = `${view.metadata.contextId}:${view.source?.revision}`;
  const supported = view.metadata.application === 'codex';
  const reliable = confirmed && !view.source?.conflict && !view.source?.recovery.pending;
  async function readSaved() {
    setSaved(null); setReadError('');
    const result = await execute<SetupRead>('setup', {});
    if (result.status === 'context-updated') return;
    if (result.status === 'failed' || result.result?.scopeId !== view.source?.registration.scopeId
      || result.result.setupId !== view.source?.setup?.setupId || !readableSetup(result.result)) {
      setReadError(t("保存内容を確認できませんでした。「状態を再取得」で確認し直してください。", "Saved settings are unconfirmed. Use Refresh state to check again.")); return;
    }
    setSaved({ key, data: result.result });
  }
  return <section className="control-section setup-handoff" aria-label={t("AIへの設定相談", "Settings consultation with AI")}>
    <h2>{registered ? t("各モードの構成を見直す", "Review your loadouts") : t("初期設定", "Initial setup")}</h2>
    <AiRequestButton primary disabled={!supported || busy}
      label={!reliable ? t("状態の確認をAIに頼む", "Ask AI to check the state") : registered ? t("設定をAIと見直す", "Review settings with AI") : t("初期設定をAIに頼む", "Ask AI to help with initial setup")}
      prompt={!reliable ? bindChatScope(stateCheckPrompt(), view.source?.registration.scopeId) : setupHandoffPrompt(view, route)} fieldLabel={t("設定相談の依頼文", "Settings review request")}
      description={!reliable ? t("まず差分や中断を確認します。相談のコピーでは設定を変更しません。", "Inspect differences or interrupted changes first. Copying a consultation request does not change settings.")
        : t("依頼文をコピーしてCodexに貼り付けます。対象の確認と登録は、このMacの確認画面で行います。", "Copy the request into Codex. Target review and registration happen on this Mac's confirmation screen.")}/>
    {!supported ? <p className="muted">{t("Claude Codeの設定相談への対応は後続です。", "Claude Code setup consultation is planned for later.")}</p>
      : <p className="muted">{registered ? t("いつものNormalを残して、零式と限定解除に残す指示・Skillを相談します。保存した構成を使うときは「モード」から切り替えます。", "Preserve your everyday Normal while discussing instructions and Skills for TRUEFORM and UNSEAL. Use Mode to prepare a saved loadout.")
        : t("まず対象を確認し、いつもの構成をNormalとして保存します。その後、零式と限定解除の構成をAIと相談します。", "Review the targets and save your usual setup as Normal. Then discuss TRUEFORM and UNSEAL with your AI.")}</p>}
    {view.source?.setup?.setupId && <p className="setup-saved" role="status">{t("解除設定は保存済みです。", "Release-mode settings are saved.")}{view.source.setup.preparedSetupId !== view.source.setup.setupId || view.source.registration.modeChangeRequired ? t(" 次に解除モードを準備するときに使います。", " They will be used next time you prepare a release mode.") : t(" 現在の準備にもこの保存版を使っています。", " This saved version is also used by the current preparation.")}</p>}
    {setupRequired && <p className="setup-saved" role="status">{t("この登録の2構成は確認・保存待ちです。以前の保存版はそのまま残っています。", "Both loadouts for this registration await review and saving. Earlier versions are retained.")}</p>}
    {reliable && <details className="setup-conversation" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary>{t("保存した構成・相談方法を確認", "Review saved loadouts and consultation options")}</summary>
      {configured && <>
        <button type="button" className="secondary" aria-disabled={busy} aria-busy={busy} onClick={() => { if (!busy) void readSaved(); }}>{t("保存した2構成を確認", "Review the saved pair")}</button>
        {readError && <p role="alert">{readError}</p>}
        {saved?.key === key && <SavedSetupSummary data={saved.data} sources={view.source!.registration.sources} plugins={view.source!.registration.plugins} />}
      </>}
      <fieldset>
        <legend>{t("相談を始める構成", "Starting point for consultation")}</legend>
        <label><input type="radio" name="setup-route" disabled={busy || setupRequired} checked={route === 'zero-first'} onChange={() => setRoute('zero-first')} />
          <span>{t("零式で初期設定を見直す", "Review initial setup in TRUEFORM")}{!hasHistory && t("（推奨）", " (recommended)")}</span></label>
        <label><input type="radio" name="setup-route" disabled={busy} checked={route === 'current'} onChange={() => setRoute('current')} /><span>{t("現在の構成から相談する", "Consult from the current loadout")}</span></label>
      </fieldset>
      <p className="muted">{t("零式を選ぶ場合も、元のNormalの保存と対象の確認が先です。準備後は新しいタスクへ移って相談します。", "Even when choosing TRUEFORM, first save Normal and review the targets. After preparation, continue the consultation in a fresh task.")}</p>
      <p className="muted">{t("設定の準備は同じCodex環境で共有され、次の新規タスクに使われます。", "Prepared settings are shared by the same Codex profile and used by subsequent fresh tasks.")}</p>
    </details>}
  </section>;
}

export function FreshTaskHandoff({ view, disabled }: { view: SourceView; disabled: boolean }) {
  const prompt = freshTaskHandoffPrompt(view);
  if (!prompt) return null;
  return <details className="fresh-task-handoff">
    <summary>{t("この設定で新しいタスクを始める", "Start a fresh task with this setup")}</summary>
    <p className="muted">{t("同じプロジェクトの新しいタスクへ依頼文を貼り付け、最初の短い応答を完了させてください。その後、この画面か元の管理タスクから読み込みを確認します。現在の会話の読み込みは変わりません。", "Paste the request into a fresh task in the same project and let its first short response finish. Then check loading from this screen or the original management task. The current conversation's loaded input stays unchanged.")}</p>
    {disabled ? <p className="muted">{t("まず現在の準備状態を確認してください。", "Check the current preparation first.")}</p>
      : <PromptCopy prompt={prompt} label={t("新しいタスクへの依頼文", "Request for a fresh task")} />}
  </details>;
}
