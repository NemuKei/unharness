import { text as t } from './locale.ts';
import { ApiError } from "./api.ts";
import type { SourceMode, SourceVerification, PluginObservation, PluginCoverage } from "./sources";

export type UsageAvailability = "available" | "partial" | "unavailable";
export type RunOutcome = "accepted" | "failed" | "abandoned" | "unknown";
export type AssessmentProvenance = "user" | "agent";
export type RequirementResult = "pass" | "fail" | "unknown";

export type UsageTotals = {
  totalTokens: number | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
};

export type AvailableTurn = {
  turnId: string;
  ordinal: number;
  completed: boolean;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  responseCount: number;
  totals: UsageTotals;
};

export type RunMeasurement = {
  schemaVersion: 1;
  app: "codex-desktop";
  parserVersion: string;
  taskId: string;
  createdAt: string | null;
  runtimeVersion: string | null;
  throughTurnId: string | null;
  selectedTurnIds: string[];
  availableTurns: AvailableTurn[];
  usage: {
    availability: UsageAvailability;
    totals: UsageTotals;
    responseCount: number;
    duplicateCount: number;
    excludedCount: number;
    coverage: "recorded-root-responses";
    completeness: "unknown";
    childCoverage: "unknown";
    finalReportedThreadTotals: UsageTotals;
    reasons: string[];
  };
  time: {
    recordedTurnDurationMs: number | null;
    firstResponseMs: number | null;
    activeExecutionMs: null;
    humanWaitMs: null;
  };
  conditions: {
    model: string | null;
    reasoningEffort: string | null;
    executionPolicyDigest: string | null;
    changes: string[];
    unknown: string[];
    executionPlatform: null;
    osVersion: null;
    desktopVersion: null;
    toolState: "unknown";
    memoryInputs: "unknown";
    request: "unrecorded";
    startingFiles: "unrecorded";
    criteriaTiming: "retrospective";
  };
  output: { available: boolean; bytes: number | null; reason: string | null };
  issues: string[];
};

export type SourceAssociation = {
  scopeId: string;
  snapshotId: string;
  normalId: string;
  revision: number;
  preparationId: string | null;
  preparedMode: SourceMode;
  coverage: "initial-turn-only";
};

export type RunSource = {
  association: SourceAssociation | null;
  observation: {
    plugins?: PluginObservation[];
    coverage?: PluginCoverage;
    observationId: string;
    observedAt: string;
    status:
      | "matched-record"
      | "not-matched-record"
      | "unqualified-record"
      | "unknown-record";
    reasons: string[];
  } | null;
  issue: string | null;
};

export type RunReview = {
  reviewId: string;
  scopeId: string;
  capturedAt: string;
  collectedOn: {
    platform: string;
    kernelRelease: string;
    architecture: string;
    nodeVersion: string;
  };
  measurementKind: "observational";
  measurement: RunMeasurement;
  source: RunSource;
  verification: SourceVerification;
};

export type RunAssessment = {
  outcome: RunOutcome;
  provenance: AssessmentProvenance;
  requirements: Array<{
    id: string;
    label: string;
    critical: boolean;
    result: RequirementResult;
  }>;
  ratings: Array<{
    id: string;
    label: string;
    score: number;
    lowAnchor: string;
    highAnchor: string;
    reason: string;
  }>;
  note?: string;
};

export type SavedRun = RunReview & {
  runId: string;
  title: string | null;
  previousRunId: string | null;
  assessment: RunAssessment;
  acceptance: {
    accepted: boolean;
    basis: "reported-only" | "requirements-and-report" | "not-accepted";
    fulfilledRequirements: number;
    totalRequirements: number;
    criticalFailed: number;
    criticalUnknown: number;
  };
};

export type RunPage = { runs: SavedRun[]; nextCursor: string | null };
export type RunOutput = {
  runId: string;
  available: boolean;
  text: string | null;
  reason: string | null;
};
export type RunComparison = {
  runs: SavedRun[];
  measurementKind: "observational";
  aggregate: {
    recordCount: number;
    distinctTaskCount: number;
    acceptedCount: number;
    outcomeCounts: Record<RunOutcome, number>;
    totalTokens: number | null;
    tokensPerAcceptedRun: number | null;
    reasons: string[];
  };
  assessment: "neutral";
  creationEligible: false;
  reasons: string[];
};
export type ComparisonFavorite = {
  favoriteId: string;
  name: string;
  preparedMode: SourceMode;
  comparisonRunId: string;
  verification: SourceVerification;
};

export const defaultAssessment: RunAssessment = {
  outcome: "unknown",
  provenance: "user",
  requirements: [],
  ratings: [],
  note: "",
};

export const outcomeLabels: Record<RunOutcome, string> = {
  get accepted() { return t("採用", "Accepted"); },
  get failed() { return t("不採用", "Rejected"); },
  get abandoned() { return t("中断", "Abandoned"); },
  get unknown() { return t("未判断", "Undecided"); },
};
export const provenanceLabels: Record<AssessmentProvenance, string> = {
  get user() { return t("ユーザーの評価", "User assessment"); },
  get agent() { return t("AIの評価", "AI assessment"); },
};
export const requirementLabels: Record<RequirementResult, string> = {
  get pass() { return t("満たした", "Met"); },
  get fail() { return t("満たさない", "Not met"); },
  get unknown() { return t("不明", "Unknown"); },
};

const comparisonMutations = new Set([
  "review-run",
  "save-run",
  "run-favorite",
]);
export function isComparisonMutation(action: string) {
  return comparisonMutations.has(action);
}

export const aggregateReasonLabels: Record<string, string> = {
  get "different-source-scopes"() { return t("登録した指示・Skillの範囲が異なるため、まとめて効率を評価できません。", "Registered instruction/Skill scopes differ, so efficiency cannot be aggregated."); },
  get "overlapping-task-records"() { return t("同じタスクの版またはカットオフが重なっているため、独立した標本として合計しません。", "Versions or cutoffs overlap within the same task and cannot be counted as independent samples."); },
  get "usage-unavailable-or-partial"() { return t("使用量が不明または一部だけの記録があるため、合計は不明です。", "Some usage is unknown or partial, so the total is unknown."); },
  get "usage-total-overflow"() { return t("安全に合計できないため、合計は不明です。", "A reliable aggregate is unavailable, so the total is unknown."); },
  get "no-accepted-runs"() { return t("採用として数えられる記録がないため、採用1件あたりは不明です。", "No records qualify as accepted, so per-acceptance usage is unknown."); },
  get "predeclared-comparable-evidence-required"() { return t("事前に揃えた条件での比較ではないため、優劣や作成資格は判定しません。", "Conditions were not aligned beforehand; no ranking or artwork eligibility is assigned."); },
};

export function comparisonErrorMessage(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : "request-failed";
  if (error instanceof ApiError && error.disposition === "uncertain")
    return t("操作結果を確認できません。自動では再送しません。履歴と状態を再取得して確認してください。", "Operation result unconfirmed. No automatic retry is sent. Refresh history and state to check.");
  if (kind === "comparison-source-unavailable")
    return t("この記録には保存できる設定の一致証拠がありません。記録の評価はそのまま確認できます。", "This record lacks matching evidence for a saveable loadout. Its assessment remains available.");
  if (kind.includes("cutoff"))
    return t("選んだ完了位置をこのタスク記録で確認できません。表示されたターンから選び直してください。", "The selected completion point is unconfirmed in this record. Choose a displayed turn again.");
  if (kind.includes("task") || kind.includes("record"))
    return t("この記録を確認できません。タスクUUID、完了位置、保存済みの版を確認してください。", "This record could not be verified. Check the task UUID, completion point and saved version.");
  if (kind.includes("context") || kind.includes("scope"))
    return t("接続先が変わりました。現在の対象を確認してから、もう一度操作してください。", "The connection changed. Review the current target before retrying.");
  return t(`比較記録の操作を完了できませんでした（${kind}）。`, `Comparison operation failed (${kind}).`);
}

export function formatNumber(value: number | null) {
  return value === null ? t("不明", "Unknown") : new Intl.NumberFormat(t("ja-JP", "en-US")).format(value);
}

export function formatDuration(value: number | null) {
  if (value === null) return t("不明", "Unknown");
  return value < 1000
    ? `${value} ms`
    : t(`${new Intl.NumberFormat(t("ja-JP", "en-US"), { maximumFractionDigits: 1 }).format(value / 1000)} 秒`, `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value / 1000)} s`);
}

export function historicalMode(
  value: Pick<RunReview, "source">,
): SourceMode | null {
  return value.source.association?.preparedMode ?? null;
}

export function tokenBarPercent(value: number | null, maximum: number) {
  if (value === null) return null;
  if (value === 0) return 0;
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;
  return Math.min(100, (value / maximum) * 100);
}

export function reviewCutoffForTask(
  review: Pick<RunReview, "measurement"> | null,
  taskId: string,
  throughTurnId: string,
) {
  return review &&
    review.measurement.taskId.toLowerCase() === taskId.trim().toLowerCase() &&
    throughTurnId
    ? throughTurnId
    : undefined;
}

const conditionLabels: Record<string, string> = {
  get model() { return t("モデル", "Model"); },
  get reasoningEffort() { return t("推論設定", "Reasoning setting"); },
  get executionPolicy() { return t("実行ポリシー", "Execution policy"); },
};

export function conditionEvidence(
  conditions: Pick<
    RunMeasurement["conditions"],
    | "model"
    | "reasoningEffort"
    | "executionPolicyDigest"
    | "changes"
    | "unknown"
  >,
) {
  const list = (values: string[]) =>
    values.length
      ? values.map((value) => conditionLabels[value] ?? value).join("、")
      : t("なし", "None");
  return {
    initialModel: conditions.model ?? t("不明", "Unknown"),
    initialReasoningEffort: conditions.reasoningEffort ?? t("不明", "Unknown"),
    initialExecutionPolicy: conditions.executionPolicyDigest
      ? t("記録あり", "Recorded")
      : t("不明", "Unknown"),
    changed: list(conditions.changes),
    unknown: list(conditions.unknown),
  };
}

export function runReferenceLabel(
  runId: string,
  runs: Array<{ runId: string; title: string | null }>,
) {
  const run = runs.find((candidate) => candidate.runId === runId);
  return `${run?.title ?? t("名称なし", "Untitled")} ／ ${runId.slice(0, 12)}`;
}
