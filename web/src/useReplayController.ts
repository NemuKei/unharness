import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { comparisonContextKey } from "./useComparisonController";
import type { useSourceController } from "./useSourceController";
import { isReplayMutation, replayError, replayPreparationKey, validReplayResponse } from "./replays";
import { mergeHistoryRows } from "./source-updates";
import type { ReplayReview, ReplayAttempt, ReplayPage, ReplayHandoff, ReplayResultReview, ReplayResult, ReplayAssessment, ReplayComparison } from "./replays";
type Shared = ReturnType<typeof useSourceController>;
type State = { review: ReplayReview | null; attempt: ReplayAttempt | null; handoff: ReplayHandoff | null;
  attempts: ReplayAttempt[]; activeAttemptId: string | null; cursor: string | null;
  resultReview: ReplayResultReview | null; result: ReplayResult | null; lastSaved: ReplayResult | null;
  comparison: ReplayComparison | null; selected: string[]; error: string; backgroundError: string; notice: string; uncertain: string | null };
export function useReplayController(shared: Shared) {
  const [state, setState] = useState<State>({ review: null, attempt: null, handoff: null, attempts: [], activeAttemptId: null, cursor: null,
    resultReview: null, result: null, lastSaved: null, comparison: null, selected: [], error: "", backgroundError: "", notice: "", uncertain: null });
  const latest = useRef(state), view = useRef(shared.view), alive = useRef(true), preparationGeneration = useRef(0), resultGeneration = useRef(0);
  latest.current = state; view.current = shared.view;
  const preparationKey = replayPreparationKey(shared.view);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    ++preparationGeneration.current;
    setState(s => ({ ...s, review: null, handoff: null,
      notice: s.review || s.handoff ? "装備の状態が変わりました。開始状態を確認し直してください。" : s.notice }));
  }, [preparationKey]);
  const externalSignature = useRef("");
  useEffect(() => {
    const update = shared.externalUpdate, page = update?.history?.replays;
    if (!update || !page || comparisonContextKey(update.view) !== comparisonContextKey(view.current)) return;
    const signature = JSON.stringify([comparisonContextKey(update.view), update.versions.replays, page.error?.kind]);
    if (signature === externalSignature.current) return;
    externalSignature.current = signature;
    if (page.error) { setState(s => ({ ...s, backgroundError: "再実行の履歴を自動更新できません。履歴を読み直してください。" })); return; }
    const data = page.data;
    setState(s => {
      const attempts = mergeHistoryRows(s.attempts, data.attempts, "attemptId");
      const attempt = s.attempt ? attempts.find(a => a.attemptId === s.attempt!.attemptId) ?? s.attempt : data.activeAttempt;
      const selected = s.selected.filter(id => attempts.some(a => a.resultId === id));
      const resultChanged = s.resultReview && attempts.some(a => a.attemptId === s.resultReview!.attemptId && a.phase === "recorded");
      return { ...s, attempts, attempt, cursor: data.nextCursor, activeAttemptId: data.activeAttemptId, selected,
        comparison: selected.length === s.selected.length ? s.comparison : null,
        review: data.activeAttemptId ? null : s.review,
        handoff: s.handoff && attempts.some(a => a.attemptId === s.handoff!.attemptId && !a.handoffAvailable) ? null : s.handoff,
        resultReview: resultChanged ? null : s.resultReview, backgroundError: "",
        notice: resultChanged ? "この試行の保存状態が変わりました。履歴から保存済みの結果を確認してください。" : s.notice };
    });
  }, [shared.externalUpdate]);
  async function execute<T>(op: string, input: object, options: { preparation?: boolean; current?: () => boolean; afterSaved?: boolean } = {}): Promise<T | null> {
    const context = comparisonContextKey(view.current), preparation = replayPreparationKey(view.current), scope = view.current?.source?.registration.scopeId;
    if (!scope) return null;
    setState(s => ({ ...s, error: "" }));
    const response = await shared.executeComparison<T>(op, input);
    if (!alive.current || comparisonContextKey(view.current) !== context || options.current && !options.current()) return null;
    if (response.status === "context-updated") return null;
    if (response.status === "failed") {
      setState(s => ({ ...s, error: options.afterSaved ? "操作の完了は確認済みです。履歴だけを更新できませんでした。" : replayError(response.error),
        notice: options.afterSaved ? s.notice : "", uncertain: isReplayMutation(op) && (!(response.error instanceof ApiError) || response.error.disposition === "uncertain") ? op : s.uncertain }));
      return null;
    }
    if (comparisonContextKey(response.state) !== context) return null;
    if (options.preparation && (replayPreparationKey(response.state) !== preparation || replayPreparationKey(view.current) !== preparation)) {
      setState(s => ({ ...s, review: null, handoff: null, notice: "装備の状態が変わりました。再実行の内容を確認し直してください。" })); return null;
    }
    if (!validReplayResponse(op, response.result, scope, input, view.current?.source?.registration.previousScopeIds)) {
      setState(s => ({ ...s, error: "再実行の応答を確認できません。履歴を読み直してください。", notice: options.afterSaved ? s.notice : "",
        uncertain: isReplayMutation(op) ? op : s.uncertain })); return null;
    }
    return response.result;
  }
  async function load(after?: string, afterSaved = false) {
    const page = await execute<ReplayPage>("replays", after ? { after } : {}, { afterSaved });
    if (!page) return;
    setState(s => ({ ...s, attempts: after ? [...s.attempts, ...page.attempts.filter(a => !s.attempts.some(old => old.attemptId === a.attemptId))] : page.attempts,
      cursor: page.nextCursor, activeAttemptId: page.activeAttemptId,
      attempt: page.activeAttempt ?? (s.attempt ? page.attempts.find(a => a.attemptId === s.attempt!.attemptId) ?? s.attempt : null),
      selected: after ? s.selected : s.selected.filter(id => page.attempts.some(a => a.resultId === id)),
      review: page.activeAttemptId ? null : s.review,
      resultReview: page.attempts.some(a => a.attemptId === s.resultReview?.attemptId && a.phase === "recorded") ? null : s.resultReview,
      handoff: page.attempts.some(a => a.attemptId === s.handoff?.attemptId && !a.handoffAvailable) ? null : s.handoff,
      uncertain: s.uncertain === "replay-favorite" ? s.uncertain : null,
      notice: afterSaved ? s.notice : "再実行の保存状態を読みました。" }));
  }
  async function review(startId: string) {
    const generation = ++preparationGeneration.current;
    setState(s => ({ ...s, review: null, handoff: null, notice: "現在の装備で再実行できるか確認しています。" }));
    const value = await execute<ReplayReview>("review-replay", { startId }, { preparation: true, current: () => generation === preparationGeneration.current });
    if (value) setState(s => ({ ...s, review: value, uncertain: null, notice: "準備内容を確認してください。タスクはまだ開始していません。" }));
  }
  async function prepare() {
    const r = latest.current.review; if (!r) return;
    const p = await execute<ReplayAttempt>("prepare-replay", { reviewId: r.reviewId }, { preparation: true });
    if (p) {
      setState(s => ({ ...s, review: null, attempt: p, handoff: null, activeAttemptId: ["prepared", "ready", "preparing"].includes(p.phase) ? p.attemptId : null,
        attempts: [p, ...s.attempts.filter(a => a.attemptId !== p.attemptId)], resultReview: null, result: null, uncertain: null, notice: "作業場所の準備状態を保存しました。" }));
    }
  }
  async function handoff(open = false, copy = false) {
    const attempt = latest.current.attempt; if (!attempt) return;
    setState(s => ({ ...s, notice: "ファイルと設定の開始状態を確認しています。" }));
    const h = await execute<ReplayHandoff>(open ? "open-replay" : "handoff-replay", { attemptId: attempt.attemptId }, { preparation: true });
    if (!h) { if (alive.current) setState(s => ({ ...s, handoff: null })); return; }
    setState(s => ({ ...s, attempt: h, handoff: h, uncertain: null, notice: open
      ? "作業場所をCodexに引き渡しました。新しいタスクに依頼文を貼り付けて実行してください。" : "開始状態を確認しました。新しいタスクで、この依頼を実行してください。" }));
    if (copy) {
      try { await navigator.clipboard.writeText(h.request); if (alive.current) setState(s => ({ ...s, notice: "再実行の依頼をコピーしました。" })); }
      catch { if (alive.current) setState(s => ({ ...s, error: "コピーできませんでした。表示した依頼文を選択してコピーしてください。" })); }
    }
  }
  async function inspect(attemptId: string) {
    const generation = ++resultGeneration.current;
    const a = await execute<ReplayAttempt>("replay", { attemptId }, { current: () => generation === resultGeneration.current });
    if (a) setState(s => ({ ...s, attempt: a, handoff: null, resultReview: null, result: null }));
  }
  async function cancel() {
    const a = latest.current.attempt; if (!a) return;
    const result = await execute<ReplayAttempt>("cancel-replay", { attemptId: a.attemptId });
    if (result) {
      setState(s => ({ ...s, attempt: result, handoff: null, resultReview: null, uncertain: null,
        activeAttemptId: s.activeAttemptId === result.attemptId ? null : s.activeAttemptId,
        notice: "試行を取り消しました。ファイルは保持しています。Codexの実行中タスクは停止していません。" }));
      await load(undefined, true);
    }
  }
  function invalidateResult() { ++resultGeneration.current; setState(s => ({ ...s, resultReview: null, notice: "タスクが変わりました。記録を確認し直してください。" })); }
  async function observe(taskId: string) {
    const a = latest.current.attempt; if (!a) return;
    const generation = ++resultGeneration.current;
    setState(s => ({ ...s, resultReview: null, result: null, notice: "タスクの記録と成果物を確認しています。" }));
    const r = await execute<ReplayResultReview>("observe-replay", { attemptId: a.attemptId, taskId }, { current: () => generation === resultGeneration.current });
    if (r && r.attemptId === a.attemptId && r.taskId === taskId) setState(s => ({ ...s, resultReview: r, uncertain: null, notice: "記録を取り込みました。保存前に結果を評価してください。" }));
  }
  async function save(assessment: ReplayAssessment) {
    const r = latest.current.resultReview ?? latest.current.result; if (!r) return;
    const previousResultId = latest.current.result?.resultId;
    const saved = await execute<ReplayResult>("save-replay-result", { resultReviewId: r.resultReviewId, assessment, ...(previousResultId ? { previousResultId } : {}) });
    if (saved) {
      setState(s => ({ ...s, lastSaved: saved, result: saved, resultReview: null, handoff: null, uncertain: null,
        attempt: s.attempt?.attemptId === saved.attemptId ? { ...s.attempt, phase: "recorded", resultId: saved.resultId, handoffAvailable: false } : s.attempt,
        activeAttemptId: s.activeAttemptId === saved.attemptId ? null : s.activeAttemptId,
        notice: "再実行の結果を保存しました。" }));
      await load(undefined, true);
    }
  }
  async function readResult(resultId: string) {
    const generation = ++resultGeneration.current;
    setState(s => ({ ...s, resultReview: null, result: null, notice: "保存した結果を読み込んでいます。" }));
    const r = await execute<ReplayResult>("replay-result", { resultId }, { current: () => generation === resultGeneration.current });
    if (r) setState(s => ({ ...s, result: r, notice: "保存した再実行の結果を開きました。" }));
  }
  function select(resultId: string, checked: boolean) {
    setState(s => ({ ...s, comparison: null, selected: checked ? [...s.selected.filter(id => id !== resultId), resultId].slice(0, 3) : s.selected.filter(id => id !== resultId) }));
  }
  async function compare() {
    const resultIds = latest.current.selected;
    const r = await execute<ReplayComparison>("compare-replays", { resultIds }, { current: () => latest.current.selected.join() === resultIds.join() });
    if (r) setState(s => ({ ...s, comparison: r }));
  }
  async function favorite() {
    const r = latest.current.result; if (!r) return;
    const saved = await execute<{ name: string }>("replay-favorite", { resultId: r.resultId });
    if (saved) setState(s => ({ ...s, uncertain: null, notice: "試行時の設定をお気に入りに保存しました。「装備」で読み込めます。" }));
  }
  return { state, load, review, prepare, handoff, inspect, cancel, observe, invalidateResult, save, readResult, select, compare, favorite };
}
