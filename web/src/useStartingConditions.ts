import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { comparisonContextKey } from "./useComparisonController";
import type { useSourceController } from "./useSourceController";
import { isStartingMutation, startingErrorMessage } from "./starting-conditions";
import { mergeHistoryRows } from "./source-updates";
import type { StartingDeclaration, StartingReview, SavedStart, StartingDetail, StartingPage } from "./starting-conditions";

type SharedController = ReturnType<typeof useSourceController>;
type State = {
  review: StartingReview | null; lastSaved: SavedStart | null;
  starts: SavedStart[]; cursor: string | null; detail: StartingDetail | null;
  error: string; backgroundError: string; notice: string; uncertain: boolean;
};
export function useStartingConditions(shared: SharedController) {
  const [state, setState] = useState<State>({ review: null, lastSaved: null, starts: [], cursor: null, detail: null, error: "", backgroundError: "", notice: "", uncertain: false });
  const draftGeneration = useRef(0), detailGeneration = useRef(0);
  const pendingReviewGeneration = useRef<number | null>(null);
  const reviewRef = useRef(state.review), keyRef = useRef("");
  reviewRef.current = state.review;
  keyRef.current = comparisonContextKey(shared.view);
  const externalSignature = useRef("");
  useEffect(() => {
    const update = shared.externalUpdate, page = update?.history?.starts;
    if (!update || !page || comparisonContextKey(update.view) !== keyRef.current) return;
    const signature = JSON.stringify([keyRef.current, update.versions.starts, page.error?.kind]);
    if (signature === externalSignature.current) return;
    externalSignature.current = signature;
    setState(s => page.error ? { ...s, backgroundError: "開始条件の履歴を自動更新できません。一覧を読み直してください。" }
      : { ...s, starts: mergeHistoryRows(s.starts, page.data.starts, "startId"), cursor: page.data.nextCursor, backgroundError: "" });
  }, [shared.externalUpdate]);

  async function execute<T>(operation: string, input: object, isCurrent = () => true, afterSaved = false): Promise<T | null> {
    const key = keyRef.current, scopeId = shared.view?.source?.registration.scopeId;
    if (!scopeId) return null;
    setState(s => ({ ...s, error: "" }));
    const response = await shared.executeComparison<T>(operation, input);
    if (keyRef.current !== key || !isCurrent() || response.status === "context-updated") return null;
    if (response.status === "failed") {
      setState(s => ({ ...s,
        error: afterSaved ? "保存は確認済みです。開始条件の一覧だけを更新できませんでした。" : startingErrorMessage(response.error, operation),
        notice: afterSaved ? s.notice : "",
        uncertain: isStartingMutation(operation) ? !(response.error instanceof ApiError) || response.error.disposition === "uncertain" : s.uncertain
      }));
      return null;
    }
    if (comparisonContextKey(response.state) !== key) return null;
    const result = response.result as { scopeId?: string; starts?: Array<{ scopeId: string }> };
    if (operation === "starts" ? !Array.isArray(result?.starts) || result.starts.some(s => s.scopeId !== scopeId) : result?.scopeId !== scopeId) {
      setState(s => ({ ...s, error: afterSaved ? "保存は確認済みですが、一覧を確認できませんでした。" : "接続先に対応する開始条件を確認できませんでした。", notice: afterSaved ? s.notice : "", uncertain: isStartingMutation(operation) || s.uncertain }));
      return null;
    }
    return response.result;
  }
  function invalidateReview() {
    ++draftGeneration.current; reviewRef.current = null;
    const pending = pendingReviewGeneration.current !== null;
    setState(s => ({ ...s, review: null, error: "", notice: s.review || pending ? "入力が変わったため、保存内容を確認し直してください。" : s.notice }));
  }
  async function review(declaration: StartingDeclaration, additionalPaths: string[]) {
    const generation = ++draftGeneration.current;
    pendingReviewGeneration.current = generation;
    reviewRef.current = null;
    setState(s => ({ ...s, review: null, notice: "開始時のファイルを読み取り、内容を確認しています。", uncertain: false }));
    let result: StartingReview | null;
    try { result = await execute<StartingReview>("review-start", { declaration, additionalPaths }, () => generation === draftGeneration.current); }
    finally { if (pendingReviewGeneration.current === generation) pendingReviewGeneration.current = null; }
    if (result) {
      reviewRef.current = result;
      setState(s => ({ ...s, review: result, notice: "対象と条件を確認できました。内容を確認して保存してください。" }));
    }
  }
  async function load(after?: string, afterSaved = false) {
    const page = await execute<StartingPage>("starts", after ? { after } : {}, undefined, afterSaved);
    if (!page) return;
    setState(s => {
      const starts = after ? [...s.starts, ...page.starts.filter(p => !s.starts.some(old => old.startId === p.startId))] : page.starts;
      const confirmed = s.uncertain && s.review ? starts.find(p => p.reviewId === s.review!.reviewId) : undefined;
      return { ...s, starts, cursor: page.nextCursor, ...(confirmed ? { lastSaved: confirmed, uncertain: false, notice: "保存履歴で開始条件の保存を確認しました。" } : {}) };
    });
  }
  async function save() {
    const current = reviewRef.current;
    if (!current) return;
    const saved = await execute<SavedStart>("save-start", { reviewId: current.reviewId });
    if (!saved) return;
    setState(s => ({ ...s, lastSaved: saved, starts: [saved, ...s.starts.filter(item => item.startId !== saved.startId)], uncertain: false,
      notice: "開始条件を保存しました。タスクはまだ開始していません。" }));
    await load(undefined, true);
  }
  async function read(startId: string) {
    const generation = ++detailGeneration.current;
    setState(s => ({ ...s, detail: null }));
    const result = await execute<StartingDetail>("start", { startId }, () => detailGeneration.current === generation);
    if (result) setState(s => ({ ...s, detail: result }));
  }
  return { state, invalidateReview, review, save, load, read };
}
