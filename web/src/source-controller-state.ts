import { ApiError } from "./api.ts";
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

export type SourceControllerState = {
  view: SourceView | null;
  confirmed: boolean;
  plan: SourcePlan | null;
  retainedPlan: RetainedPlan | null;
  favorites: SourceFavorite[];
  cursor: string | null;
  error: string;
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
  notice: "接続情報を確認しています。",
};

export type SourceControllerAction =
  | { type: "accept-view"; view: SourceView }
  | {
      type: "favorites-followup";
      response: SourceOperationResponse<SourceFavoritePage>;
    }
  | { type: "failed"; error: unknown }
  | { type: "clear-error" }
  | { type: "set-error"; error: string }
  | { type: "set-notice"; notice: string }
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
      ? "結果は未確認です。状態を再取得してください。自動再送は行いません。"
      : `操作を完了できませんでした（${kind}）。外部の変更を確認し、状態を再取得してください。`;
  return { message };
}

export function sourceControllerReducer(
  state: SourceControllerState,
  action: SourceControllerAction,
): SourceControllerState {
  if (action.type === "accept-view") return acceptView(state, action.view);
  if (action.type === "favorites-followup") {
    const accepted = acceptView(state, action.response.state);
    if (action.response.status === "context-updated")
      return {
        ...accepted,
        notice:
          "現在の設定は記録済みです。その後に接続先が変わりました。表示を更新したため、対象を確認してください。",
      };
    return {
      ...accepted,
      favorites: action.response.result.favorites,
      cursor: action.response.result.nextCursor,
    };
  }
  if (action.type === "failed") {
    const { message } = failureFeedback(action.error);
    return { ...state, confirmed: false, error: message, notice: message };
  }
  if (action.type === "clear-error") return { ...state, error: "" };
  if (action.type === "set-error") return { ...state, error: action.error };
  if (action.type === "set-notice")
    return { ...state, notice: action.notice };
  if (action.type === "set-plan") return { ...state, plan: action.plan };
  if (action.type === "set-retained-plan")
    return { ...state, retainedPlan: action.plan };
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
