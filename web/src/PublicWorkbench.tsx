import { getLocale, text as t } from './locale.ts';
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
  if (kind === "remote-operation-unconfirmed") return t("前の操作結果が未確認です。同じ操作IDの結果を確認してください。", "The previous operation is unconfirmed. Check its original operation ID.");
  if (kind === "remote-operation-in-progress") return t("前の操作結果を待っています。", "Waiting for the previous operation.");
  if (["source-conflict", "recovery-required"].includes(kind)) return t("ローカルで変更の競合や復旧の案内を確認してください。", "Review conflicting changes or recovery in the local workbench.");
  if (kind === "remote-plan-unavailable") return t("この計画は現在の状態に使えません。状態と変更計画を確認し直してください。", "This plan no longer matches the current state. Read the state and review a new plan.");
  return t("接続または操作結果を確認できません。状態を再取得し、必要に応じてローカル画面で確認してください。", "The connection or result is unconfirmed. Refresh the state and check the local workbench if needed.");
}
function resultText(receipt: PublicReceipt | null) {
  if (receipt?.state === "running") return t("処理中です。完了はまだ確認できていません。同じ操作IDで結果を確認してください。", "Still running. Completion is unconfirmed; check the same operation ID.");
  if (!receipt || receipt.state === "unconfirmed") return t("結果は未確認です。同じ操作IDで保存された結果を確認してください。", "Result unconfirmed. Look up the saved result with the same operation ID.");
  if (receipt.state === "not-found") return t("記録が見つかりません。未実行とは断定せず、ローカル画面で状態を確認してください。", "No record was found. This does not prove nothing ran; check the local state.");
  if (!receipt.result.ok) return t("操作を完了できなかった記録があります。ローカルの準備状態と復旧の案内を確認してください。", "The operation record reports a failure. Check local preparation and recovery guidance.");
  return receipt.operation === "apply" ? t(`${publicModes[receipt.result.data.preparedMode].title}を準備し、ファイルの一致を確認した記録があります。`, `The record confirms ${publicModes[receipt.result.data.preparedMode].title} was prepared and its files matched.`)
    : t("変更計画を作成した記録があります。設定の変更はまだです。", "The change plan was recorded. Settings have not changed yet.");
}
export function PublicWorkbench({ client, view }: { client: PublicConnection; view: ConnectionSnapshot }) {
  const [selected, select] = useState<SourceMode>(view.state?.preparedMode ?? "normal"), [lastError, setLastError] = useState<unknown>(null);
  const notice = lastError ? failureText(lastError) : "";
  const lookupField = useRef<HTMLInputElement>(null), lookupLock = useRef(false);
  const [checkingResult, setCheckingResult] = useState(false);
  const [effects,setEffects]=useState(true);
  const [activeTab, setActiveTab] = useState<WorkbenchPage>('mode');
  const current = publicModes[selected], plan = view.plan, last = view.lastOperation;
  const localUrl = client.getLocalWorkbenchUrl(), localLanguage = client.supportsLocalLanguage();
  const retainedModePlanning = client.supportsRetainedModePlanning();
  const artwork = usePublicAppearance(client, view), lastArtwork = view.lastArtworkOperation;
  const selectedArtwork = artwork.enabled && artwork.confirmed ? artwork.view?.selectedItem ?? null : null;
  const imageLoader = useCallback((asset: LayerAsset, signal: AbortSignal) => {
    if (!selectedArtwork) return Promise.reject(new Error('appearance-image-unavailable'));
    return artwork.image(selectedArtwork.id, asset, signal, artwork.key);
  }, [artwork.image, artwork.key, selectedArtwork?.id]);
  const usable = view.phase === "connected" && !!view.state && (!view.state.conflict || retainedModePlanning) && !view.state.recoveryPending && !view.busy
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
    setLastError(null);
    try { await perform(); } catch (error) { setLastError(error); }
  }
  async function lookup(requestId: string) {
    if (lookupLock.current) return;
    lookupLock.current = true; setCheckingResult(true);
    try { await run(() => client.operationStatus(requestId)); }
    finally { lookupLock.current = false; setCheckingResult(false); }
  }
  const nextTask = t('Unharnessで直近に準備した構成を使い、新しいタスクを始めたいです。現在の保存状態と登録範囲をUnharnessのstatusで確認してください。古い会話に反映済みとは扱わず、新しいタスクの読み込みを別に確認してください。', 'Help me start a fresh task using the latest prepared Unharness loadout. Check the saved state and registered scope with status. Do not claim the current conversation has reloaded; verify fresh-task loading separately. Please guide me in English.');
  const hasWorkspace = view.phase === 'connected' || !!last || !!lastArtwork;
  const uncertainOperation = view.artworkPending || !!last && last.receipt?.state !== 'completed';
  const blocker = view.phase === 'unknown' && uncertainOperation && !view.busy
    ? { kind: 'operation' as const, message: t("前の操作結果が未確認です。同じ操作の結果を確認してください。", "The previous operation is unconfirmed. Check that same operation's result.") }
    : modeBlocker({ busy: view.busy, connected: view.phase === 'connected', confirmed: !!view.state,
    registered: !!view.state, conflict: !!view.state?.conflict, recoveryPending: !!view.state?.recoveryPending,
    modePlanningAvailable: retainedModePlanning,
    setupRequired: !!view.state?.setupRequired, operationUncertain: uncertainOperation }, selected);
  const unresolvedId = view.artworkPending ? lastArtwork?.requestId : last?.requestId;
  const displayedScope = view.state?.scopeId ?? view.connection?.target.scopeId;
  const resolveBlocker = blocker && (blocker.kind !== 'busy' || unresolvedId) ? <>
    {blocker.kind === 'busy' && unresolvedId ? <button className="secondary" disabled={checkingResult} onClick={() => void lookup(unresolvedId)}>{t("同じ操作の結果を確認", "Check this operation's result")}</button>
      : blocker.kind === 'refresh' ? <button className="secondary" onClick={() => void run(() => client.refresh())}>{t("もう一度状態を確認", "Read the state again")}</button>
      : blocker.kind === 'initial' || blocker.kind === 'settings' ? <button className="secondary" onClick={() => setActiveTab('settings')}>{t("設定を見直す", "Review settings")}</button>
        : blocker.kind === 'operation' && unresolvedId ? <button className="secondary" disabled={checkingResult} onClick={() => void lookup(unresolvedId)}>{t("同じ操作の結果を確認", "Check this operation's result")}</button>
          : localUrl ? <a className="secondary local-workbench-link" href={workbenchPageUrl(localUrl, 'support', localLanguage)} target="_blank" rel="noopener noreferrer">{blocker.kind === 'recovery' ? t("このMacで復旧する", "Recover on this Mac") : t("このMacで差分を確認する", "Review local differences")}</a>
            : <button className="secondary" onClick={() => setActiveTab('support')}>{t("このMacへの接続を確認する", "Check the connection to this Mac")}</button>}
    {['changes', 'recovery', 'refresh', 'connect'].includes(blocker.kind) && <AiRequestButton label={t("状態の確認をAIに頼む", "Ask AI to check the state")}
      prompt={bindChatScope(stateCheckPrompt(), displayedScope) + (uncertainOperation && unresolvedId ? t('\n公開画面の未確認の操作ID: ' + unresolvedId + '。public_operation_statusでこのIDを確認してください。', '\nUnconfirmed public operation ID: ' + unresolvedId + '. Check this ID using public_operation_status.') : '')}/>}
  </> : null;
  return <main id="main" className="public-workbench">
    {hasWorkspace && <WorkbenchNavigation page={activeTab} select={setActiveTab}/>}
    <section className="public-connection-bar"><ConnectionStatus view={view}/>
      {view.connection && <span className="muted">{t("期限 ", "Expires ")} {new Date(view.connection.expiresAt).toLocaleTimeString(getLocale() === "ja" ? "ja-JP" : "en-US")}</span>}
      {(view.phase === "connected" || client.canRefreshConnection()) && <button className="text-button" disabled={view.busy} onClick={() => void run(() => client.refresh())}>{t("状態を再取得", "Refresh state")}</button>}
    </section>
    {notice && <p className="public-notice" role="alert">{notice}</p>}
    {view.phase === "pairing" && <section className="public-panel pairing-start"><p className="eyebrow">{t("ローカルの許可画面から接続", "CONNECT FROM LOCAL APPROVAL")}</p><h1>{t("このMacに接続する。", "Connect to this Mac.")}</h1>
      <p>{t("許可済みの一時リンクを使い、手元の登録済み設定へ接続します。ブラウザーの接続許可が表示された場合は内容を確認してください。", "Connect to your registered local settings with the approved temporary link. Review any browser connection-permission prompt.")}</p>
      <button className="primary" disabled={view.busy} onClick={() => void run(() => client.connect())}>{view.busy ? t("接続を確認しています…", "Checking the connection…") : t("このMacに接続", "Connect to this Mac")}</button>
      <p className="boundary">{t("接続だけでは、モードや設定は変わりません。", "Connecting alone does not change modes or settings.")}</p>
    </section>}
    {(["disconnected", "expired", "incompatible"].includes(view.phase) || view.phase === "unknown" && !view.state) && <section className="public-panel connection-help">
      <h1>{view.phase === "disconnected" ? t("以前の公開接続は終了しています。", "The earlier public connection has ended.") : connectionLabel(view)}</h1>
      {view.phase === "incompatible" ? <p>{t("以前の公開接続とローカル版の方式が一致しません。新しい公開接続は作らず、ローカル画面で版と現在の状態を確認してください。", "The earlier public connection is incompatible with the local version. Do not create a new public connection; check the version and current state in the local workbench.")}</p>
        : view.phase === "expired" ? <p>{t("以前の短期接続は期限切れです。新しい公開接続は作らず、元の操作IDと現在の状態をローカルで確認してください。", "The earlier short-lived connection expired. Do not create a new public connection; check the original operation ID and current state locally.")}</p>
          : view.phase === "unknown" ? <p>{client.canRefreshConnection() ? t("一時的に状態を確認できません。同じ接続で状態を再取得できます。新しい接続や書き込みは開始しません。", "State is temporarily unavailable. You can refresh it through the same connection; no new connection or write is started.") : t("このリンクの接続状態は確認できません。新しい公開接続は作らず、ローカル画面で確認してください。", "This link cannot establish a known connection state. Do not create a new public connection; continue in the local workbench.")}</p> : null}
      <ConnectionInstructions/>
    </section>}
    {hasWorkspace && <>
      <div className="public-two-column public-mode-layout" hidden={activeTab !== 'mode'}>
        <section className="public-mode-stage"><p className="eyebrow">{t("モード ／ 選択プレビュー", "MODE / PREVIEW")}</p><h1>{current.title}</h1><p className="scene-subtitle">{current.label}</p>
          <label className="original-example-effects"><input type="checkbox" checked={effects} onChange={event => setEffects(event.target.checked)}/>{t("アニメーション", "Animation")}</label>
          {activeTab === 'mode' && <Hangar condition={current.scene} effects={effects} artwork={selectedArtwork} imageLoader={imageLoader} locale={getLocale()}/>}
          <p className="scene-caption">{t("選択したモードの姿です。確定するまで設定は変わりません。", "Preview of the selected mode. Settings stay unchanged until you apply it.")}</p>
        </section>
        <aside className="preparation-panel"><section className="mode-current"><p className="eyebrow">{t("このMacの設定", "SETTINGS ON THIS MAC")}</p><h2>{view.state?.conflict ? t("最後に準備したモード", "Last prepared mode") : t("現在の準備", "Currently prepared")}</h2>
          <p className="prepared-mode">{view.state ? publicModes[view.state.preparedMode].title : t("未確認", "Unknown")}</p>
          {view.state?.modeChangeRequired && <p className="muted">{t("登録が更新されています。構成を確認してから準備してください。", "Registration changed. Review the loadout before preparing it.")}</p>}
          {((view.state?.conflict && !retainedModePlanning) || view.state?.recoveryPending) && <p className="muted">{t("前回確認した構成です。現在の状態を確認してください。", "This is the last confirmed loadout. Check the current state.")}</p>}
        </section>
          <InstructionScopeNote compact/>
          <PublicModeChoices mode={selected} choose={select}/>
          <ModeActions title={current.title} blocker={blocker} planReady={plan?.result.data.mode === selected}
            review={() => void run(() => client.plan(selected))} confirm={() => { if (usable && plan) void run(() => client.apply(plan.requestId)); }} resolve={resolveBlocker}
            statusMessage={activeTab === 'mode' && last ? view.busy && !last.receipt ? t("操作結果を待っています…", "Waiting for the operation result…") : resultText(last.receipt) : undefined}>
            {plan?.result.data.mode === selected && <div className="public-plan" aria-label={t("確認する変更計画", "Change plan to review")}>
              <p>{t("保存したこのモードの構成を使います。", "Uses your saved loadout for this mode.")}</p>
              <p className="muted">{t("モード以外の設定は、そのまま引き継ぎます。", "Settings outside the mode stay as they are.")}</p>
              <details><summary>{t("変更する項目を確認", "Review changed items")}</summary><p>{t(`変更するファイル：${plan.result.data.changedFileCount}件`, `Files to change: ${plan.result.data.changedFileCount}`)}</p></details>
            </div>}
          </ModeActions>
          {!blocker && <details className="chat-mode-entry"><summary>{t("チャットでこのモードを頼む", "Ask for this mode in chat")}</summary><AiRequestButton label={t("切替の依頼文をコピー", "Copy mode request")} prompt={bindChatScope(modeChatRequest(selected), displayedScope)}/></details>}
          <details className="public-next-task"><summary>{t("この設定で新しいタスクを始める", "Start a fresh task with this setup")}</summary><CopyRequest text={nextTask} label={t("新しいタスクへの依頼文", "Request for a fresh task")}/></details>
          <button className="text-button" onClick={() => setActiveTab('settings')}>{t("各モードの指示・Skillを見直す", "Review each mode's instructions and Skills")}</button>
        </aside>
      </div>
      <section className="workbench-pane" hidden={activeTab !== 'settings'} aria-label={t("設定の見直し", "Review settings")}>
        <h1>{t("各モードの構成を見直す", "Review your loadouts")}</h1>
        <p>{t("いつものNormalを残して、零式と限定解除に残す指示・Skillを相談します。保存した構成を使うときは「モード」から切り替えます。", "Preserve your everyday Normal while discussing the instructions and Skills for TRUEFORM and UNSEAL. Use Mode to prepare a saved loadout.")}</p>
        {view.state?.setupRequired && <p role="status">{t("この登録の2構成は確認・保存待ちです。以前の保存版はそのまま残っています。", "Both loadouts for this registration await review and saving. Earlier saved versions are retained.")}</p>}
        <AiRequestButton primary label={!view.state || view.state.conflict || view.state.recoveryPending ? t("状態の確認をAIに頼む", "Ask AI to check the state") : t("設定をAIと見直す", "Review settings with AI")}
          prompt={bindChatScope(!view.state || view.state.conflict || view.state.recoveryPending ? stateCheckPrompt() : reviewSetupRequest(), displayedScope)} fieldLabel={t("設定相談の依頼文", "Settings review request")}/>
        {localUrl && <details><summary>{t("このMacで構成や対象を確認する", "Review local loadouts and targets")}</summary><p className="muted">{t("手元のファイルの確認画面を開きます。完了後はこの画面に戻れます。", "Open the local file review. Return here when you finish.")}</p>
          <a className="local-workbench-link" href={workbenchPageUrl(localUrl, 'settings', localLanguage)} target="_blank" rel="noopener noreferrer">{t("このMacで設定を確認する", "Review settings on this Mac")}</a></details>}
        <InstructionScopeNote/>
      </section>
      <section className="workbench-pane appearance-workbench" hidden={activeTab !== 'appearance'} aria-label={t("外観の変更", "Change appearance")}>
        <h1>{t("外観", "Appearance")}</h1><p>{t("好きな姿で使えます。指示・Skillの構成や性能の評価は変わりません。", "Use any appearance you like. It does not change instructions, Skills or performance assessments.")}</p>
        <div className="appearance-workbench-layout">{activeTab === 'appearance' && <Hangar condition={current.scene} effects={effects} artwork={selectedArtwork} imageLoader={imageLoader} locale={getLocale()}/>}<AppearancePanel controller={artwork}/></div>
      {lastArtwork && <section className="public-operation" aria-label={t("最後の作品操作結果", "Latest appearance operation")}><h3>{t("最後の作品操作結果", "Latest appearance operation")}</h3>
        <p role="status">{artworkResultText(lastArtwork.receipt)}</p>
        <label>{t("作品の操作ID", "Appearance operation ID")}<input aria-label={t("作品の操作ID", "Appearance operation ID")} value={lastArtwork.requestId} readOnly/></label>
        <button className="secondary" disabled={checkingResult || !['connected','unknown'].includes(view.phase)} onClick={() => void lookup(lastArtwork.requestId)}>{t("作品操作の保存された結果を確認", "Check the saved appearance result")}</button>
        <details><summary>{t("ローカルで作品操作を確認する", "Check the appearance operation locally")}</summary><CopyRequest key={lastArtwork.requestId} label={t("作品操作の結果確認", "Appearance result request")}
          text={t(`Unharnessのpublic_operation_statusで ${lastArtwork.requestId} の作品操作結果を確認してください。同じ操作を新しいIDで自動再実行せず、現在のコレクションと作品保存の復旧を確認してください。装備の設定は変更しないでください。`, `Check appearance operation ${lastArtwork.requestId} using Unharness public_operation_status. Do not automatically retry with a new ID. Check the current collection and appearance recovery, without changing loadout settings. Please guide me in English.`)}/></details>
      </section>}
      </section>
      <section className="workbench-pane" hidden={activeTab !== 'history'} aria-label={t("比較と記録", "Comparisons and records")}><h1>{t("比較・記録", "Comparisons & records")}</h1>
        <p>{t("比較した仕事や保存した構成の履歴は、このMacに残っています。", "Your compared work and saved loadout history remain on this Mac.")}</p>
        {localUrl ? <a className="secondary local-workbench-link" href={workbenchPageUrl(localUrl, 'history', localLanguage)} target="_blank" rel="noopener noreferrer">{t("このMacで比較・記録を開く", "Open comparisons and records on this Mac")}</a> : <ConnectionInstructions/>}
      </section>
      <section className="workbench-pane" hidden={activeTab !== 'support'} aria-label={t("このMacの接続と復旧", "Connection and recovery on this Mac")}><h1>{t("接続・復旧", "Connection & recovery")}</h1>
        <p>{t("接続許可や手元のファイルの確認を行います。完了したら「モード」に戻って操作できます。", "Review connection permissions and local files. Return to Mode when finished.")}</p>
        {localUrl ? <a className="secondary local-workbench-link" href={workbenchPageUrl(localUrl, 'support', localLanguage)} target="_blank" rel="noopener noreferrer">{t("このMacで接続・復旧を確認する", "Review connection and recovery on this Mac")}</a> : <ConnectionInstructions/>}
      {last && <section className="public-operation" aria-label={t("最後の操作結果", "Latest operation result")}><h3>{t("最後の操作結果", "Latest operation result")}</h3>
        <label>{t("操作ID", "Operation ID")}<input aria-label={t("操作ID", "Operation ID")} value={last.requestId} readOnly ref={lookupField}/></label>
        <button className="secondary" disabled={checkingResult || !["connected", "unknown"].includes(view.phase)} onClick={() => void lookup(last.requestId)}>{t("同じ操作の結果を確認", "Check this operation's result")}</button>
        <details><summary>{t("ローカルのAIから結果を確認する", "Check the result with your local AI")}</summary><CopyRequest key={last.requestId} label={t("操作結果を確認する依頼文", "Operation result request")}
          text={t(`Unharnessの公開画面で行った操作 ${last.requestId} の結果を、ローカルMCPのpublic_operation_statusで確認してください。結果が不明でも新しい操作IDで再実行せず、ローカルの準備状態と復旧の必要を確認してください。`, `Check public-page operation ${last.requestId} through the local MCP public_operation_status. Do not retry with a new ID if its outcome is unknown. Check local preparation and recovery needs. Please guide me in English.`)}/></details>
      </section>}
      </section>
      {last && activeTab === 'support' && <p className="public-operation-notice" role="status">{view.busy && !last.receipt ? t("操作結果を待っています…", "Waiting for the operation result…") : resultText(last.receipt)}</p>}
    </>}
  </main>;
}
