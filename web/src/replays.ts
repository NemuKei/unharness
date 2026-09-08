import { ApiError } from "./api.ts";
import type { SourceMode, SourceView } from "./sources";
import type { RunMeasurement, RunOutcome, RequirementResult, AssessmentProvenance } from "./comparisons";
import type { StartingDeclaration } from "./starting-conditions";
export type ReplayBudget = StartingDeclaration["budget"];
export type ReplayReview = {
  scopeId: string; reviewId: string; startId: string; phase: "reviewed"; preparedMode: SourceMode; snapshotId: string;
  revision: number; createdAt: string; repositoryKind: "git" | "directory"; gitPinnedAt: string; gitRevision: string | null;
  fileCount: number; totalBytes: number; budget: ReplayBudget;
  sourceMappings: Array<{ sourceId: string; expected: string; strategy: string }>;
  changes: Array<{ sourceId: string; path: string; reason: string }>;
};
export type ReplayPhase = "preparing" | "prepared" | "ready" | "preparation-failed" | "cancelled" | "recorded";
export type ReplayAttempt = {
  scopeId: string; attemptId: string; reviewId: string; startId: string; phase: ReplayPhase; preparedMode: SourceMode; snapshotId: string;
  createdAt: string; preparedAt: string | null; readyAt: string | null; cancelledAt: string | null;
  failure: string | null; conditionIssue: string | null; locationIssue: string | null; project: string | null;
  handoffAvailable: boolean; resultId: string | null; budget: ReplayBudget;
};
export type ReplayHandoff = ReplayAttempt & { request: string; project: string; submission: "user-starts-fresh-desktop-task" };
export type ReplayPage = { scopeId: string; activeAttemptId: string | null; activeAttempt: ReplayAttempt | null; attempts: ReplayAttempt[]; nextCursor: string | null };
export type ReplayAssessment = {
  outcome: RunOutcome; provenance: AssessmentProvenance; requirements: Array<{ id: string; result: RequirementResult }>;
  ratings: Array<{ id: string; score: number | null; reason: string }>; note?: string;
};
export type ReplayQualification = { status: "matched-record" | "not-matched-record" | "unqualified-record" | "unknown-record"; reasons: string[] };
export type ReplayResultReview = {
  scopeId: string; resultReviewId: string; attemptId: string; startId: string; taskId: string; capturedAt: string; preparedMode: SourceMode;
  readIssue: string | null; sourceIssue: string | null; measurement: RunMeasurement | null; outputText: string | null;
  qualification: ReplayQualification; criteria: StartingDeclaration;
  files: { manifestId: string | null; capturedAt: string | null; issue: string | null; fileCount: number | null; totalBytes: number | null; ignoredFiles: string };
  budget: { status: "within-recorded-budget" | "exceeded" | "unknown"; recordedTurns: number | null; recordedTokens: number | null };
};
export type ReplayResult = ReplayResultReview & {
  resultId: string; previousResultId: string | null; assessment: ReplayAssessment;
  acceptance: { accepted: boolean; reasons: string[] }; creationEligible: false;
};
export type ReplayComparison = {
  scopeId: string; results: Array<Omit<ReplayResult, "outputText" | "criteria"> & { criteria: Omit<StartingDeclaration, "request"> }>;
  aggregate: { recordCount: number; acceptedCount: number; totalTokens: number | null; tokensPerAcceptedRun: number | null; reasons: string[] };
  reasons: string[]; assessment: "neutral"; creationEligible: false;
};
export const phaseLabels: Record<ReplayPhase, string> = { preparing: "準備中・要確認", prepared: "作業場所の準備済み", ready: "新規タスクの実行待ち", "preparation-failed": "準備を完了できませんでした", cancelled: "取り消し済み", recorded: "結果を保存済み" };
export const qualificationLabels: Record<ReplayQualification["status"], string> = { "matched-record": "記録上の条件が一致", "not-matched-record": "記録上の条件が不一致", "unqualified-record": "この試行の対象外", "unknown-record": "条件を確認できません" };
export const isReplayMutation = (op: string) => !["replays", "replay", "replay-result", "compare-replays"].includes(op);
export function replayPreparationKey(view: SourceView | null) {
  const s = view?.source;
  return JSON.stringify([view?.metadata.launchId, view?.metadata.contextId, s?.registration.scopeId, s?.registration.activeNormalId,
    s?.revision, s?.preparedMode, s?.preparation?.id, s?.conflict?.kind, s?.recovery.pending]);
}
export function replayError(error: unknown) {
  if (!(error instanceof ApiError) || error.disposition === "uncertain") return "操作結果は未確認です。再実行の履歴を読み、保存状態を確認してください。";
  return replayIssue(error.kind);
}
export function replayIssue(kind: string) {
  const labels: Record<string, string> = {
    "replay-active-attempt": "別の再実行が進行中です。結果を保存するか、取り消してから次を準備してください。",
    "replay-preparation-stale": "装備の準備状態が変わりました。再実行の内容を確認し直してください。",
    "replay-attempt-budget-exhausted": "この開始条件とモードの試行上限に達しました。",
    "replay-destination-changed": "確認後に作業場所のファイルが変わりました。変更は保持しています。",
    "replay-git-state-changed": "開始前のGit状態が変わりました。変更は保持しています。",
    "replay-record-invalid": "再実行の保存記録を確認できません。設定の復帰は「装備」で利用できます。",
    "replay-retained-conditions-changed": "プロジェクトの指示や共通設定が変わり、同じ開始条件を確認できません。",
    "replay-native-conditions-unavailable": "Codexの設定やソース情報を確認できません。",
    "replay-desktop-open-unavailable": "インストール済みのMac版Codexを開けません。下の作業場所を手動で開いてください。",
    "source-conflict": "外部で設定が変更されています。「装備」で内容を確認してください。",
    "recovery-required": "「装備」で保留中の復帰を確認してください。",
    "replay-task-record-unavailable": "指定したタスクのローカル記録が見つかりません。",
    "replay-task-record-invalid": "指定したタスクの記録を読み取れません。",
    "replay-task-record-changed": "取り込み中にタスクの記録が変わりました。完了後に確認し直してください。",
    "replay-assessment-conflict": "結果の保存版が変わっています。履歴から現在の結果を開き直してください。",
    "replay-result-unavailable": "この記録から試行時の設定を確定できません。",
  };
  return labels[kind] ?? `確認できない条件があります（${kind}）。`;
}
const hash = (x: unknown) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const mode = (x: unknown) => typeof x === "string" && ["normal", "unseal", "trueform"].includes(x);
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
const text = (x: unknown) => typeof x === "string";
const nullableText = (x: unknown) => x === null || text(x);
const count = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
const nullableCount = (x: unknown) => x === null || count(x);
const nullableMetric = (x: unknown) => x === null || typeof x === "number" && Number.isFinite(x) && x >= 0;
const strings = (x: unknown) => Array.isArray(x) && x.every(text);
const utc = (x: unknown) => typeof x === "string" && Number.isFinite(Date.parse(x));
const uuid = (x: unknown) => typeof x === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(x);
const oneOf = (x: unknown, values: string[]) => typeof x === "string" && values.includes(x);
const labeled = (x: unknown): x is Record<string, unknown> => object(x) && text(x.id) && text(x.label);
function declaredBudget(x: unknown) {
  return object(x) && count(x.maxAttempts) && x.maxAttempts >= 1 && x.maxAttempts <= 20
    && count(x.maxTurnsPerAttempt) && x.maxTurnsPerAttempt >= 1 && x.maxTurnsPerAttempt <= 100
    && (x.maxRecordedTokens === null || count(x.maxRecordedTokens) && x.maxRecordedTokens > 0);
}
function attempt(x: unknown): boolean {
  if (!object(x)) return false;
  return hash(x.scopeId) && hash(x.attemptId) && hash(x.reviewId) && hash(x.startId) && hash(x.snapshotId) && mode(x.preparedMode)
    && typeof x.phase === "string" && Object.hasOwn(phaseLabels, x.phase)
    && typeof x.handoffAvailable === "boolean" && nullableText(x.project) && declaredBudget(x.budget)
    && utc(x.createdAt) && [x.preparedAt, x.readyAt, x.cancelledAt].every(v => v === null || utc(v))
    && [x.failure, x.conditionIssue, x.locationIssue].every(nullableText) && (x.resultId === null || hash(x.resultId));
}
function result(x: unknown, body = true, saved = false): boolean {
  if (!object(x) || !hash(x.scopeId) || !hash(x.startId) || !hash(x.resultReviewId) || !hash(x.attemptId) || !uuid(x.taskId)
    || !utc(x.capturedAt) || !mode(x.preparedMode) || !nullableText(x.sourceIssue) || !nullableText(x.readIssue) || x.creationEligible !== false
    || !object(x.criteria) || !Array.isArray(x.criteria.requirements) || x.criteria.requirements.length > 24
    || !x.criteria.requirements.every(r => labeled(r) && typeof r.critical === "boolean")
    || !Array.isArray(x.criteria.ratings) || x.criteria.ratings.length > 8
    || !x.criteria.ratings.every(r => labeled(r) && text(r.lowAnchor) && text(r.highAnchor)) || !declaredBudget(x.criteria.budget)
    || !object(x.qualification) || typeof x.qualification.status !== "string" || !Object.hasOwn(qualificationLabels, x.qualification.status) || !strings(x.qualification.reasons)
    || !object(x.files) || !nullableText(x.files.issue) || !nullableCount(x.files.fileCount) || !nullableCount(x.files.totalBytes) || !text(x.files.ignoredFiles)
    || !object(x.budget) || !oneOf(x.budget.status, ["within-recorded-budget", "exceeded", "unknown"])
    || !nullableCount(x.budget.recordedTurns) || !nullableCount(x.budget.recordedTokens)) return false;
  if (body && (typeof x.criteria.request !== "string" || !nullableText(x.outputText))) return false;
  if (x.measurement !== null) {
    const m = x.measurement;
    if (!object(m) || m.taskId !== x.taskId || !object(m.usage) || !object(m.usage.totals) || !nullableCount(m.usage.totals.totalTokens)
      || !object(m.time) || !nullableMetric(m.time.recordedTurnDurationMs) || !object(m.conditions)
      || !nullableText(m.conditions.model) || !nullableText(m.conditions.reasoningEffort)) return false;
  }
  if (!saved) return !Object.hasOwn(x, "resultId");
  const a = x.assessment;
  return hash(x.resultId) && (x.previousResultId === null || hash(x.previousResultId)) && object(x.acceptance)
    && typeof x.acceptance.accepted === "boolean" && strings(x.acceptance.reasons) && object(a)
    && oneOf(a.outcome, ["accepted", "failed", "abandoned", "unknown"]) && oneOf(a.provenance, ["user", "agent"])
    && (!Object.hasOwn(a, "note") || text(a.note))
    && Array.isArray(a.requirements) && a.requirements.length === x.criteria.requirements.length
    && a.requirements.every((r, i) => object(r) && object(x.criteria) && Array.isArray(x.criteria.requirements)
      && r.id === x.criteria.requirements[i].id && oneOf(r.result, ["pass", "fail", "unknown"]))
    && Array.isArray(a.ratings) && a.ratings.length === x.criteria.ratings.length
    && a.ratings.every((r, i) => object(r) && object(x.criteria) && Array.isArray(x.criteria.ratings)
      && r.id === x.criteria.ratings[i].id && (r.score === null || count(r.score) && r.score >= 1 && r.score <= 5) && text(r.reason));
}
function matchesRequest(op: string, x: Record<string, unknown>, input: object) {
  const expected = input as Record<string, unknown>;
  for (const key of ["startId", "attemptId", "reviewId", "taskId", "resultReviewId", "resultId", "previousResultId"])
    if (Object.hasOwn(expected, key) && x[op === "replay-favorite" && key === "resultId" ? "replayResultId" : key] !== expected[key]) return false;
  return op !== "compare-replays" || !Object.hasOwn(expected, "resultIds") || Array.isArray(x.results) && Array.isArray(expected.resultIds)
    && x.results.length === expected.resultIds.length && x.results.every((r, i) => object(r) && Array.isArray(expected.resultIds) && r.resultId === expected.resultIds[i]);
}
export function validReplayResponse(op: string, x: unknown, scopeId: string, input: object = {}): boolean {
  if (!object(x) || x.scopeId !== scopeId) return false;
  if (!matchesRequest(op, x, input)) return false;
  if (op === "review-replay") return hash(x.reviewId) && hash(x.startId) && x.phase === "reviewed" && mode(x.preparedMode) && declaredBudget(x.budget)
    && count(x.fileCount) && count(x.totalBytes) && Array.isArray(x.changes) && x.changes.every(c => object(c) && text(c.path) && text(c.reason));
  if (op === "replays") return Array.isArray(x.attempts) && x.attempts.every(a => attempt(a) && object(a) && a.scopeId === scopeId)
    && (x.activeAttemptId === null ? x.activeAttempt === null : hash(x.activeAttemptId) && attempt(x.activeAttempt)
      && object(x.activeAttempt) && x.activeAttempt.scopeId === scopeId && x.activeAttempt.attemptId === x.activeAttemptId)
    && (x.nextCursor === null || hash(x.nextCursor));
  if (["prepare-replay", "replay", "cancel-replay"].includes(op)) return attempt(x);
  if (["handoff-replay", "open-replay"].includes(op)) return attempt(x) && x.phase === "ready" && typeof x.request === "string" && typeof x.project === "string"
    && (op !== "open-replay" || x.desktopOpenRequested === true && x.taskSubmitted === false && x.desktopHomeVerified === false);
  if (["observe-replay", "save-replay-result", "replay-result"].includes(op)) return result(x, true, op !== "observe-replay");
  if (op === "compare-replays") return Array.isArray(x.results) && x.results.length >= 1 && x.results.length <= 3
    && x.results.every(r => result(r, false, true) && object(r) && r.scopeId === scopeId) && x.assessment === "neutral" && x.creationEligible === false
    && object(x.aggregate) && strings(x.aggregate.reasons) && count(x.aggregate.recordCount) && count(x.aggregate.acceptedCount)
    && nullableCount(x.aggregate.totalTokens) && nullableMetric(x.aggregate.tokensPerAcceptedRun);
  if (op === "replay-favorite") return hash(x.favoriteId) && typeof x.name === "string" && mode(x.preparedMode);
  return false;
}
