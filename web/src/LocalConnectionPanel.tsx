import { text as t } from './locale.ts';
import { useEffect, useRef, useState } from "react";
import type { SourceView } from "./sources";
import { PUBLIC_WEB_ORIGIN, connectionRecord, isConnectionId } from "./connection-contract";
import { pairingFromHash, readLocalPairing, publicPairingUrl } from "./local-connection";
import type { LocalConnectionAction, LocalConnectionRequest, LocalPairing } from "./local-connection";
import { PublicOperationLookup } from "./PublicOperationLookup";

type Pending = { action: LocalConnectionAction; input: { requestId: string; pairingId?: string } };
export function LocalConnectionPanel({ view, enabled, request, onOpen }: {
  view: SourceView; enabled: boolean; request: LocalConnectionRequest; onOpen?: () => void;
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
  const storageKey = `unharness.local-pairing.v2.${view.metadata.launchId}.${view.metadata.contextId}.${view.source?.registration.scopeId}.${view.source?.registration.rootScopeId ?? view.source?.registration.scopeId}`;
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
      remember(id); setOpen(true); onOpen?.();
    }
    const changed = () => handoff();
    handoff(true); window.addEventListener("hashchange", changed);
    return () => { alive.current = false; ++epoch.current; window.removeEventListener("hashchange", changed); };
  }, [storageKey, onOpen]);
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
          || (["approve", "cancel"].includes(write.action) && ["expired", "unavailable"].includes(details.status)))) setPending(null);
      } catch {
        if (!stopped && before === epoch.current && !locked.current) { setPairing(null); setError(t("接続状態を確認できません。接続用リンクと許可操作を停止しています。", "Connection state is unconfirmed. Connection links and approval controls are paused.")); }
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
      if (alive.current && before === epoch.current) { setPairing(null); setError(t("操作の結果を確認できません。同じ操作IDで結果を確認できます。", "The operation result is unconfirmed. Check it with the same operation ID.")); }
    } finally {
      if (alive.current && before === epoch.current) { locked.current = false; setBusy(false); }
    }
  }
  const expiresAt = pairing && (pairing.status === "connected" ? pairing.connection.expiresAt : "expiresAt" in pairing ? pairing.expiresAt : 0);
  const expired = pairing?.status === "expired" || !!expiresAt && expiresAt <= now;
  const status = error ? t("未確認", "Unknown") : expired ? t("期限切れ", "Expired") : pairing?.status === "connected" ? t("接続中", "Connected")
    : pairing?.status === "approved" ? t("許可済み・接続待ち", "Approved; awaiting connection") : pairing?.status === "awaiting-approval" ? t("許可待ち", "Awaiting approval")
      : pairing?.status === "unavailable" ? t("無効", "Inactive") : t("未接続", "Disconnected");
  const link = pairing && enabled && !error ? publicPairingUrl(pairing, location.origin, now) : null;
  async function copyLink() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopyNotice(t("コピーしました。有効期限内にCodex内ブラウザーで開いてください。", "Copied. Open it in the Codex in-app browser before it expires.")); }
    catch { linkField.current?.focus(); linkField.current?.select(); setCopyNotice(t("コピーできませんでした。接続用リンクを選択してコピーしてください。", "Copy failed. Select the connection link and copy it manually.")); }
  }
  return <section className="local-connection" aria-label={t("公開画面との接続", "Public-page connection")}>
    <button className="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{t("操作画面への接続を確認", "Review the workbench connection")}</button>
    {open && <div className="connection-review">
      <div className="section-heading"><h2 ref={heading} tabIndex={-1}>{t("このMacへの接続許可", "Permission to connect to this Mac")}</h2><span role="status">{status}</span></div>
      <dl className="source-context">
        <dt>{t("接続を許可するサイト", "Approved site")}</dt><dd className="connection-origin">{PUBLIC_WEB_ORIGIN}</dd>
        <dt>{t("操作する対象", "Target to operate")}</dt><dd>{t("このMac・", "This Mac · ")}{view.metadata.applicationLabel} {t(" ／ 登録済みの追加設定 ", " / Registered optional settings: ")}{view.source?.registration.sources.length ?? 0}{t("件", " items")}</dd>
        <dt>{t("選択中のプロジェクト", "Selected project")}</dt><dd>{view.metadata.context.project}</dd>
        <dt>{t("作品の保存範囲", "Artwork scope")}</dt><dd>{t("この設定で保存した作品コレクション", "Artwork collection saved for this setup")}</dd>
        <dt>{t("許可する操作", "Allowed operations")}</dt><dd>{t("準備状態の確認、モード変更の計画と実行、操作結果の確認。作品の画像・コレクションの読込、画像レビュー・保存・選択・名前変更・作品保存の復旧。", "Read prepared state, plan and apply mode changes, and inspect operation results. Read artwork images and collections; review, save, select and rename artwork; and recover artwork saving.")}</dd>
      </dl>
      <p className="boundary">{t("接続は10分間有効です。許可後に開くリンクは一回限り・発行から2分以内です。許可だけではモードや作品は変わりません。設定の追加登録や制作場所の読取は許可しません。", "The connection lasts 10 minutes. The issued link can be used once, within 2 minutes. Approval alone does not change modes or artwork. It does not allow new source registration or reading authoring workspaces.")}</p>
      {error && <p role="alert">{error}</p>}
      {!enabled && <p role="status">{t("ローカルの状態を再取得し、登録対象を確認してください。", "Refresh local state and review the registered targets.")}</p>}
      <div className="source-actions">
        {(!pairingId || expired || pairing?.status === "unavailable") && !pending && <button className="secondary" disabled={!enabled || busy}
          onClick={() => void write("issue")}>{t("接続許可を確認する", "Review connection approval")}</button>}
        {pairing?.status === "awaiting-approval" && !expired && <button className="primary" disabled={!enabled || busy || !!pending}
          onClick={() => void write("approve")}>{t("このサイトへの接続を許可", "Allow this site to connect")}</button>}
        {pairingId && !expired && pairing?.status !== "unavailable" && <button className="secondary" disabled={busy || !!pending}
          onClick={() => void write("cancel")}>{pairing?.status === "awaiting-approval" ? t("許可しない", "Decline") : t("接続許可を取り消す", "Revoke connection approval")}</button>}
        {pending && <button className="secondary" disabled={busy} onClick={() => void write(pending.action, pending)}>{t("同じ操作の結果を確認", "Check this operation's result")}</button>}
      </div>
      {busy && <p role="status">{t("接続許可の記録を確認しています…", "Checking the approval record…")}</p>}
      {link && <div className="connection-link">
        <a className="primary" href={link} target="_blank" rel="noopener noreferrer">{t("いつもの操作画面を開く", "Open your workbench")}</a>
        <details><summary>{t("Codex内ブラウザーへ接続用リンクを渡す", "Pass the connection link to the Codex in-app browser")}</summary>
          <p className="boundary">{t("この一時リンクは接続先のAIにだけ渡してください。", "Share this temporary link only with the AI you are connecting.")}</p>
          <label>{t("接続用リンク", "Connection link")}<textarea aria-label={t("接続用リンク", "Connection link")} ref={linkField} readOnly value={link} rows={3} /></label>
          <button className="secondary" onClick={() => void copyLink()}>{t("接続用リンクをコピー", "Copy connection link")}</button>
        </details>
      </div>}
      {copyNotice && link && <p role="status">{copyNotice}</p>}
      {pairing?.status === "connected" && !expired && <p className="boundary">{t("公開画面の接続を確認しました。期限：", "Public-page connection confirmed. Expires: ")}{new Date(pairing.connection.expiresAt).toLocaleTimeString(t("ja-JP", "en-US"))}</p>}
      {expired && <p className="boundary">{t("期限が切れました。接続する場合は新しい許可を確認してください。", "Expired. Review a new approval to connect again.")}</p>}
      <PublicOperationLookup request={request} />
    </div>}
  </section>;
}
