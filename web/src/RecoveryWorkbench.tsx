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
  'Global instruction override': '追加指示',
  'Skill enablement configuration': 'Skillの読み込み設定',
  'Skill invocation policy': 'Skillの自動呼び出し設定',
}[label] ?? label);
export function RecoveryWorkbench() {
  const api = useRef(new Api());
  const [state, setState] = useState<RecoveryState | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [retained, setRetained] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('保存した状態を確認しています。');
  function failed(value: unknown) {
    setConnected(false);
    setError(value instanceof ApiError && value.kind === 'source-conflict'
      ? 'Unharnessの外で設定が変更されています。編集を残したまま停止しました。'
      : value instanceof ApiError && value.kind === 'config-transform-failed'
        ? '保持対象だけの変更と確認できないため、停止しました。MacでCodexが使えることと、追加指示やSkillの編集を確認してください。'
      : value instanceof ApiError && (value.kind.startsWith('plugin-') || value.kind === 'distribution-invalid')
        ? '復旧用ファイルと保存先を照合できません。別の保存済み復旧版を確認してください。'
      : errorMessage(value));
  }
  async function refresh() {
    setBusy(true); setError(''); setPlan(null); setRetained(null);
    try {
      const boot = await api.current.connect();
      if (boot.kind !== 'recovery') throw new ApiError('recovery-connection-changed');
      const result = await api.current.get<RecoveryState>('/sources/state');
      if (result.metadata.kind !== 'recovery' || !result.recoveryOnly) throw new ApiError('invalid-response');
      setState(result); setConnected(true); setNotice('このMacの保存状態を確認しました。');
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
      if (action === 'plan') { setPlan(value.result); setNotice('Normalへ戻す変更内容を確認してください。'); }
      else if (action === 'plan-retained') { setRetained(value.result); setNotice('保持する設定だけの変更と確認できました。'); }
      else {
        setPlan(null); setRetained(null);
        setNotice(action === 'apply' ? 'Normalの保存ファイルへ戻しました。次の新規タスクで読み込まれます。'
          : action === 'accept-retained' ? '独立した保持設定を採用しました。Normalの復帰内容を確認できます。' : '中断した処理の復旧を確認しました。');
      }
    } catch (e) { failed(e); }
    finally { setBusy(false); }
  }
  const source = state?.source, disabled = busy || !connected;
  return <div className="app-shell recovery-shell">
    <header className="topbar"><a className="wordmark" href="#recovery-main">UNHARNESS<span>保存した構成へ戻る。</span></a>
      <span className="scope-label">このMac · Codex · 復旧</span></header>
    <main id="recovery-main" className="recovery-main">
      <p className="eyebrow">LOCAL RECOVERY</p><h1>Normalへ、戻れる。</h1>
      <p className="recovery-intro">保存した追加指示とSkillへ戻します。この画面は、サイトやAIを開けないときにも使えます。</p>
      <div className="recovery-grid">
        <section className="control-section" aria-labelledby="recovery-state-heading">
          <h2 id="recovery-state-heading">このMacの保存状態</h2>
          <p className="recovery-mode">{source ? modePresentation[source.preparedMode].title : state ? 'Normal未保存' : '確認中'}</p>
          {state && !connected && <p>最後に確認した保存状態です。現在の状態は未確認です。</p>}
          <p>{source?.conflict ? '独立した編集があります。復帰は保留しています。'
            : source?.recovery.pending ? '中断した処理があります。先に復旧してください。'
            : source ? '保存ファイルを確認しました。実行中のタスクへの反映は未確認です。'
            : state ? '初回のNormalが保存されていない場合、この画面からの復帰はできません。' : '保存先を読み込んでいます。'}</p>
          {source && <p className="muted">保存した対象：{source.registration.sources.length}件</p>}
          <button className="secondary" disabled={busy} onClick={() => void refresh()}>状態を再取得</button>
        </section>
        <section className="control-section" aria-labelledby="recovery-normal-heading">
          <h2 id="recovery-normal-heading">保存したNormalへ</h2>
          <p>復帰する内容を確認してから適用します。お気に入りや作品は引き続き保存されます。</p>
          <button className="primary" disabled={disabled || !source || !!source.conflict || source.recovery.pending}
            onClick={() => void operate('plan', { mode: 'normal' })}>復帰内容を確認</button>
          {plan && <div className="recovery-plan"><h3>Normalへの変更</h3>
            {plan.changedFiles?.length ? <ul>{plan.changedFiles.map(file => <li key={file.id}>{changeLabel(file.label)}</li>)}</ul> : <p>保存ファイルに変更はありません。</p>}
            <button className="primary" disabled={disabled} onClick={() => void operate('apply', { planId: plan.planId })}>Normalへ戻す</button></div>}
        </section>
      </div>
      <p role="status" aria-live="polite" className="recovery-notice">{busy ? '確認しています…' : notice}</p>
      {error && <p role="alert" className="global-error">{error}</p>}
      {source?.recovery.pending && <section className="control-section"><h2>中断した処理を復旧する</h2>
        <p>処理の記録と現在のファイルを照合し、独立した編集があれば停止します。</p>
        <button className="secondary" disabled={disabled} onClick={() => void operate('recover')}>中断した処理を復旧</button></section>}
      {source?.conflict && !source.recovery.pending && <section className="control-section"><h2>保持する設定の変更を確認する</h2>
        <p>プラグインの削除などで設定ファイルが変わった場合に使います。Macに入っているCodexで照合し、解除対象も変わっていれば停止します。</p>
        <button className="secondary" disabled={disabled} onClick={() => void operate('plan-retained')}>変更の範囲を確認</button>
        {retained && <div className="recovery-plan"><p>追加指示・選択したSkillの変更はありません。現在の保持設定を、Normalへ復帰するときにも残します。</p>
          <button className="primary" disabled={disabled} onClick={() => void operate('accept-retained', { planId: retained.planId })}>この保持設定を採用</button></div>}
      </section>}
      {state && <details className="control-section recovery-details"><summary>接続先と保存場所</summary>
        <dl><dt>Codex</dt><dd>{sourceHomeOf(state.metadata.context)}</dd><dt>プロジェクト</dt><dd>{state.metadata.context.project}</dd>
          <dt>保存場所</dt><dd>{state.metadata.workspace ?? '未保存'}</dd></dl></details>}
      <footer><span>UNHARNESS</span><span className="muted">このMacに保存された復旧画面</span></footer>
    </main>
  </div>;
}
