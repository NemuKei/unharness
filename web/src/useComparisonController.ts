import { useEffect, useReducer, useRef } from "react";
import { mergeHistoryRows } from "./source-updates.ts";
import type { SourceUpdate } from "./source-updates";
import { ApiError } from "./api.ts";
import {
  comparisonErrorMessage,
  isComparisonMutation,
} from "./comparisons.ts";
import type {
  ComparisonFavorite,
  RunAssessment,
  RunComparison,
  RunOutput,
  RunPage,
  RunReview,
  SavedRun,
} from "./comparisons";
import type { SourceMetadata, SourceView } from "./sources";

export type ComparisonContext = Pick<
  SourceMetadata,
  "launchId" | "contextId" | "workspace"
> & { scopeId: string };

export function comparisonContextFor(
  view: Pick<SourceView, "metadata" | "source"> | null,
): ComparisonContext | null {
  if (!view?.source || !view.metadata.workspace) return null;
  return {
    launchId: view.metadata.launchId,
    contextId: view.metadata.contextId,
    workspace: view.metadata.workspace,
    scopeId: view.source.registration.scopeId,
  };
}

export function comparisonContextKey(
  view: Pick<SourceView, "metadata" | "source"> | null,
) {
  const context = comparisonContextFor(view);
  return context
    ? JSON.stringify([
        context.launchId,
        context.contextId,
        context.workspace,
        context.scopeId,
      ])
    : "unregistered";
}

function sameComparisonContext(
  left: ComparisonContext | null,
  right: ComparisonContext | null,
) {
  return (
    left !== null &&
    right !== null &&
    left.launchId === right.launchId &&
    left.contextId === right.contextId &&
    left.workspace === right.workspace &&
    left.scopeId === right.scopeId
  );
}

export type ComparisonControllerState = {
  context: ComparisonContext | null;
  review: RunReview | null;
  correctionRun: SavedRun | null;
  runs: SavedRun[];
  cursor: string | null;
  selectedRunIds: string[];
  comparison: RunComparison | null;
  output: RunOutput | null;
  lastSavedRun: SavedRun | null;
  lastFavorite: ComparisonFavorite | null;
  uncertainOperation: "review-run" | "save-run" | "run-favorite" | null;
  error: string;
  backgroundError: string;
  notice: string;
  intentGeneration: number;
};

export const initialComparisonControllerState: ComparisonControllerState = {
  context: null,
  review: null,
  correctionRun: null,
  runs: [],
  cursor: null,
  selectedRunIds: [],
  comparison: null,
  output: null,
  lastSavedRun: null,
  lastFavorite: null,
  uncertainOperation: null,
  error: "",
  backgroundError: "",
  notice: "通常利用の記録を選んで比較できます。",
  intentGeneration: 0,
};

type ResultAction<T extends string, V> = {
  type: T;
  requestContext: ComparisonContext;
  view: SourceView;
} & V;

export type ComparisonControllerAction =
  | { type: "source-view"; view: SourceView | null }
  | ResultAction<
      "review-completed",
      { review: RunReview; intentGeneration: number }
    >
  | ResultAction<"save-completed", { run: SavedRun }>
  | ResultAction<"history-completed", { page: RunPage; append: boolean }>
  | ResultAction<"external-history", { page: RunPage }>
  | ResultAction<
      "comparison-completed",
      { comparison: RunComparison; intentGeneration: number }
    >
  | ResultAction<
      "output-completed",
      { output: RunOutput; intentGeneration: number }
    >
  | ResultAction<"favorite-completed", { favorite: ComparisonFavorite }>
  | { type: "begin-review"; intentGeneration: number }
  | { type: "begin-comparison"; intentGeneration: number }
  | { type: "begin-output"; intentGeneration: number }
  | { type: "begin-correction"; run: SavedRun; intentGeneration: number }
  | { type: "select-runs"; runIds: string[]; intentGeneration: number }
  | { type: "clear-review"; intentGeneration: number }
  | { type: "clear-error" }
  | { type: "history-failed"; message: string }
  | { type: "background-history-error"; message: string }
  | {
      type: "operation-failed";
      operation: string;
      disposition: "rejected" | "uncertain" | "auth-required";
      message: string;
      intentGeneration?: number;
    };

function resetForContext(context: ComparisonContext | null) {
  return { ...initialComparisonControllerState, context };
}

function admits(
  state: ComparisonControllerState,
  requestContext: ComparisonContext,
  view: SourceView,
) {
  return (
    sameComparisonContext(state.context, requestContext) &&
    sameComparisonContext(requestContext, comparisonContextFor(view))
  );
}

export function buildSaveRunInput(
  state: Pick<ComparisonControllerState, "review" | "correctionRun">,
  input: { title?: string; assessment: RunAssessment },
) {
  if (!state.review) return null;
  return {
    reviewId: state.review.reviewId,
    ...(state.correctionRun
      ? { previousRunId: state.correctionRun.runId }
      : {}),
    ...(input.title ? { title: input.title } : {}),
    assessment: input.assessment,
  };
}

export function comparisonControllerReducer(
  state: ComparisonControllerState,
  action: ComparisonControllerAction,
): ComparisonControllerState {
  if (action.type === "source-view") {
    const context = comparisonContextFor(action.view);
    return sameComparisonContext(state.context, context)
      ? state
      : resetForContext(context);
  }
  if (action.type === "clear-error")
    return { ...state, error: "", uncertainOperation: null };
  if (action.type === "clear-review")
    return {
      ...state,
      intentGeneration: action.intentGeneration,
      review: null,
      correctionRun: null,
      comparison: null,
      output: null,
      error: "",
    };
  if (action.type === "begin-review")
    return {
      ...state,
      intentGeneration: action.intentGeneration,
      correctionRun: null,
      comparison: null,
      output: null,
      error: "",
    };
  if (action.type === "begin-comparison")
    return {
      ...state,
      intentGeneration: action.intentGeneration,
      comparison: null,
      output: null,
      error: "",
    };
  if (action.type === "begin-output")
    return {
      ...state,
      intentGeneration: action.intentGeneration,
      output: null,
      error: "",
    };
  if (action.type === "begin-correction")
    return {
      ...state,
      intentGeneration: action.intentGeneration,
      review: action.run,
      correctionRun: action.run,
      comparison: null,
      output: null,
      error: "",
      notice: "この保存版と同じ測定記録に、訂正版を追加します。",
    };
  if (action.type === "select-runs")
    return {
      ...state,
      intentGeneration: action.intentGeneration,
      selectedRunIds: action.runIds.slice(0, 3),
      comparison: null,
      output: null,
      error: "",
    };
  if (action.type === "history-failed")
    return { ...state, error: action.message };
  if (action.type === "background-history-error") return { ...state, backgroundError: action.message };
  if (action.type === "operation-failed")
    if (
      action.intentGeneration !== undefined &&
      action.intentGeneration !== state.intentGeneration
    )
      return state;
  if (action.type === "operation-failed")
    return {
      ...state,
      error: action.message,
      uncertainOperation:
        action.disposition === "uncertain" && isComparisonMutation(action.operation)
          ? (action.operation as "review-run" | "save-run" | "run-favorite")
          : null,
    };
  if (!admits(state, action.requestContext, action.view)) return state;
  if (
    (action.type === "review-completed" ||
      action.type === "comparison-completed" ||
      action.type === "output-completed") &&
    action.intentGeneration !== state.intentGeneration
  )
    return state;
  if (action.type === "review-completed")
    return {
      ...state,
      review: action.review,
      correctionRun: null,
      comparison: null,
      output: null,
      uncertainOperation: null,
      error: "",
      notice: "観測記録を確認しました。評価は後から付ける記録です。",
    };
  if (action.type === "save-completed")
    return {
      ...state,
      correctionRun: null,
      runs: [action.run, ...state.runs.filter((run) => run.runId !== action.run.runId)],
      lastSavedRun: action.run,
      uncertainOperation: null,
      error: "",
      notice: "通常利用の記録を保存しました。",
    };
  if (action.type === "history-completed") {
    const runs = action.append
      ? [
          ...state.runs,
          ...action.page.runs.filter(
            (next) => !state.runs.some((current) => current.runId === next.runId),
          ),
        ]
      : action.page.runs;
    return {
      ...state,
      runs,
      cursor: action.page.nextCursor,
      error: "",
    };
  }
  if (action.type === "external-history") return {
    ...state, runs: mergeHistoryRows(state.runs, action.page.runs, "runId"), cursor: action.page.nextCursor, backgroundError: "",
  };
  if (action.type === "comparison-completed")
    return {
      ...state,
      comparison: action.comparison,
      output: null,
      error: "",
      notice: "選んだ通常利用の記録を並べました。優劣は判定していません。",
    };
  if (action.type === "output-completed")
    return { ...state, output: action.output, error: "" };
  return {
    ...state,
    lastFavorite: action.favorite,
    uncertainOperation: null,
    error: "",
    notice: `「${action.favorite.name}」を履歴の設定として保存しました。`,
  };
}

type AuxiliaryResult<T> =
  | { status: "completed"; result: T; state: SourceView }
  | { status: "context-updated"; state: SourceView }
  | { status: "failed"; error: unknown };

type SharedSourceController = {
  view: SourceView | null;
  externalUpdate?: SourceUpdate | null;
  executeComparison<T>(action: string, input: object): Promise<AuxiliaryResult<T>>;
};

export function useComparisonController(shared: SharedSourceController) {
  const [state, dispatch] = useReducer(
    comparisonControllerReducer,
    initialComparisonControllerState,
  );
  const stateRef = useRef(state);
  const intentGeneration = useRef(0);
  stateRef.current = state;
  useEffect(() => {
    dispatch({ type: "source-view", view: shared.view });
  }, [shared.view]);
  const externalSignature = useRef("");
  useEffect(() => {
    const update = shared.externalUpdate, page = update?.history?.runs;
    if (!update || !page || comparisonContextKey(update.view) !== comparisonContextKey(shared.view)) return;
    const signature = JSON.stringify([comparisonContextKey(update.view), update.versions.runs, page.error?.kind]);
    if (signature === externalSignature.current) return;
    externalSignature.current = signature;
    if (page.error) dispatch({ type: "background-history-error", message: "通常利用の履歴を自動更新できません。履歴を読み直してください。" });
    else {
      const requestContext = comparisonContextFor(update.view);
      if (requestContext) dispatch({ type: "external-history", requestContext, view: update.view, page: page.data });
    }
  }, [shared.externalUpdate, shared.view]);

  async function execute<T>(
    operation: string,
    input: object,
    completed: (result: T, context: ComparisonContext, view: SourceView) => void,
    historyFollowup = false,
    requestedIntentGeneration?: number,
  ) {
    const context = stateRef.current.context;
    if (!context) return false;
    dispatch({ type: "clear-error" });
    const response = await shared.executeComparison<T>(operation, input);
    if (response.status === "context-updated") {
      dispatch({ type: "source-view", view: response.state });
      return false;
    }
    if (response.status === "failed") {
      const message = historyFollowup
        ? "保存は確認済みです。履歴一覧だけを更新できませんでした。"
        : comparisonErrorMessage(response.error);
      if (historyFollowup)
        dispatch({ type: "history-failed", message });
      else
        dispatch({
          type: "operation-failed",
          operation,
          disposition:
            response.error instanceof ApiError
              ? response.error.disposition
              : "uncertain",
          message,
          ...(requestedIntentGeneration === undefined
            ? {}
            : { intentGeneration: requestedIntentGeneration }),
        });
      return false;
    }
    completed(response.result, context, response.state);
    return true;
  }

  async function reviewRun(taskId: string, throughTurnId?: string) {
    const generation = ++intentGeneration.current;
    dispatch({ type: "begin-review", intentGeneration: generation });
    await execute<RunReview>(
      "review-run",
      { taskId, ...(throughTurnId ? { throughTurnId } : {}) },
      (review, requestContext, view) =>
        dispatch({
          type: "review-completed",
          requestContext,
          view,
          review,
          intentGeneration: generation,
        }),
      false,
      generation,
    );
  }

  async function loadRuns(after?: string, afterConfirmedSave = false) {
    await execute<RunPage>(
      "runs",
      after ? { after } : {},
      (page, requestContext, view) =>
        dispatch({
          type: "history-completed",
          requestContext,
          view,
          page,
          append: !!after,
        }),
      afterConfirmedSave,
    );
  }

  async function saveRun(input: { title?: string; assessment: RunAssessment }) {
    const current = stateRef.current;
    const request = buildSaveRunInput(current, input);
    if (!request) return;
    const saved = await execute<SavedRun>(
      "save-run",
      request,
      (run, requestContext, view) =>
        dispatch({ type: "save-completed", requestContext, view, run }),
    );
    if (saved) await loadRuns(undefined, true);
  }

  async function compareRuns() {
    const runIds = stateRef.current.selectedRunIds;
    if (runIds.length < 1 || runIds.length > 3) return;
    const generation = ++intentGeneration.current;
    dispatch({ type: "begin-comparison", intentGeneration: generation });
    await execute<RunComparison>(
      "compare-runs",
      { runIds },
      (comparison, requestContext, view) =>
        dispatch({
          type: "comparison-completed",
          requestContext,
          view,
          comparison,
          intentGeneration: generation,
        }),
      false,
      generation,
    );
  }

  async function readOutput(runId: string) {
    const generation = ++intentGeneration.current;
    dispatch({ type: "begin-output", intentGeneration: generation });
    await execute<RunOutput>(
      "run-output",
      { runId },
      (output, requestContext, view) =>
        dispatch({
          type: "output-completed",
          requestContext,
          view,
          output,
          intentGeneration: generation,
        }),
      false,
      generation,
    );
  }

  async function saveFavorite(runId: string, name?: string) {
    await execute<ComparisonFavorite>(
      "run-favorite",
      { runId, ...(name ? { name } : {}) },
      (favorite, requestContext, view) =>
        dispatch({
          type: "favorite-completed",
          requestContext,
          view,
          favorite,
        }),
    );
  }

  return {
    state,
    reviewRun,
    saveRun,
    loadRuns,
    compareRuns,
    readOutput,
    saveFavorite,
    beginCorrection: (run: SavedRun) => {
      const generation = ++intentGeneration.current;
      dispatch({ type: "begin-correction", run, intentGeneration: generation });
    },
    selectRuns: (runIds: string[]) => {
      const generation = ++intentGeneration.current;
      dispatch({ type: "select-runs", runIds, intentGeneration: generation });
    },
    clearReview: () => {
      const generation = ++intentGeneration.current;
      dispatch({ type: "clear-review", intentGeneration: generation });
    },
  };
}
