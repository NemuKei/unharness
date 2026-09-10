import { useEffect, useRef, useState } from "react";
import type { SourceView } from "./sources";
import { PUBLIC_WEB_ORIGIN, connectionRecord, isConnectionId } from "./connection-contract";
import { pairingFromHash, readLocalPairing, publicPairingUrl } from "./local-connection";
import type { LocalConnectionAction, LocalConnectionRequest, LocalPairing } from "./local-connection";
import { PublicOperationLookup } from "./PublicOperationLookup";

type Pending = { action: LocalConnectionAction; input: { requestId: string; pairingId?: string } };
export function LocalConnectionPanel({ view, enabled, request }: {
  view: SourceView; enabled: boolean; request: LocalConnectionRequest;
}) {
  const [open, setOpen] = useState(false), [pairingId, setPairingId] = useState<string | null>(null);
  const [pairing, setPairing] = useState<LocalPairing | null>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [pending, setPending] = useState<Pending | null>(null);
  const [copyNotice, setCopyNotice] = useState(""), [now, setNow] = useState(Date.now);
  const linkField = useRef<HTMLTextAreaElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const latestView = useRef(view), locked = useRef(false), epoch = useRef(0), alive = useRef(true);
  const pendingRef = useRef(pending);
  latestView.current = view; pendingRef.current = pending;
  // This ID cannot authorize the public site. Tickets and connection tokens are
  // never persisted; the local API revalidates the saved ID after a reload.
  const storageKey = `unharness.local-pairing.${view.metadata.launchId}.${view.metadata.contextId}.${view.source?.registration.scopeId}`;
  function remember(id: string) {
    setPairingId(id);
    try { sessionStorage.setItem(storageKey, id); } catch {}
  }
  useEffect(() => {
    alive.current = true;
    function handoff(restore = false) {
      const incoming = pairingFromHash(location.hash);
      let saved: string | null = null;
      try { saved = sessionStorage.getItem(storageKey); } catch {}
      const id = incoming ?? (restore && isConnectionId(saved) ? saved : null);
      if (!id) return;
      if (incoming) history.replaceState(history.state, "", location.pathname + location.search);
      ++epoch.current; locked.current = false; setBusy(false); setPending(null); setPairing(null); setError("");
      remember(id); setOpen(true);
    }
    const changed = () => handoff();
    handoff(true); window.addEventListener("hashchange", changed);
    return () => { alive.current = false; ++epoch.current; window.removeEventListener("hashchange", changed); };
  }, [storageKey]);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open || !pairingId) return;
    const selectedId = pairingId;
    let stopped = false, polling = false;
    async function poll() {
      if (stopped || polling || locked.current || document.visibilityState !== "visible") return;
      polling = true;
      const before = epoch.current;
      try {
        const result = await request("details", { pairingId: selectedId });
        if (stopped || before !== epoch.current || locked.current) return;
        const details = readLocalPairing(result, latestView.current, selectedId);
        setPairing(details); setNow(Date.now()); setError("");
        const write = pendingRef.current;
        if (write?.input.pairingId === pairingId && ((write.action === "approve" && ["approved", "connected"].includes(details.status))
          || (write.action === "cancel" && details.status === "unavailable"))) setPending(null);
      } catch {
        if (!stopped && before === epoch.current && !locked.current) { setPairing(null); setError("接続状態を確認できません。接続用リンクと許可操作を停止しています。"); }
      } finally { polling = false; }
    }
    void poll();
    const timer = window.setInterval(() => { setNow(Date.now()); void poll(); }, 1500);
    document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [open, pairingId, request]);

  async function write(action: LocalConnectionAction, retry?: Pending) {
    if (locked.current) return;
    const operation = retry ?? { action, input: { requestId: crypto.randomUUID(), ...(action === "issue" ? {} : { pairingId: pairingId! }) } };
    const before = ++epoch.current;
    locked.current = true; setBusy(true); setPending(operation); setError(""); setCopyNotice("");
    if (action === "issue") setPairing(null);
    try {
      const result = connectionRecord(await request(operation.action, operation.input));
      if (!alive.current || before !== epoch.current) return;
      const id = operation.action === "issue" ? result.pairingId : operation.input.pairingId;
      if (!isConnectionId(id)) throw Error("invalid-connection-response");
      remember(id);
      const details = readLocalPairing(await request("details", { pairingId: id }), latestView.current, id);
      if (!alive.current || before !== epoch.current) return;
      setPairing(details); setNow(Date.now()); setPending(null);
    } catch {
      if (alive.current && before === epoch.current) { setPairing(null); setError("操作の結果を確認できません。同じ操作IDで結果を確認できます。"); }
    } finally {
      if (alive.current && before === epoch.current) { locked.current = false; setBusy(false); }
    }
  }
  const expiresAt = pairing && (pairing.status === "connected" ? pairing.connection.expiresAt : "expiresAt" in pairing ? pairing.expiresAt : 0);
  const expired = pairing?.status === "expired" || !!expiresAt && expiresAt <= now;
  const status = error ? "未確認" : expired ? "期限切れ" : pairing?.status === "connected" ? "接続中"
    : pairing?.status === "approved" ? "許可済み・接続待ち" : pairing?.status === "awaiting-approval" ? "許可待ち"
      : pairing?.status === "unavailable" ? "無効" : "未接続";
  const link = pairing && enabled && !error ? publicPairingUrl(pairing, location.origin, now) : null;
  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopyNotice("コピーしました。有効期限内にCodex内ブラウザーで開いてください。"); }
    catch { linkField.current?.focus(); linkField.current?.select(); setCopyNotice("コピーできませんでした。接続用リンクを選択してコピーしてください。"); }
  }
  return <section className="local-connection" aria-label="公開画面との接続">
    <button className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>公開画面と接続</button>
    {open && <div className="connection-review">
      <div className="section-heading"><h2 ref={heading} tabIndex={-1}>このMacへの接続許可</h2><span role="status">{status}</span></div>
      <dl className="source-context">
        <dt>接続を許可するサイト</dt><dd className="connection-origin">{PUBLIC_WEB_ORIGIN}</dd>
        <dt>操作する対象</dt><dd>このMac・{view.metadata.applicationLabel} ／ 登録済みの追加設定 {view.source?.registration.sources.length ?? 0}件</dd>
        <dt>選択中のプロジェクト</dt><dd>{view.metadata.context.project}</dd>
        <dt>許可する操作</dt><dd>準備状態の確認、モード変更の計画と実行、操作結果の確認</dd>
      </dl>
      <p className="boundary">接続は10分間有効です。許可後に開くリンクは一回限り・発行から2分以内です。許可だけではモードは変わりません。</p>
      {error && <p role="alert">{error}</p>}
      {!enabled && <p role="status">ローカルの状態を再取得し、登録対象を確認してください。</p>}
      <div className="source-actions">
        {(!pairingId || expired || pairing?.status === "unavailable") && !pending && <button className="secondary" disabled={!enabled || busy}
          onClick={() => void write("issue")}>接続許可を確認する</button>}
        {pairing?.status === "awaiting-approval" && !expired && <button className="primary" disabled={!enabled || busy || !!pending}
          onClick={() => void write("approve")}>このサイトへの接続を許可</button>}
        {pairingId && !expired && pairing?.status !== "unavailable" && <button className="secondary" disabled={busy || !!pending}
          onClick={() => void write("cancel")}>{pairing?.status === "awaiting-approval" ? "許可しない" : "接続許可を取り消す"}</button>}
        {pending && <button className="secondary" disabled={busy} onClick={() => void write(pending.action, pending)}>同じ操作の結果を確認</button>}
      </div>
      {busy && <p role="status">接続許可の記録を確認しています…</p>}
      {link && <div className="connection-link">
        <a className="primary" href={link} target="_blank" rel="noopener noreferrer">公開画面を開く</a>
        <details><summary>Codex内ブラウザーへ接続用リンクを渡す</summary>
          <p className="boundary">この一時リンクは接続先のAIにだけ渡してください。</p>
          <label>接続用リンク<textarea aria-label="接続用リンク" ref={linkField} readOnly value={link} rows={3} /></label>
          <button className="secondary" onClick={() => void copyLink()}>接続用リンクをコピー</button>
        </details>
      </div>}
      {copyNotice && link && <p role="status">{copyNotice}</p>}
      {pairing?.status === "connected" && !expired && <p className="boundary">公開画面の接続を確認しました。期限：{new Date(pairing.connection.expiresAt).toLocaleTimeString("ja-JP")}</p>}
      {expired && <p className="boundary">期限が切れました。接続する場合は新しい許可を確認してください。</p>}
      <PublicOperationLookup request={request} />
    </div>}
  </section>;
}
