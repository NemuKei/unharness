import { useRef, useState } from "react";
import { connectionRecord, isConnectionHash, isConnectionId } from "./connection-contract";
import type { LocalConnectionRequest } from "./local-connection";

function receiptMessage(value: unknown, requestId: string) {
  const v = connectionRecord(value);
  if (v.requestId !== requestId) throw Error("invalid-receipt");
  if (v.state === "not-found" && v.operation === null) return "記録が見つかりません。未実行と断定せず、公開画面の操作IDとローカルの状態を確認してください。";
  if (!["apply", "plan"].includes(v.operation as string)) throw Error("invalid-receipt");
  if (v.state === "unconfirmed") return "結果は未確認です。ローカルの準備状態と復旧の案内を確認してください。";
  if (v.state !== "completed") throw Error("invalid-receipt");
  const result = connectionRecord(v.result);
  if (result.ok === false) return "この操作を完了できなかった記録があります。ローカルの準備状態を確認してください。";
  if (result.ok !== true) throw Error("invalid-receipt");
  const data = connectionRecord(result.data);
  if (!isConnectionHash(data.scopeId) || !Number.isSafeInteger(data.revision)) throw Error("invalid-receipt");
  if (v.operation === "plan") {
    if (!isConnectionHash(data.planId)) throw Error("invalid-receipt");
    return "変更計画を作成した記録があります。この記録だけでは設定は変わっていません。";
  }
  if (!["normal", "unseal", "trueform"].includes(data.preparedMode as string)) throw Error("invalid-receipt");
  const label = { normal: "Normal", unseal: "限定解除 — UNSEAL", trueform: "零式 — TRUEFORM" }[data.preparedMode as string];
  if (!label || data.readback !== "matched" || data.runtimeState !== "unknown") throw Error("invalid-receipt");
  return `${label}の設定を準備し、ファイルの一致を確認した記録があります。実行中のタスクへの反映は未確認です。`;
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
      if (before === generation.current) setMessage("結果を確認できません。未実行とは断定できません。ローカルの準備状態と復旧の案内を確認してください。");
    } finally { locked.current = false; setBusy(false); }
  }
  return <details className="public-operation-lookup"><summary>公開画面での操作結果を確認</summary>
    <p className="boundary">接続が切れた後も、保存された操作IDで結果を確認できます。表示するのは当時の記録です。</p>
    <form onSubmit={event => { event.preventDefault(); void lookup(); }}>
      <label>公開画面の操作ID<input value={operationId} spellCheck={false} autoComplete="off" onChange={event => {
        ++generation.current; setOperationId(event.target.value.trim()); setMessage("");
      }} /></label>
      <button className="secondary" disabled={busy || !isConnectionId(operationId)} type="submit">保存された結果を確認</button>
    </form>
    {message && <p role="status">{message}</p>}
  </details>;
}
