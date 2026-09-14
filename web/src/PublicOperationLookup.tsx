import { text as t } from './locale.ts';
import { useRef, useState } from "react";
import { connectionRecord, isConnectionHash, isConnectionId } from "./connection-contract";
import { readOperationReceipt, isArtworkWrite, artworkResultText } from './connection-artwork';
import type { PublicArtworkReceipt } from './connection-artwork';
import type { LocalConnectionRequest } from "./local-connection";

function receiptMessage(value: unknown, requestId: string) {
  const checked = readOperationReceipt(value, requestId);
  if (isArtworkWrite(checked.operation)) return artworkResultText(checked as PublicArtworkReceipt);
  const v = connectionRecord(checked);
  if (v.requestId !== requestId) throw Error("invalid-receipt");
  if (v.state === "not-found" && v.operation === null) return t("記録が見つかりません。未実行と断定せず、公開画面の操作IDとローカルの状態を確認してください。", "No record found. This does not prove the operation never ran. Check the public operation ID and local state.");
  if (!["apply", "plan"].includes(v.operation as string)) throw Error("invalid-receipt");
  if (v.state === "running") return t("処理中です。同じ操作IDで結果を確認してください。", "Processing. Check the result with the same operation ID.");
  if (v.state === "unconfirmed") return t("結果は未確認です。ローカルの準備状態と復旧の案内を確認してください。", "Result unconfirmed. Review local preparation and recovery guidance.");
  if (v.state !== "completed") throw Error("invalid-receipt");
  const result = connectionRecord(v.result);
  if (result.ok === false) return t("この操作を完了できなかった記録があります。ローカルの準備状態を確認してください。", "The record reports an unsuccessful operation. Check local preparation.");
  if (result.ok !== true) throw Error("invalid-receipt");
  const data = connectionRecord(result.data);
  if (!isConnectionHash(data.scopeId) || !Number.isSafeInteger(data.revision)) throw Error("invalid-receipt");
  if (v.operation === "plan") {
    if (!isConnectionHash(data.planId)) throw Error("invalid-receipt");
    return t("変更計画を作成した記録があります。この記録だけでは設定は変わっていません。", "A change plan was recorded. This record alone does not change settings.");
  }
  if (!["normal", "unseal", "trueform"].includes(data.preparedMode as string)) throw Error("invalid-receipt");
  const label = { normal: "Normal", unseal: t("限定解除 — UNSEAL", "UNSEAL"), trueform: t("零式 — TRUEFORM", "TRUEFORM") }[data.preparedMode as string];
  if (!label || data.readback !== "matched" || data.runtimeState !== "unknown") throw Error("invalid-receipt");
  return t(`${label}の設定を準備し、ファイルの一致を確認した記録があります。実行中のタスクへの反映は未確認です。`, `A record confirms preparation of ${label} and matching files. Loading in the running task is unconfirmed.`);
}
export function PublicOperationLookup({ request }: { request: LocalConnectionRequest }) {
  const [operationId, setOperationId] = useState(""), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), generation = useRef(0), locked = useRef(false);
  async function lookup() {
    if (locked.current || !isConnectionId(operationId)) return;
    locked.current = true; setBusy(true); setMessage("");
    const before = ++generation.current;
    try {
      const receipt = await request("operation-status", { operationId });
      if (before === generation.current) setMessage(receiptMessage(receipt, operationId));
    } catch {
      if (before === generation.current) setMessage(t("結果を確認できません。未実行とは断定できません。ローカルの準備状態と復旧の案内を確認してください。", "Cannot confirm the result or assume it never ran. Review local preparation and recovery guidance."));
    } finally { locked.current = false; setBusy(false); }
  }
  return <details className="public-operation-lookup"><summary>{t("公開画面での操作結果を確認", "Check a public-page operation")}</summary>
    <p className="boundary">{t("接続が切れた後も、保存された操作IDで結果を確認できます。表示するのは当時の記録です。", "Use the saved operation ID to check after disconnecting. The display shows the record from that time.")}</p>
    <form onSubmit={event => { event.preventDefault(); void lookup(); }}>
      <label>{t("公開画面の操作ID", "Public operation ID")}<input value={operationId} spellCheck={false} autoComplete="off" onChange={event => {
        ++generation.current; setOperationId(event.target.value.trim()); setMessage("");
      }} /></label>
      <button className="secondary" disabled={busy || !isConnectionId(operationId)} type="submit">{t("保存された結果を確認", "Check saved result")}</button>
    </form>
    {message && <p role="status">{message}</p>}
  </details>;
}
