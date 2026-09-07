import { useEffect, useRef, useState } from "react";
import { Api, ApiError, RequestGeneration } from "./api";
import type { InventoryState } from "./inventory";
import { readSourceInventory } from "./inventory-operations";

export function useSourceInventory() {
  const api = useRef(new Api()).current;
  const generation = useRef(new RequestGeneration()).current;
  const busyRef = useRef(false);
  const [inventory, setInventory] = useState<InventoryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function request(inspect: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    const current = generation.next();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await readSourceInventory(api, inventory, inspect);
      if (generation.isCurrent(current)) {
        setInventory(next.inventory);
        if (next.status === "context-updated") {
          setNotice("接続先の読取設定を確認し直しました。表示された対象を確認してから、改めて読み取ってください。");
        }
      }
    } catch (reason) {
      if (!generation.isCurrent(current)) return;
      setError(reason instanceof ApiError && reason.kind === "gui-inventory-target-changed"
        ? "選択した場所が移動・変更されています。起動時の読取対象を確認してください。"
        : "読み取り結果を取得できませんでした。再取得してください。前回の結果がある場合は、その取得日時とともに表示しています。");
    } finally {
      if (generation.isCurrent(current)) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    void request(false);
    return () => {
      generation.next();
      busyRef.current = false;
    };
  }, []);
  return { inventory, busy, error, notice, read: () => request(!!inventory?.enabled) };
}
