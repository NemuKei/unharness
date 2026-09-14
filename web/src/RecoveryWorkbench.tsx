import { text as t } from './locale.ts';
import { LanguageSwitch } from './LanguageSwitch';
import { useEffect, useRef, useState } from 'react';
import { Api, ApiError, errorMessage } from './api';
import type { SourceMetadata, SourceState } from './sources';
import { modePresentation, sourceHomeOf } from './sources';
import './recovery.css';

type RecoveryState = {
  metadata: Omit<SourceMetadata, 'kind'> & { kind: 'recovery' };
  source: SourceState | null;
  recoveryOnly: true;
};
type Plan = { planId: string; changedFiles?: Array<{ id: string; label: string }>; managedFilesChanged?: number };
const changeLabel = (label: string) => ({
  'Global instruction override': t("追加指示", "Optional instructions"),
  'Skill enablement configuration': t("Skillの読み込み設定", "Skill loading settings"),
  'Skill invocation policy': t("Skillの自動呼び出し設定", "Automatic Skill selection"),
}[label] ?? label);
export function RecoveryWorkbench() {
  const api = useRef(new Api());
  const [state, setState] = useState<RecoveryState | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [retained, setRetained] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(t("保存した状態を確認しています。", "Checking the saved state."));
  function failed(value: unknown) {
    setConnected(false);
    setError(value instanceof ApiError && value.kind === 'source-conflict'
      ? t("Unharnessの外で設定が変更されています。編集を残したまま停止しました。", "Settings changed outside Unharness. Stopped and preserved those edits.")
      : value instanceof ApiError && value.kind === 'config-transform-failed'
        ? t("保持対象だけの変更と確認できないため、停止しました。MacでCodexが使えることと、追加指示やSkillの編集を確認してください。", "Could not confirm that only retained settings changed. Check that Codex is available on this Mac and review instruction or Skill edits.")
      : value instanceof ApiError && (value.kind.startsWith('plugin-') || value.kind === 'distribution-invalid')
        ? t("復旧用ファイルと保存先を照合できません。別の保存済み復旧版を確認してください。", "Recovery files do not match the saved location. Check another saved recovery copy.")
      : errorMessage(value));
  }
  async function refresh() {
    setBusy(true); setError(''); setPlan(null); setRetained(null);
    try {
      const boot = await api.current.connect();
      if (boot.kind !== 'recovery') throw new ApiError('recovery-connection-changed');
      const result = await api.current.get<RecoveryState>('/sources/state');
      if (result.metadata.kind !== 'recovery' || !result.recoveryOnly) throw new ApiError('invalid-response');
      setState(result); setConnected(true); setNotice(t("このMacの保存状態を確認しました。", "Checked the saved state on this Mac."));
    } catch (e) { failed(e); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function operate(action: string, input: object = {}) {
    if (!state || busy || !connected) return;
    setBusy(true); setError('');
    try {
      const value = await api.current.post<{ result: Plan; state: RecoveryState }>('/sources/' + action,
        { launchId: state.metadata.launchId, contextId: state.metadata.contextId, ...input });
      setState(value.state);
      if (action === 'plan') { setPlan(value.result); setNotice(t("Normalへ戻す変更内容を確認してください。", "Review the changes to restore Normal.")); }
      else if (action === 'plan-retained') { setRetained(value.result); setNotice(t("保持する設定だけの変更と確認できました。", "Confirmed that only retained settings changed.")); }
      else {
        setPlan(null); setRetained(null);
        setNotice(action === 'apply' ? t("Normalの保存ファイルへ戻しました。次の新規タスクで読み込まれます。", "Restored the saved Normal files. Use a new task to load them.")
          : action === 'accept-retained' ? t("独立した保持設定を採用しました。Normalの復帰内容を確認できます。", "Accepted the independent retained settings. You can now review restoring Normal.") : t("中断した処理の復旧を確認しました。", "Checked recovery of the interrupted operation."));
      }
    } catch (e) { failed(e); }
    finally { setBusy(false); }
  }
  const source = state?.source, disabled = busy || !connected;
  return <div className="app-shell recovery-shell">
    <header className="topbar"><a className="wordmark" href="#recovery-main">UNHARNESS<span>{t("保存した構成へ戻る。", "Return to a saved loadout.")}</span></a>
      <div className="header-right"><span className="scope-label">{t("このMac · Codex · 復旧", "This Mac · Codex · Recovery")}</span><LanguageSwitch/></div></header>
    <main id="recovery-main" className="recovery-main">
      <p className="eyebrow">LOCAL RECOVERY</p><h1>{t("Normalへ、戻れる。", "Return to Normal.")}</h1>
      <p className="recovery-intro">{t("保存した追加指示とSkillへ戻します。この画面は、サイトやAIを開けないときにも使えます。", "Restore your saved instructions and Skills. This screen also works when the site or AI is unavailable.")}</p>
      <div className="recovery-grid">
        <section className="control-section" aria-labelledby="recovery-state-heading">
          <h2 id="recovery-state-heading">{t("このMacの保存状態", "Saved state on this Mac")}</h2>
          <p className="recovery-mode">{source ? modePresentation[source.preparedMode].title : state ? t("Normal未保存", "Normal not saved") : t("確認中", "Checking")}</p>
          {state && !connected && <p>{t("最後に確認した保存状態です。現在の状態は未確認です。", "This is the last checked state. The current state is unconfirmed.")}</p>}
          <p>{source?.conflict ? t("独立した編集があります。復帰は保留しています。", "Independent edits were found. Restoration is on hold.")
            : source?.recovery.pending ? t("中断した処理があります。先に復旧してください。", "An operation was interrupted. Recover it first.")
            : source ? t("保存ファイルを確認しました。実行中のタスクへの反映は未確認です。", "Saved files were checked. Loading in the running task is unconfirmed.")
            : state ? t("初回のNormalが保存されていない場合、この画面からの復帰はできません。", "This screen cannot restore Normal until the first Normal has been saved.") : t("保存先を読み込んでいます。", "Reading the saved location.")}</p>
          {source && <p className="muted">{t("保存した対象：", "Saved targets: ")}{source.registration.sources.length}{t("件", " items")}</p>}
          <button className="secondary" disabled={busy} onClick={() => void refresh()}>{t("状態を再取得", "Refresh state")}</button>
        </section>
        <section className="control-section" aria-labelledby="recovery-normal-heading">
          <h2 id="recovery-normal-heading">{t("保存したNormalへ", "Restore saved Normal")}</h2>
          <p>{t("復帰する内容を確認してから適用します。お気に入りや作品は引き続き保存されます。", "Review the restoration before applying it. Favorites and artwork remain saved.")}</p>
          <button className="primary" disabled={disabled || !source || !!source.conflict || source.recovery.pending}
            onClick={() => void operate('plan', { mode: 'normal' })}>{t("復帰内容を確認", "Review restoration")}</button>
          {plan && <div className="recovery-plan"><h3>{t("Normalへの変更", "Changes to Normal")}</h3>
            {plan.changedFiles?.length ? <ul>{plan.changedFiles.map(file => <li key={file.id}>{changeLabel(file.label)}</li>)}</ul> : <p>{t("保存ファイルに変更はありません。", "No saved files change.")}</p>}
            <button className="primary" disabled={disabled} onClick={() => void operate('apply', { planId: plan.planId })}>{t("Normalへ戻す", "Restore Normal")}</button></div>}
        </section>
      </div>
      <p role="status" aria-live="polite" className="recovery-notice">{busy ? t("確認しています…", "Checking…") : notice}</p>
      {error && <p role="alert" className="global-error">{error}</p>}
      {source?.recovery.pending && <section className="control-section"><h2>{t("中断した処理を復旧する", "Recover an interrupted operation")}</h2>
        <p>{t("処理の記録と現在のファイルを照合し、独立した編集があれば停止します。", "Compare the operation record with current files and stop if independent edits exist.")}</p>
        <button className="secondary" disabled={disabled} onClick={() => void operate('recover')}>{t("中断した処理を復旧", "Recover interrupted operation")}</button></section>}
      {source?.conflict && !source.recovery.pending && <section className="control-section"><h2>{t("保持する設定の変更を確認する", "Review changes to retained settings")}</h2>
        <p>{t("プラグインの削除などで設定ファイルが変わった場合に使います。Macに入っているCodexで照合し、解除対象も変わっていれば停止します。", "Use this after settings change, such as when removing a plugin. Verify through this Mac's Codex and stop if managed targets also changed.")}</p>
        <button className="secondary" disabled={disabled} onClick={() => void operate('plan-retained')}>{t("変更の範囲を確認", "Review the changed scope")}</button>
        {retained && <div className="recovery-plan"><p>{t("追加指示・選択したSkillの変更はありません。現在の保持設定を、Normalへ復帰するときにも残します。", "Optional instructions and selected Skills are unchanged. Preserve current retained settings when restoring Normal.")}</p>
          <button className="primary" disabled={disabled} onClick={() => void operate('accept-retained', { planId: retained.planId })}>{t("この保持設定を採用", "Accept these retained settings")}</button></div>}
      </section>}
      {state && <details className="control-section recovery-details"><summary>{t("接続先と保存場所", "Connection and storage")}</summary>
        <dl><dt>Codex</dt><dd>{sourceHomeOf(state.metadata.context)}</dd><dt>{t("プロジェクト", "Project")}</dt><dd>{state.metadata.context.project}</dd>
          <dt>{t("保存場所", "Storage")}</dt><dd>{state.metadata.workspace ?? t("未保存", "Not saved")}</dd></dl></details>}
      <footer><span>UNHARNESS</span><span className="muted">{t("このMacに保存された復旧画面", "Recovery screen saved on this Mac")}</span></footer>
    </main>
  </div>;
}
