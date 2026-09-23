import { text as t } from './locale.ts';
import { ApiError } from "./api.ts";
import { mergeHistoryRows } from "./source-updates.ts";
import type { SourceUpdate } from "./source-updates";
import {
  sameSourceContext,
  sameSourcePlanContext,
} from "./source-operations.ts";
import type {
  RetainedPlan,
  SourceFavorite,
  SourceFavoritePage,
  SourcePlan,
  SourceView,
} from "./sources";

export type SourceOperationResponse<T> =
  | { status: "context-updated"; state: SourceView }
  | { status: "completed"; result: T; state: SourceView };
type CompletedSourceOperationResponse<T> = Extract<
  SourceOperationResponse<T>,
  { status: "completed" }
>;

export type SourceControllerState = {
  view: SourceView | null;
  confirmed: boolean;
  plan: SourcePlan | null;
  retainedPlan: RetainedPlan | null;
  favorites: SourceFavorite[];
  cursor: string | null;
  error: string;
  errorDetail: string;
  notice: string;
};

export const initialSourceControllerState: SourceControllerState = {
  view: null,
  confirmed: false,
  plan: null,
  retainedPlan: null,
  favorites: [],
  cursor: null,
  error: "",
  errorDetail: "",
  get notice() { return t("接続情報を確認しています。", "Checking the connection."); },
};

export type SourceControllerAction =
  | { type: "accept-view"; view: SourceView }
  | { type: "external-view"; update: SourceUpdate; favoritesChanged?: boolean }
  | {
      type: "favorites-followup";
      response: SourceOperationResponse<SourceFavoritePage>;
    }
  | { type: "failed"; error: unknown }
  | { type: "clear-error" }
  | { type: "set-error"; error: string }
  | { type: "set-notice"; notice: string }
  | {
      type: "plan-response";
      response: CompletedSourceOperationResponse<SourcePlan>;
    }
  | {
      type: "retained-plan-response";
      response: CompletedSourceOperationResponse<RetainedPlan>;
    }
  | { type: "set-plan"; plan: SourcePlan }
  | { type: "set-retained-plan"; plan: RetainedPlan }
  | { type: "clear-plan" }
  | { type: "clear-retained-plan" }
  | { type: "clear-plans" }
  | { type: "favorite-saved"; favorite: SourceFavorite }
  | { type: "favorites-page"; page: SourceFavoritePage; append: boolean };

function acceptView(
  state: SourceControllerState,
  view: SourceView,
): SourceControllerState {
  const sameContext =
    state.view !== null && sameSourceContext(state.view.metadata, view.metadata);
  const samePlanContext =
    state.view !== null && sameSourcePlanContext(state.view, view);
  return {
    ...state,
    view,
    confirmed: true,
    plan: samePlanContext ? state.plan : null,
    retainedPlan: samePlanContext ? state.retainedPlan : null,
    favorites: sameContext ? state.favorites : [],
    cursor: sameContext ? state.cursor : null,
  };
}

function failureFeedback(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : "request-failed";
  const message =
    error instanceof ApiError && error.disposition === "uncertain"
      ? t("結果をまだ確かめていません。もう一度押さずに、「状態を再取得」で確かめてください。自動でやり直すことはありません。", "The result is not confirmed yet. Don’t press again — use Refresh state. Nothing is retried automatically.")
      : t("うまくいきませんでした。「状態を再取得」で今の設定を確かめてください。", "That didn’t work. Use Refresh state to check the current settings.");
  return { message, detail: kind };
}

type PlanKind = "source" | "retained";

function planApplies(
  state: Pick<SourceControllerState, "view" | "confirmed">,
  plan: SourcePlan | RetainedPlan,
  kind: PlanKind,
) {
  const source = state.view?.source;
  if (
    !state.confirmed ||
    !source ||
    source.recovery.pending ||
    plan.scopeId !== source.registration.scopeId ||
    plan.revision !== source.revision
  )
    return false;
  if (kind === "source") {
    const modePlan = plan as SourcePlan;
    return source.conflict === null || (source.modePlanningAvailable === true
      && source.conflict?.kind === 'source-conflict' && modePlan.retainedSettingsIncluded === true
      && ['normal', 'unseal', 'trueform'].includes(modePlan.mode));
  }
  const retained = plan as RetainedPlan;
  return (
    source.conflict?.kind === "source-conflict" &&
    retained.previousNormalId === source.registration.activeNormalId &&
    retained.normalId !== source.registration.activeNormalId
  );
}

export function planResponseApplies(
  state: SourceControllerState,
  response:
    | CompletedSourceOperationResponse<SourcePlan>
    | CompletedSourceOperationResponse<RetainedPlan>,
  kind: PlanKind,
) {
  return (
    state.view !== null &&
    sameSourcePlanContext(state.view, response.state) &&
    planApplies(
      { view: response.state, confirmed: state.confirmed },
      response.result,
      kind,
    )
  );
}

function acceptPlanResponse(
  state: SourceControllerState,
  response:
    | CompletedSourceOperationResponse<SourcePlan>
    | CompletedSourceOperationResponse<RetainedPlan>,
  kind: PlanKind,
) {
  const admitted = planResponseApplies(state, response, kind);
  const accepted = acceptView(state, response.state);
  return {
    ...accepted,
    ...(kind === "source"
      ? { plan: admitted ? (response.result as SourcePlan) : null }
      : { retainedPlan: admitted ? (response.result as RetainedPlan) : null }),
    notice: admitted
      ? kind === "retained"
        ? t("変更内容を確認しました。まだ設定は記録していません。", "Changes reviewed. Settings have not been recorded yet.")
        : t("この内容でよければ確定してください。", "Confirm when you are ready to use this loadout.")
      : t("確認結果を現在の操作対象として受理できませんでした。表示を更新したため、もう一度確認してください。", "The reviewed result no longer matches the current target. The display was refreshed; review it again."),
  };
}

export function sourceControllerReducer(
  state: SourceControllerState,
  action: SourceControllerAction,
): SourceControllerState {
  if (action.type === "accept-view") return acceptView(state, action.view);
  if (action.type === "external-view") {
    const { view } = action.update;
    if (!state.view || !sameSourceContext(state.view.metadata, view.metadata)
      || state.view.source?.registration.scopeId !== view.source?.registration.scopeId) return state;
    const changed = state.view.changeVersion !== view.changeVersion;
    const page = action.favoritesChanged === false ? null : action.update.history?.favorites.data;
    const favorites = page ? mergeHistoryRows(state.favorites, page.favorites, "favoriteId") : state.favorites;
    return { ...acceptView(state, view), confirmed: state.confirmed,
      plan: changed ? null : state.plan, retainedPlan: changed ? null : state.retainedPlan,
      favorites: favorites.map(f => ({ ...f, needsAdaptation: f.normalId !== view.source?.registration.activeNormalId })),
      cursor: page ? page.nextCursor : state.cursor };
  }
  if (action.type === "favorites-followup") {
    const accepted = acceptView(state, action.response.state);
    if (action.response.status === "context-updated")
      return {
        ...accepted,
        notice:
          t("現在の設定は記録済みです。その後に接続先が変わりました。表示を更新したため、対象を確認してください。", "Current settings were recorded, then the connection changed. Review the refreshed target."),
      };
    return {
      ...accepted,
      favorites: action.response.result.favorites,
      cursor: action.response.result.nextCursor,
    };
  }
  if (action.type === "failed") {
    const { message, detail } = failureFeedback(action.error);
    return { ...state, confirmed: false, error: message, errorDetail: detail, notice: "" };
  }
  if (action.type === "clear-error") return { ...state, error: "", errorDetail: "" };
  if (action.type === "set-error") return { ...state, error: action.error, errorDetail: "" };
  if (action.type === "set-notice")
    return { ...state, notice: action.notice };
  if (action.type === "plan-response")
    return acceptPlanResponse(state, action.response, "source");
  if (action.type === "retained-plan-response")
    return acceptPlanResponse(state, action.response, "retained");
  if (action.type === "set-plan")
    return {
      ...state,
      plan: planApplies(state, action.plan, "source") ? action.plan : null,
    };
  if (action.type === "set-retained-plan")
    return {
      ...state,
      retainedPlan: planApplies(state, action.plan, "retained")
        ? action.plan
        : null,
    };
  if (action.type === "clear-plan") return { ...state, plan: null };
  if (action.type === "clear-retained-plan")
    return { ...state, retainedPlan: null };
  if (action.type === "clear-plans")
    return { ...state, plan: null, retainedPlan: null };
  if (action.type === "favorite-saved")
    return {
      ...state,
      favorites: [
        action.favorite,
        ...state.favorites.filter(
          (item) => item.favoriteId !== action.favorite.favoriteId,
        ),
      ],
    };
  return {
    ...state,
    favorites: action.append
      ? [
          ...state.favorites,
          ...action.page.favorites.filter(
            (item) =>
              !state.favorites.some(
                (existing) => existing.favoriteId === item.favoriteId,
              ),
          ),
        ]
      : action.page.favorites,
    cursor: action.page.nextCursor,
  };
}
