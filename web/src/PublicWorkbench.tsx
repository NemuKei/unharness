import { useCallback, useEffect, useRef, useState } from "react";
import { AppearancePanel } from './AppearancePanel';
import { usePublicAppearance } from './usePublicAppearance';
import { artworkResultText } from './connection-artwork';
import type { LayerAsset } from './appearance-layers';
import { Hangar } from "./Hangar";
import { ConnectionStatus, connectionLabel } from "./ConnectionStatus";
import { ConnectionError } from "./connection";
import type { PublicConnection, ConnectionSnapshot } from "./connection";
import type { SourceMode } from "./sources";
import type { PublicReceipt } from "./connection-results";
import { publicModes, PublicModeChoices, ConnectionInstructions } from "./entry/PublicEntry";
import { CopyRequest } from "./entry/CopyRequest";
import { WorkbenchNavigation, workbenchPageUrl } from './WorkbenchNavigation';
import type { WorkbenchPage } from './WorkbenchNavigation';
import { ModeActions, InstructionScopeNote } from './ModeActions';
import { modeBlocker } from './mode-blocker';
import { AiRequestButton, stateCheckPrompt } from './AiRequestButton';
import { bindChatScope, modeChatRequest, reviewSetupRequest } from './chat-requests';
import './workbench.css';

function failureText(error: unknown) {
  const kind = error instanceof ConnectionError ? error.kind : "unknown";
  if (kind === "remote-operation-unconfirmed") return "前の操作結果が未確認です。同じ操作IDの結果を確認してください。";
  if (kind === "remote-operation-in-progress") return "前の操作結果を待っています。";
  if (["source-conflict", "recovery-required"].includes(kind)) return "ローカルで変更の競合や復旧の案内を確認してください。";
  if (kind === "remote-plan-unavailable") return "この計画は現在の状態に使えません。状態と変更計画を確認し直してください。";
  return "接続または操作結果を確認できません。状態を再取得し、必要に応じてローカル画面で確認してください。";
}
function resultText(receipt: PublicReceipt | null) {
  if (receipt?.state === "running") return "処理中です。完了はまだ確認できていません。同じ操作IDで結果を確認してください。";
  if (!receipt || receipt.state === "unconfirmed") return "結果は未確認です。同じ操作IDで保存された結果を確認してください。";
  if (receipt.state === "not-found") return "記録が見つかりません。未実行とは断定せず、ローカル画面で状態を確認してください。";
  if (!receipt.result.ok) return "操作を完了できなかった記録があります。ローカルの準備状態と復旧の案内を確認してください。";
  return receipt.operation === "apply" ? `${publicModes[receipt.result.data.preparedMode].title}を準備し、ファイルの一致を確認した記録があります。`
    : "変更計画を作成した記録があります。設定の変更はまだです。";
}
export function PublicWorkbench({ client, view }: { client: PublicConnection; view: ConnectionSnapshot }) {
  const [selected, select] = useState<SourceMode>(view.state?.preparedMode ?? "normal"), [notice, setNotice] = useState("");
  const lookupField = useRef<HTMLInputElement>(null), lookupLock = useRef(false);
  const [checkingResult, setCheckingResult] = useState(false);
  const [effects,setEffects]=useState(true);
  const [activeTab, setActiveTab] = useState<WorkbenchPage>('mode');
  const current = publicModes[selected], plan = view.plan, last = view.lastOperation;
  const localUrl = client.getLocalWorkbenchUrl();
  const artwork = usePublicAppearance(client, view), lastArtwork = view.lastArtworkOperation;
  const selectedArtwork = artwork.enabled && artwork.confirmed ? artwork.view?.selectedItem ?? null : null;
  const imageLoader = useCallback((asset: LayerAsset, signal: AbortSignal) => {
    if (!selectedArtwork) return Promise.reject(new Error('appearance-image-unavailable'));
    return artwork.image(selectedArtwork.id, asset, signal, artwork.key);
  }, [artwork.image, artwork.key, selectedArtwork?.id]);
  const usable = view.phase === "connected" && !!view.state && !view.state.conflict && !view.state.recoveryPending && !view.busy
    && !view.artworkPending && (!last || last.receipt?.state === "completed");
  useEffect(() => { if (view.state) select(view.state.preparedMode); }, [view.state?.preparedMode, view.state?.revision]);
  useEffect(() => { if (plan) select(plan.result.data.mode); }, [plan?.requestId]);
  useEffect(() => {
    if (view.phase !== "connected") return;
    let stopped = false, reading = false;
    const poll = async () => {
      if (stopped || reading || document.visibilityState !== "visible" || client.getSnapshot().busy) return;
      reading = true;
      try { await client.refresh(); } catch {} finally { reading = false; }
    };
    const timer = window.setInterval(poll, 2500);
    document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [client, view.phase]);
  useEffect(() => {
    if (last?.receipt?.state === "completed" && last.receipt.operation === "apply" && last.receipt.result.ok
      && !view.busy && view.phase === "connected" && !view.state && last.connectionId === view.connection?.connectionId) void client.refresh().catch(() => {});
  }, [client, last?.requestId, last?.receipt?.state, view.busy, view.phase]);
  async function run(perform: () => Promise<unknown>) {
    setNotice("");
    try { await perform(); } catch (error) { setNotice(failureText(error)); }
  }
  async function lookup(requestId: string) {
    if (lookupLock.current) return;
    lookupLock.current = true; setCheckingResult(true);
    try { await run(() => client.operationStatus(requestId)); }
    finally { lookupLock.current = false; setCheckingResult(false); }
  }
  const nextTask = `Unharnessで直近に準備した構成を使い、新しいタスクを始めたいです。現在の保存状態と登録範囲をUnharnessのstatusで確認してください。古い会話に反映済みとは扱わず、新しいタスクの読み込みを別に確認してください。`;
  const hasWorkspace = view.phase === 'connected' || !!last || !!lastArtwork;
  const uncertainOperation = view.artworkPending || !!last && last.receipt?.state !== 'completed';
  const blocker = view.phase === 'unknown' && uncertainOperation && !view.busy
    ? { kind: 'operation' as const, message: '前の操作結果が未確認です。同じ操作の結果を確認してください。' }
    : modeBlocker({ busy: view.busy, connected: view.phase === 'connected', confirmed: !!view.state,
    registered: !!view.state, conflict: !!view.state?.conflict, recoveryPending: !!view.state?.recoveryPending,
    setupRequired: !!view.state?.setupRequired, operationUncertain: uncertainOperation }, selected);
  const unresolvedId = view.artworkPending ? lastArtwork?.requestId : last?.requestId;
  const displayedScope = view.state?.scopeId ?? view.connection?.target.scopeId;
  const resolveBlocker = blocker && (blocker.kind !== 'busy' || unresolvedId) ? <>
    {blocker.kind === 'busy' && unresolvedId ? <button className="secondary" disabled={checkingResult} onClick={() => void lookup(unresolvedId)}>同じ操作の結果を確認</button>
      : blocker.kind === 'refresh' ? <button className="secondary" onClick={() => void run(() => client.refresh())}>もう一度状態を確認</button>
      : blocker.kind === 'initial' || blocker.kind === 'settings' ? <button className="secondary" onClick={() => setActiveTab('settings')}>設定を見直す</button>
        : blocker.kind === 'operation' && unresolvedId ? <button className="secondary" disabled={checkingResult} onClick={() => void lookup(unresolvedId)}>同じ操作の結果を確認</button>
          : localUrl ? <a className="secondary local-workbench-link" href={workbenchPageUrl(localUrl, 'support')} target="_blank" rel="noopener noreferrer">{blocker.kind === 'recovery' ? 'このMacで復旧する' : 'このMacで差分を確認する'}</a>
            : <button className="secondary" onClick={() => setActiveTab('support')}>このMacへの接続を確認する</button>}
    {['changes', 'recovery', 'refresh', 'connect'].includes(blocker.kind) && <AiRequestButton label="状態の確認をAIに頼む"
      prompt={bindChatScope(stateCheckPrompt, displayedScope) + (uncertainOperation && unresolvedId ? '\n公開画面の未確認の操作ID: ' + unresolvedId + '。public_operation_statusでこのIDを確認してください。' : '')}/>}
  </> : null;
  return <main id="main" className="public-workbench">
    {hasWorkspace && <WorkbenchNavigation page={activeTab} select={setActiveTab}/>}
    <section className="public-connection-bar"><ConnectionStatus view={view}/>
      {view.connection && <span className="muted">期限 {new Date(view.connection.expiresAt).toLocaleTimeString("ja-JP")}</span>}
      {(view.phase === "connected" || view.phase === "unknown") && <button className="text-button" disabled={view.busy} onClick={() => void run(() => client.refresh())}>状態を再取得</button>}
    </section>
    {notice && <p className="public-notice" role="alert">{notice}</p>}
    {view.phase === "pairing" && <section className="public-panel pairing-start"><p className="eyebrow">ローカルの許可画面から接続</p><h1>このMacに接続する。</h1>
      <p>許可済みの一時リンクを使い、手元の登録済み設定へ接続します。ブラウザーの接続許可が表示された場合は内容を確認してください。</p>
      <button className="primary" disabled={view.busy} onClick={() => void run(() => client.connect())}>{view.busy ? "接続を確認しています…" : "このMacに接続"}</button>
      <p className="boundary">接続だけでは、モードや設定は変わりません。</p>
    </section>}
    {(["disconnected", "expired", "incompatible"].includes(view.phase) || view.phase === "unknown" && !view.state) && <section className="public-panel connection-help">
      <h1>{view.phase === "disconnected" ? "手元のAI設定へ、接続する。" : connectionLabel(view)}</h1>
      {view.phase === "incompatible" ? <p>公開画面とローカル版の接続方式が一致しません。ローカル版を確認し、対応する版へ更新してから接続してください。</p>
        : view.phase === "expired" ? <p>短期接続の期限が切れたか、一時リンクを利用できません。新しい接続許可をローカルで確認してください。</p>
          : view.phase === "unknown" ? <p>現在の接続状態を確認できません。期限やブラウザーの接続許可を確認してください。前の操作の成否は下の記録で確認します。</p> : null}
      <ConnectionInstructions/>
    </section>}
    {hasWorkspace && <>
      <div className="public-two-column public-mode-layout" hidden={activeTab !== 'mode'}>
        <section className="public-mode-stage"><p className="eyebrow">モード ／ 選択プレビュー</p><h1>{current.title}</h1><p className="scene-subtitle">{current.label}</p>
          <label className="original-example-effects"><input type="checkbox" checked={effects} onChange={event => setEffects(event.target.checked)}/>アニメーション</label>
          {activeTab === 'mode' && <Hangar condition={current.scene} effects={effects} artwork={selectedArtwork} imageLoader={imageLoader}/>}
          <p className="scene-caption">選択したモードの姿です。確定するまで設定は変わりません。</p>
        </section>
        <aside className="preparation-panel"><section className="mode-current"><p className="eyebrow">このMacの設定</p><h2>現在の準備</h2>
          <p className="prepared-mode">{view.state ? publicModes[view.state.preparedMode].title : '未確認'}</p>
          {view.state?.modeChangeRequired && <p className="muted">登録が更新されています。構成を確認してから準備してください。</p>}
          {(view.state?.conflict || view.state?.recoveryPending) && <p className="muted">前回確認した構成です。現在の状態を確認してください。</p>}
        </section>
          <InstructionScopeNote compact/>
          <PublicModeChoices mode={selected} choose={select}/>
          <ModeActions title={current.title} blocker={blocker} planReady={plan?.result.data.mode === selected}
            review={() => void run(() => client.plan(selected))} confirm={() => { if (usable && plan) void run(() => client.apply(plan.requestId)); }} resolve={resolveBlocker}
            statusMessage={activeTab === 'mode' && last ? view.busy && !last.receipt ? '操作結果を待っています…' : resultText(last.receipt) : undefined}>
            {plan?.result.data.mode === selected && <div className="public-plan" aria-label="確認する変更計画">
              <p>変更するファイル：{plan.result.data.changedFileCount}件</p><p className="muted">登録・保存したこのモードの構成を使います。対象の追加は行いません。</p>
            </div>}
          </ModeActions>
          {!blocker && <details className="chat-mode-entry"><summary>チャットでこのモードを頼む</summary><AiRequestButton label="切替の依頼文をコピー" prompt={bindChatScope(modeChatRequest(selected), displayedScope)}/></details>}
          <details className="public-next-task"><summary>この設定で新しいタスクを始める</summary><CopyRequest text={nextTask} label="新しいタスクへの依頼文"/></details>
          <button className="text-button" onClick={() => setActiveTab('settings')}>各モードの指示・Skillを見直す</button>
        </aside>
      </div>
      <section className="workbench-pane" hidden={activeTab !== 'settings'} aria-label="設定の見直し">
        <h1>各モードの構成を見直す</h1>
        <p>いつものNormalを残して、零式と限定解除に残す指示・Skillを相談します。保存した構成を使うときは「モード」から切り替えます。</p>
        {view.state?.setupRequired && <p role="status">この登録の2構成は確認・保存待ちです。以前の保存版はそのまま残っています。</p>}
        <AiRequestButton primary label={!view.state || view.state.conflict || view.state.recoveryPending ? '状態の確認をAIに頼む' : '設定をAIと見直す'}
          prompt={bindChatScope(!view.state || view.state.conflict || view.state.recoveryPending ? stateCheckPrompt : reviewSetupRequest, displayedScope)} fieldLabel="設定相談の依頼文"/>
        {localUrl && <details><summary>このMacで構成や対象を確認する</summary><p className="muted">手元のファイルの確認画面を開きます。完了後はこの画面に戻れます。</p>
          <a className="local-workbench-link" href={workbenchPageUrl(localUrl, 'settings')} target="_blank" rel="noopener noreferrer">このMacで設定を確認する</a></details>}
        <InstructionScopeNote/>
      </section>
      <section className="workbench-pane appearance-workbench" hidden={activeTab !== 'appearance'} aria-label="外観の変更">
        <h1>外観</h1><p>好きな姿で使えます。指示・Skillの構成や性能の評価は変わりません。</p>
        <div className="appearance-workbench-layout">{activeTab === 'appearance' && <Hangar condition={current.scene} effects={effects} artwork={selectedArtwork} imageLoader={imageLoader}/>}<AppearancePanel controller={artwork}/></div>
      {lastArtwork && <section className="public-operation" aria-label="最後の作品操作結果"><h3>最後の作品操作結果</h3>
        <p role="status">{artworkResultText(lastArtwork.receipt)}</p>
        <label>作品の操作ID<input aria-label="作品の操作ID" value={lastArtwork.requestId} readOnly/></label>
        <button className="secondary" disabled={checkingResult || !['connected','unknown'].includes(view.phase)} onClick={() => void lookup(lastArtwork.requestId)}>作品操作の保存された結果を確認</button>
        <details><summary>ローカルで作品操作を確認する</summary><CopyRequest key={lastArtwork.requestId} label="作品操作の結果確認"
          text={`Unharnessのpublic_operation_statusで ${lastArtwork.requestId} の作品操作結果を確認してください。同じ操作を新しいIDで自動再実行せず、現在のコレクションと作品保存の復旧を確認してください。装備の設定は変更しないでください。`}/></details>
      </section>}
      </section>
      <section className="workbench-pane" hidden={activeTab !== 'history'} aria-label="比較と記録"><h1>比較・記録</h1>
        <p>比較した仕事や保存した構成の履歴は、このMacに残っています。</p>
        {localUrl ? <a className="secondary local-workbench-link" href={workbenchPageUrl(localUrl, 'history')} target="_blank" rel="noopener noreferrer">このMacで比較・記録を開く</a> : <ConnectionInstructions/>}
      </section>
      <section className="workbench-pane" hidden={activeTab !== 'support'} aria-label="このMacの接続と復旧"><h1>接続・復旧</h1>
        <p>接続許可や手元のファイルの確認を行います。完了したら「モード」に戻って操作できます。</p>
        {localUrl ? <a className="secondary local-workbench-link" href={workbenchPageUrl(localUrl, 'support')} target="_blank" rel="noopener noreferrer">このMacで接続・復旧を確認する</a> : <ConnectionInstructions/>}
      {last && <section className="public-operation" aria-label="最後の操作結果"><h3>最後の操作結果</h3>
        <label>操作ID<input aria-label="操作ID" value={last.requestId} readOnly ref={lookupField}/></label>
        <button className="secondary" disabled={checkingResult || !["connected", "unknown"].includes(view.phase)} onClick={() => void lookup(last.requestId)}>同じ操作の結果を確認</button>
        <details><summary>ローカルのAIから結果を確認する</summary><CopyRequest key={last.requestId} label="操作結果を確認する依頼文"
          text={`Unharnessの公開画面で行った操作 ${last.requestId} の結果を、ローカルMCPのpublic_operation_statusで確認してください。結果が不明でも新しい操作IDで再実行せず、ローカルの準備状態と復旧の必要を確認してください。`}/></details>
      </section>}
      </section>
      {last && activeTab === 'support' && <p className="public-operation-notice" role="status">{view.busy && !last.receipt ? '操作結果を待っています…' : resultText(last.receipt)}</p>}
    </>}
  </main>;
}
