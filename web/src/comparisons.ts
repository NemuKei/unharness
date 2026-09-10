import { ApiError } from "./api.ts";
import type { SourceMode, SourceVerification } from "./sources";

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
  accepted: "採用",
  failed: "不採用",
  abandoned: "中断",
  unknown: "未判断",
};
export const provenanceLabels: Record<AssessmentProvenance, string> = {
  user: "ユーザーの評価",
  agent: "AIの評価",
};
export const requirementLabels: Record<RequirementResult, string> = {
  pass: "満たした",
  fail: "満たさない",
  unknown: "不明",
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
  "different-source-scopes": "登録した指示・Skillの範囲が異なるため、まとめて効率を評価できません。",
  "overlapping-task-records":
    "同じタスクの版またはカットオフが重なっているため、独立した標本として合計しません。",
  "usage-unavailable-or-partial":
    "使用量が不明または一部だけの記録があるため、合計は不明です。",
  "usage-total-overflow": "安全に合計できないため、合計は不明です。",
  "no-accepted-runs":
    "採用として数えられる記録がないため、採用1件あたりは不明です。",
  "predeclared-comparable-evidence-required":
    "事前に揃えた条件での比較ではないため、優劣や作成資格は判定しません。",
};

export function comparisonErrorMessage(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : "request-failed";
  if (error instanceof ApiError && error.disposition === "uncertain")
    return "操作結果を確認できません。自動では再送しません。履歴と状態を再取得して確認してください。";
  if (kind === "comparison-source-unavailable")
    return "この記録には保存できる設定の一致証拠がありません。記録の評価はそのまま確認できます。";
  if (kind.includes("cutoff"))
    return "選んだ完了位置をこのタスク記録で確認できません。表示されたターンから選び直してください。";
  if (kind.includes("task") || kind.includes("record"))
    return "この記録を確認できません。タスクUUID、完了位置、保存済みの版を確認してください。";
  if (kind.includes("context") || kind.includes("scope"))
    return "接続先が変わりました。現在の対象を確認してから、もう一度操作してください。";
  return `比較記録の操作を完了できませんでした（${kind}）。`;
}

export function formatNumber(value: number | null) {
  return value === null ? "不明" : new Intl.NumberFormat("ja-JP").format(value);
}

export function formatDuration(value: number | null) {
  if (value === null) return "不明";
  return value < 1000
    ? `${value} ms`
    : `${new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value / 1000)} 秒`;
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
  model: "モデル",
  reasoningEffort: "推論設定",
  executionPolicy: "実行ポリシー",
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
      : "なし";
  return {
    initialModel: conditions.model ?? "不明",
    initialReasoningEffort: conditions.reasoningEffort ?? "不明",
    initialExecutionPolicy: conditions.executionPolicyDigest
      ? "記録あり"
      : "不明",
    changed: list(conditions.changes),
    unknown: list(conditions.unknown),
  };
}

export function runReferenceLabel(
  runId: string,
  runs: Array<{ runId: string; title: string | null }>,
) {
  const run = runs.find((candidate) => candidate.runId === runId);
  return `${run?.title ?? "名称なし"} ／ ${runId.slice(0, 12)}`;
}
