import { useEffect, useRef, useState } from "react";
import { Hangar } from "./Hangar";
import { ConnectionStatus, connectionLabel } from "./ConnectionStatus";
import { ConnectionError } from "./connection";
import type { PublicConnection, ConnectionSnapshot } from "./connection";
import type { SourceMode } from "./sources";
import type { PublicReceipt } from "./connection-results";
import { publicModes, PublicModeChoices, ConnectionInstructions } from "./entry/PublicEntry";
import { CopyRequest } from "./entry/CopyRequest";

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
  const current = publicModes[selected], plan = view.plan, last = view.lastOperation;
  const localUrl = client.getLocalWorkbenchUrl();
  const usable = view.phase === "connected" && !!view.state && !view.state.conflict && !view.state.recoveryPending && !view.busy
    && (!last || last.receipt?.state === "completed");
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
  return <main id="main" className="public-workbench">
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
    {(view.phase === "connected" || !!last) && <div className="public-two-column"><section className="public-mode-stage">
      <p className="eyebrow">モード <span>／ 選択プレビュー</span></p><h1>{current.title}</h1><p className="scene-subtitle">{current.label}</p>
      <p className="entry-lead">保存したこのモードの構成で、次のタスクを準備する。</p>
      <PublicModeChoices mode={selected} choose={select}/><Hangar condition={current.scene} effects={false}/>
      <p className="scene-caption">標準外観の選択プレビューです。実行中のタスクの状態は表していません。</p>
    </section><aside className="public-panel preparation-panel"><p className="eyebrow">登録済みの追加設定</p><h2>現在の準備</h2>
      <p className="prepared-mode">{view.state ? publicModes[view.state.preparedMode].title : "未確認"}</p>
      {view.state && <p className="muted">保存版 {view.state.revision}{view.state.modeChangeRequired ? " ／ 追加した対象の準備が必要です" : ""}</p>}
      <p className="boundary">設定ファイルの準備と、タスクへの読み込みは別です。使用時は新しいタスクを作成してください。</p>
      {(view.state?.conflict || view.state?.recoveryPending) && <p role="alert">変更の競合または中断を検出しました。ローカル画面で確認・復旧してください。</p>}
      {view.state?.setupRequired && <p role="status">零式と限定解除の構成を、ローカルでAIと相談して保存してください。</p>}
      <button className="secondary" disabled={!usable || !!view.state?.setupRequired && selected !== "normal"} onClick={() => void run(() => client.plan(selected))}>変更計画を確認</button>
      {plan?.result.data.mode === selected && <div className="public-plan" aria-label="確認する変更計画"><h3>{current.title}の変更計画</h3>
        <p>変更するファイル：{plan.result.data.changedFileCount}件</p><p className="boundary">ローカルで登録・保存した構成を使います。対象の追加や権限変更は含みません。</p>
        <button className="primary" disabled={!usable} onClick={() => void run(() => client.apply(plan.requestId))}>この計画で準備する</button>
      </div>}
      {last && <section className="public-operation" aria-label="最後の操作結果"><h3>最後の操作結果</h3>
        <p role="status">{view.busy && !last.receipt ? "操作結果を待っています…" : resultText(last.receipt)}</p>
        <label>操作ID<input aria-label="操作ID" value={last.requestId} readOnly ref={lookupField}/></label>
        <button className="secondary" disabled={checkingResult || !["connected", "unknown"].includes(view.phase)} onClick={() => void lookup(last.requestId)}>同じ操作の結果を確認</button>
        <details><summary>ローカルのAIから結果を確認する</summary><CopyRequest key={last.requestId} label="操作結果を確認する依頼文"
          text={`Unharnessの公開画面で行った操作 ${last.requestId} の結果を、ローカルMCPのpublic_operation_statusで確認してください。結果が不明でも新しい操作IDで再実行せず、ローカルの準備状態と復旧の必要を確認してください。`}/></details>
      </section>}
      <details className="public-next-task"><summary>この設定で新しいタスクを始める</summary><CopyRequest text={nextTask} label="新しいタスクへの依頼文"/></details>
      <details><summary>設定をAIに相談する</summary><CopyRequest label="設定相談の依頼文" text="Unharnessの現在の接続先と登録範囲を確認し、保存済みのNormalを保持して、零式と限定解除の2つの構成を相談したいです。同梱のUnharness Setup Skillに従い、公式プラグインの確認と継承規則を守ってください。構成の保存とモードの準備は分けてください。"/></details>
      {localUrl && <a className="local-workbench-link" href={localUrl} target="_blank" rel="noopener noreferrer">保存・比較・復旧のローカル画面を開く</a>}
    </aside></div>}
  </main>;
}
