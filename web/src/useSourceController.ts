import { useEffect, useRef, useState } from "react";
import { Api, ApiError } from "./api";
import {
  currentTaskObservation,
  modePresentation,
  taskObservationNotice,
} from "./sources";
import {
  readSourceState,
  sameSourceContext,
  sourceOperation,
} from "./source-operations";
import type {
  Discovery,
  SourceFavorite,
  SourceFavoritePage,
  SourceMode,
  SourcePlan,
  SourceView,
  TaskObservation,
} from "./sources";

export function useSourceController() {
  const api = useRef(new Api()).current;
  const lock = useRef(false);
  const [view, setView] = useState<SourceView | null>(null);
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selected, setSelected] = useState<SourceMode>("normal");
  const [plan, setPlan] = useState<SourcePlan | null>(null);
  const [favorites, setFavorites] = useState<SourceFavorite[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [review, setReview] = useState<{
    sourceId: string;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("接続情報を確認しています。");
  const [recoveryResult, setRecoveryResult] = useState<object | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);
  function resetContext() {
    setRecoveryResult(null);
    setDiscovery(null);
    setPlan(null);
    setReview(null);
    setFavorites([]);
    setCursor(null);
    setSelectionKey((key) => key + 1);
  }
  function accept(next: SourceView) {
    if (!view || !sameSourceContext(view.metadata, next.metadata))
      resetContext();
    setView(next);
    setConfirmed(true);
  }
  function failed(e: unknown) {
    setConfirmed(false);
    const kind = e instanceof ApiError ? e.kind : "request-failed";
    setError(
      e instanceof ApiError && e.disposition === "uncertain"
        ? "結果は未確認です。状態を再取得してください。自動再送は行いません。"
        : `操作を完了できませんでした（${kind}）。外部の変更を確認し、状態を再取得してください。`,
    );
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await readSourceState(api);
      accept(next);
      setSelected(next.source?.preparedMode ?? "normal");
      setPlan(null);
      setNotice("状態を再取得しました。実行中のタスクは未検証です。");
    } catch (e) {
      failed(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function run<T>(
    action: string,
    input: object,
    onResult?: (result: T) => void,
  ) {
    if (lock.current || !view) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await sourceOperation<T>(
        api,
        view.metadata,
        action,
        input,
      );
      accept(response.state);
      if (response.status === "context-updated") {
        setSelected(response.state.source?.preparedMode ?? "normal");
        setNotice(
          "接続先が変わりました。表示を更新しました。対象を確認してから操作してください。",
        );
        return;
      }
      onResult?.(response.result);
      if (action === "recover") {
        setRecoveryResult(response.result as object);
        const outcome = response.result as {
          status?: string;
          dependencyConflicts?: string[];
          retainedDirectories?: string[];
        };
        if (
          outcome.status === "controls-restored-dependencies-changed" ||
          outcome.retainedDirectories?.length
        ) {
          setError(
            "復旧した制御ファイル以外に独立した変更または保持したディレクトリがあります。詳細と現在の競合を確認してください。",
          );
        }
      }
      if (action === "save") {
        const saved = response.result as Pick<
          SourceFavorite,
          "favoriteId" | "name" | "preparedMode"
        >;
        setNotice(
          `「${saved.name}」（${modePresentation[saved.preparedMode].title}）をお気に入りに保存しました。`,
        );
        setFavorites((previous) => [
          { ...saved, revision: response.state.source!.revision },
          ...previous.filter((item) => item.favoriteId !== saved.favoriteId),
        ]);
      } else if (action === "observe") {
        const observation = currentTaskObservation(
          response.state.source,
          response.result as TaskObservation,
        );
        setNotice(
          observation
            ? taskObservationNotice(observation.status)
            : "確認後に準備状態が変わりました。現在の準備について、別の新しいタスクを確認してください。",
        );
      } else
        setNotice(
          action === "apply"
            ? "選んだ設定を準備し、ファイルの一致を確認しました。新しいタスクで使用してください。"
            : action === "register"
              ? "通常装備を保存しました。比較するモードを選べます。"
              : action === "recover"
                ? "復旧結果と現在の状態を確認してください。"
                : "操作が完了しました。",
        );
      if (action === "apply" || action === "recover") {
        setSelected(response.state.source?.preparedMode ?? "normal");
        setPlan(null);
      }
    } catch (e) {
      failed(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function choose(mode: SourceMode, selectedIds?: string[]) {
    setSelected(mode);
    setPlan(null);
    void run<SourcePlan>(
      "plan",
      { mode, ...(selectedIds === undefined ? {} : { selectedIds }) },
      setPlan,
    );
  }
  function loadFavorites(after?: string) {
    void run<SourceFavoritePage>(
      "favorites",
      after ? { after } : {},
      (page) => {
        setFavorites((previous) =>
          after
            ? [
                ...previous,
                ...page.favorites.filter(
                  (item) =>
                    !previous.some(
                      (existing) => existing.favoriteId === item.favoriteId,
                    ),
                ),
              ]
            : page.favorites,
        );
        setCursor(page.nextCursor);
      },
    );
  }
  return {
    recoveryResult,
    view,
    discovery,
    selected,
    plan,
    favorites,
    cursor,
    review,
    busy,
    confirmed,
    error,
    notice,
    selectionKey,
    refresh,
    run,
    choose,
    loadFavorites,
    setDiscovery,
    setReview,
    setPlan: (next: SourcePlan) => {
      setPlan(next);
      setSelected(next.preparedMode);
    },
    invalidatePlan: () => setPlan(null),
  };
}
