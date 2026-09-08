import { useEffect, useReducer, useRef, useState } from "react";
import { Api } from "./api";
import {
  initialSourceControllerState,
  planResponseApplies,
  sourceControllerReducer,
} from "./source-controller-state";
import { modePresentation, taskObservationResponseNotice } from "./sources";
import { canAcceptSourceUpdate, readSourceUpdate } from "./source-updates";
import type { SourceUpdate } from "./source-updates";
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
  RetainedPlan,
  TaskObservation,
} from "./sources";

export type AuxiliarySourceOperationResult<T> =
  | { status: "completed"; result: T; state: SourceView }
  | { status: "context-updated"; state: SourceView }
  | { status: "failed"; error: unknown };

export function useSourceController() {
  const api = useRef(new Api()).current;
  const lock = useRef(false);
  const [state, dispatch] = useReducer(
    sourceControllerReducer,
    initialSourceControllerState,
  );
  const latest = useRef(state), foregroundGeneration = useRef(0);
  latest.current = state;
  const [externalUpdate, setExternalUpdate] = useState<SourceUpdate | null>(null);
  const previousUpdate = useRef<SourceUpdate | null>(null), updateToken = useRef<string | undefined>(undefined);
  const contextBlocked = useRef(false);
  const [syncError, setSyncError] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const {
    view,
    confirmed,
    plan,
    retainedPlan,
    favorites,
    cursor,
    error,
    notice,
  } = state;
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selected, setSelected] = useState<SourceMode>("normal");
  const [review, setReview] = useState<{
    sourceId: string;
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<object | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);
  function resetContext() {
    previousUpdate.current = null;
    updateToken.current = undefined;
    contextBlocked.current = false;
    setExternalUpdate(null);
    setSyncError("");
    setSyncNotice("");
    setRecoveryResult(null);
    setDiscovery(null);
    setReview(null);
    setSelectionKey((key) => key + 1);
  }
  function accept(next: SourceView) {
    if (!view || !sameSourceContext(view.metadata, next.metadata)) {
      resetContext();
    }
    dispatch({ type: "accept-view", view: next });
    setSyncError("");
  }
  function failed(e: unknown) {
    dispatch({ type: "failed", error: e });
  }
  async function refresh() {
    if (lock.current) return;
    lock.current = true;
    ++foregroundGeneration.current;
    setBusy(true);
    dispatch({ type: "clear-error" });
    try {
      const next = await readSourceState(api);
      accept(next);
      contextBlocked.current = false;
      updateToken.current = undefined;
      setSyncNotice("");
      setSelected(next.source?.preparedMode ?? "normal");
      dispatch({ type: "clear-plans" });
      dispatch({
        type: "set-notice",
        notice: "状態を再取得しました。実行中のタスクは未検証です。",
      });
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
  useEffect(() => {
    let stopped = false, polling = false, timer: number | undefined;
    const schedule = (delay = 2500) => { if (!stopped) timer = window.setTimeout(poll, delay); };
    async function poll() {
      if (polling || stopped) return;
      const before = latest.current.view, generation = foregroundGeneration.current;
      if (!before || lock.current || contextBlocked.current || document.visibilityState !== "visible") { schedule(); return; }
      polling = true;
      let delay = 2500;
      try {
        const update = await readSourceUpdate(api, before, updateToken.current);
        if (stopped || lock.current || document.visibilityState !== "visible"
          || !canAcceptSourceUpdate(before, latest.current.view, generation, foregroundGeneration.current)) return;
        if (update.status === "context-changed") {
          contextBlocked.current = true;
          setSyncError("接続先が変わりました。「状態を再取得」で対象を確認してください。");
          return;
        }
        if (update.status === "changing") {
          setSyncError("保存状態が変わっているため、読み直しています。");
          delay = 500;
          return;
        }
        setSyncError("");
        if (update.status === "unchanged") return;
        const previous = previousUpdate.current;
        const favoritesChanged = !previous || previous.versions.favorites !== update.versions.favorites
          || previous.history?.favorites.error?.kind !== update.history?.favorites.error?.kind;
        const sourceChanged = latest.current.view?.changeVersion !== update.view.changeVersion;
        dispatch({ type: "external-view", update, favoritesChanged });
        if (sourceChanged && latest.current.confirmed) setSelected(update.view.source?.preparedMode ?? "normal");
        previousUpdate.current = update;
        updateToken.current = update.retryRequired ? undefined : update.token;
        setExternalUpdate(update);
        setSyncNotice(update.retryRequired ? "一部の履歴を更新できません。各欄で読み直せます。"
          : previous && previous.token !== update.token ? "保存状態の更新を表示しました。" : "");
      } catch {
        if (!stopped && !lock.current && canAcceptSourceUpdate(before, latest.current.view, generation, foregroundGeneration.current))
          setSyncError("自動更新を確認できません。「状態を再取得」でも確認できます。");
        delay = 5000;
      } finally { polling = false; schedule(delay); }
    }
    const wake = () => {
      if (document.visibilityState !== "visible" || polling) return;
      window.clearTimeout(timer); schedule(0);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    schedule(500);
    return () => { stopped = true; window.clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); };
  }, [api]);
  async function run<T>(
    action: string,
    input: object,
    onResult?: (result: T) => void,
  ) {
    if (lock.current || !view) return;
    lock.current = true;
    ++foregroundGeneration.current;
    setBusy(true);
    dispatch({ type: "clear-error" });
    try {
      const response = await sourceOperation<T>(
        api,
        view.metadata,
        action,
        input,
      );
      if (response.status === "context-updated") {
        accept(response.state);
        setSelected(response.state.source?.preparedMode ?? "normal");
        dispatch({
          type: "set-notice",
          notice:
            "接続先が変わりました。表示を更新しました。対象を確認してから操作してください。",
        });
        return;
      }
      const planKind =
        action === "plan" || action === "favorite" || action === "checkpoint"
          ? "source"
          : action === "plan-retained"
            ? "retained"
            : null;
      if (planKind) {
        if (!sameSourceContext(view.metadata, response.state.metadata)) {
          resetContext();
        }
        if (planKind === "source") {
          const planResponse = response as {
            status: "completed";
            result: SourcePlan;
            state: SourceView;
          };
          const admitted = planResponseApplies(state, planResponse, "source");
          dispatch({ type: "plan-response", response: planResponse });
          setSelected(
            admitted
              ? planResponse.result.preparedMode
              : response.state.source?.preparedMode ?? "normal",
          );
        } else {
          const planResponse = response as {
            status: "completed";
            result: RetainedPlan;
            state: SourceView;
          };
          dispatch({ type: "retained-plan-response", response: planResponse });
          setSelected(response.state.source?.preparedMode ?? "normal");
        }
        return;
      }
      accept(response.state);
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
          dispatch({
            type: "set-error",
            error:
              "復旧した制御ファイル以外に独立した変更または保持したディレクトリがあります。詳細と現在の競合を確認してください。",
          });
        }
      }
      if (action === "accept-retained") {
        dispatch({ type: "clear-retained-plan" });
        setSelected(response.state.source?.preparedMode ?? "normal");
        dispatch({
          type: "set-notice",
          notice:
            "現在のCodex設定を新しいNormal版として記録しました。管理対象ファイルは変更していません。",
        });
        try {
          const favoritesResponse = await sourceOperation<SourceFavoritePage>(
            api,
            response.state.metadata,
            "favorites",
            {},
          );
          if (
            !view ||
            !sameSourceContext(view.metadata, favoritesResponse.state.metadata)
          ) {
            resetContext();
          }
          dispatch({ type: "favorites-followup", response: favoritesResponse });
          if (favoritesResponse.status === "context-updated")
            setSelected(
              favoritesResponse.state.source?.preparedMode ?? "normal",
            );
        } catch {
          dispatch({
            type: "set-error",
            error:
              "現在の設定は記録済みです。お気に入り一覧だけを再取得できませんでした。状態を再取得して確認してください。",
          });
        }
      } else if (action === "save") {
        const saved = response.result as Pick<
          SourceFavorite,
          "favoriteId" | "name" | "preparedMode"
        >;
        dispatch({
          type: "set-notice",
          notice: `「${saved.name}」（${modePresentation[saved.preparedMode].title}）をお気に入りに保存しました。`,
        });
        dispatch({
          type: "favorite-saved",
          favorite: {
            ...saved,
            normalId: response.state.source!.registration.activeNormalId,
            needsAdaptation: false,
            revision: response.state.source!.revision,
          },
        });
      } else if (action === "observe") {
        dispatch({
          type: "set-notice",
          notice: taskObservationResponseNotice(
            response.state.source,
            response.result as TaskObservation,
          ),
        });
      } else if (
        action === "recover" &&
        (response.result as { status?: string }).status ===
          "retained-recording-cancelled"
      ) {
        dispatch({
          type: "set-notice",
          notice:
            "中断した設定の記録を取り消しました。管理対象ファイルは復元していません。現在の競合を確認してください。",
        });
      } else
        dispatch({
          type: "set-notice",
          notice:
            action === "apply"
              ? "選んだ設定を準備し、ファイルの一致を確認しました。新しいタスクで使用してください。"
              : action === "register"
                ? "通常装備を保存しました。比較するモードを選べます。"
                : action === "plan-retained"
                  ? "変更内容を確認しました。まだ設定は記録していません。"
                  : action === "recover"
                    ? "復旧結果と現在の状態を確認してください。"
                    : "操作が完了しました。",
        });
      if (action === "apply" || action === "recover") {
        setSelected(response.state.source?.preparedMode ?? "normal");
        dispatch({ type: "clear-plans" });
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
    dispatch({ type: "clear-plan" });
    void run<SourcePlan>(
      "plan",
      { mode, ...(selectedIds === undefined ? {} : { selectedIds }) },
      setSourcePlan,
    );
  }
  function setSourcePlan(next: SourcePlan) {
    dispatch({ type: "set-plan", plan: next });
    setSelected(next.preparedMode);
  }
  function loadFavorites(after?: string) {
    void run<SourceFavoritePage>(
      "favorites",
      after ? { after } : {},
      (page) => {
        dispatch({ type: "favorites-page", page, append: !!after });
      },
    );
  }
  async function executeComparison<T>(
    action: string,
    input: object,
  ): Promise<AuxiliarySourceOperationResult<T>> {
    if (lock.current || !view)
      return { status: "failed", error: new Error("source-busy") };
    lock.current = true;
    ++foregroundGeneration.current;
    setBusy(true);
    try {
      const response = await sourceOperation<T>(api, view.metadata, action, input);
      if (response.status === "context-updated") {
        accept(response.state);
        setSelected(response.state.source?.preparedMode ?? "normal");
        dispatch({
          type: "set-notice",
          notice:
            "接続先が変わりました。比較記録をクリアしたため、対象を確認してください。",
        });
        return response;
      }
      accept(response.state);
      return response;
    } catch (error) {
      return { status: "failed", error };
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    recoveryResult,
    view,
    discovery,
    selected,
    plan,
    retainedPlan,
    favorites,
    cursor,
    review,
    busy,
    confirmed: confirmed && !syncError,
    externalUpdate,
    syncNotice: syncError || syncNotice,
    syncIssue: !!syncError || !!externalUpdate?.retryRequired,
    error,
    notice,
    selectionKey,
    refresh,
    run,
    choose,
    loadFavorites,
    executeComparison,
    setDiscovery,
    setReview,
    setRetainedPlan: (next: RetainedPlan) =>
      dispatch({ type: "set-retained-plan", plan: next }),
    setPlan: setSourcePlan,
    invalidatePlan: () => dispatch({ type: "clear-plan" }),
  };
}
