import type { FixtureCase } from "./types";
export type SourceMode = "normal" | "unseal" | "trueform";
export const sourceModes: SourceMode[] = ["normal", "unseal", "trueform"];
export const modePresentation: Record<
  SourceMode,
  { title: string; label: string; description: string; scene: FixtureCase }
> = {
  normal: {
    title: "Normal",
    label: "通常装備",
    description: "保存した追加指示とSkillを使う。",
    scene: "baseline",
  },
  unseal: {
    title: "UNSEAL",
    label: "限定解除",
    description: "選んだ追加指示を最小ガイドへ。Skillは手動で呼び出す。",
    scene: "manual-only",
  },
  trueform: {
    title: "TRUEFORM",
    label: "零式",
    description: "選んだ追加指示とSkillを外す。",
    scene: "fixed-only",
  },
};
export type SourceApplication = "codex" | "claude";
export type CodexSourceContext = {
  codexHome: string;
  project: string;
  executable: string;
};
export type ClaudeSourceContext = {
  application: "claude";
  claudeHome: string;
  project: string;
  appBundle: string;
};
export type SourceContext = CodexSourceContext | ClaudeSourceContext;
export type SourceMetadata = {
  kind: "user-sources";
  application: SourceApplication;
  applicationLabel: string;
  launchId: string;
  contextId: string;
  context: SourceContext;
  workspace: string | null;
};
export const isClaudeContext = (
  context: SourceContext,
): context is ClaudeSourceContext =>
  (context as ClaudeSourceContext).application === "claude";
/** The application's own home directory, whatever it calls it. */
export const sourceHomeOf = (context: SourceContext) =>
  isClaudeContext(context) ? context.claudeHome : context.codexHome;
/** The installed application a registration is bound to. */
export const sourceRuntimeOf = (context: SourceContext) =>
  isClaudeContext(context) ? context.appBundle : context.executable;
export type SourceRow = {
  id: string;
  label: string;
  path: string;
  eligible?: boolean;
  reason?: string | null;
  effective?: string | null;
  enabled?: boolean;
  availability: Record<SourceMode, boolean>;
};
export type SourceVerification = {
  runtimeStateVerified: false;
  modeSwitchingVerified: false;
  sourceCoverage: "unknown";
  nextTaskRequired: true;
};
export type TaskObservationStatus =
  | "matched-record"
  | "not-matched-record"
  | "unqualified-record"
  | "unknown-record";
export type TaskObservation = {
  observationId: string;
  taskId: string;
  scopeId: string;
  snapshotId: string;
  preparationId: string | null;
  preparedMode: SourceMode;
  observedAt: string;
  status: TaskObservationStatus;
  reasons: string[];
  sources: Array<{
    sourceId: string;
    category: "instructions" | "skill";
    expected:
      | "saved-instructions"
      | "minimal-guide"
      | "inert-instructions"
      | "automatic-catalog"
      | "manual-only"
      | "disabled"
      | "unknown";
    recorded:
      | "matching-prefix"
      | "different-prefix"
      | "present"
      | "absent"
      | "unknown";
    status: "matched" | "not-matched" | "unknown";
  }>;
  conditions: {
    codexVersion: string | null;
    model: string | null;
    reasoningEffort: string | null;
    executionPolicyDigest: string | null;
    projectInstructionsDigest: string | null;
    memoryGuidanceRecorded: boolean;
  };
  verification: SourceVerification;
};
export type SourceState = {
  context: SourceMetadata["context"];
  registration: {
    scopeId: string;
    rootScopeId?: string;
    previousScopeIds?: string[];
    modeChangeRequired?: boolean;
    normalId: string;
    activeNormalId: string;
    sources: SourceRow[];
  };
  preparedMode: SourceMode;
  revision: number;
  setup?: { setupId: string | null; preparedSetupId: string | null; schemaVersion?: 1 | 2 | null; setupRequired?: boolean };
  preparation: { id: string; preparedAt: string } | null;
  observation: TaskObservation | null;
  observationIssue: string | null;
  conflict: null | { kind: string };
  recovery: {
    pending: boolean;
    lastCheckpointId: string | null;
    argv: string[];
  };
  verification: SourceVerification;
};

export function validTaskId(value: string) {
  return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
    value.trim(),
  );
}

export function taskObservationLabel(status: TaskObservationStatus) {
  return {
    "matched-record": "選択範囲の記録が一致",
    "not-matched-record": "記録が一致しません",
    "unqualified-record": "この準備の確認に使えないタスク",
    "unknown-record": "確認できません",
  }[status];
}

export function taskObservationNotice(status: TaskObservationStatus) {
  const label = taskObservationLabel(status);
  return status === "matched-record"
    ? `${label}。現在の準備に対応する記録です。`
    : label;
}

type TaskObservationState = Pick<
  SourceState,
  "preparation" | "observation" | "observationIssue"
>;

export function observationIssueText(issue: string | null) {
  if (issue === "source-preparation-required")
    return "追加したSkillを含むモードの準備が必要です。使うモードを選んでから、新しいタスクで確認してください。";
  if (
    issue === "preparation-boundary-unavailable" ||
    issue === "preparation-metadata-invalid"
  )
    return "従来の保存状態には確認用の準備日時がありません。内容を確認して同じモードを準備し直してください。自動では変更しません。";
  if (issue === "source-conflict")
    return "ソースに独立した変更があるため、現在のタスク記録は表示できません。";
  if (issue === "recovery-required")
    return "変更が中断しているため、復旧後に新しいタスクで確認してください。";
  if (issue)
    return `保存した確認記録を表示できません（${issue}）。新しいタスクで確認し直せます。`;
  return "タスクの記録はまだ確認していません。";
}

export function canObserveTask(state: (Pick<SourceState, "preparation"> & Partial<Pick<SourceState, "registration">>) | null) {
  return !!state?.preparation && !state.registration?.modeChangeRequired;
}

export function currentTaskObservation(
  state: Pick<SourceState, "preparation" | "observation"> | null,
  result: TaskObservation | null = state?.observation ?? null,
) {
  if (!result || !state?.observation) return null;
  const isCurrent =
    result.preparationId === state.preparation?.id &&
    result.snapshotId === state.observation.snapshotId &&
    result.observationId === state.observation.observationId;
  return isCurrent ? result : null;
}

export function taskObservationResponseNotice(
  state: TaskObservationState | null,
  result: TaskObservation,
) {
  const current = currentTaskObservation(state, result);
  if (current) return taskObservationNotice(current.status);
  if (state?.observationIssue)
    return observationIssueText(state.observationIssue);
  return "確認後に準備状態が変わりました。現在の準備について、別の新しいタスクを確認してください。";
}
export type Guide = {
  id: string;
  text: string;
  digest: string;
  reviewedOn: string;
  references: string[];
};
export type SourceView = {
  metadata: SourceMetadata;
  source: SourceState | null;
  guide: Guide;
  changeVersion?: string | null;
};
/** A source no mode manages, reported so an absence claim is not over-read. */
export type SourceNotice = {
  id: string;
  kind: string;
  label: string;
  path: string;
  count: number;
  detail: string;
};
export type Discovery = {
  discoveryId: string;
  application?: SourceApplication;
  applicationLabel?: string;
  instructions: SourceRow;
  skills: SourceRow[];
  registrationAvailable: boolean;
  unavailableSources: { id: string; reason: string }[];
  notices?: SourceNotice[];
  retained: string[];
  limitations: string[];
};
export type SourcePlan = {
  planId: string;
  scopeId: string;
  mode: SourceMode | "favorite" | "checkpoint";
  preparedMode: SourceMode;
  revision: number;
  setupId?: string | null;
  selectedIds: string[];
  changedFiles: { id: string; label: string }[];
  skillStates: { id: string; enabled: boolean; manualOnly: boolean }[];
  guide: Omit<Guide, "text"> | null;
  adaptation: SourcePlanAdaptation | null;
  retained: string[];
  verification: SourceVerification;
};
export type SourcePlanAdaptation = {
  sourceType: "favorite" | "checkpoint" | "setup";
  sourceId: string;
  previousNormalId: string;
  normalId: string;
} & ({ kind: "retained-settings" } | { kind: "source-enrollment"; previousScopeId: string; scopeId: string;
  addedSourceIds: string[]; addedSourceState: "saved-normal" });
export type RetainedPlan = {
  planId: string;
  scopeId: string;
  revision: number;
  preparedMode: SourceMode;
  previousNormalId: string;
  normalId: string;
  managedFilesChanged: 0;
  changedCategories: string[];
  retained: string[];
  verification: SourceVerification;
};
export type RetainedAcceptance = {
  planId: string;
  normalId: string;
  revision: number;
  preparedMode: SourceMode;
  recorded: true;
  duplicate: boolean;
  verification: SourceVerification;
};
export type SourceFavorite = {
  favoriteId: string;
  normalId: string;
  needsAdaptation: boolean;
  scopeId?: string;
  addedSourceIds?: string[];
  name: string;
  preparedMode: SourceMode;
  revision: number;
};
export type SourceFavoritePage = {
  favorites: SourceFavorite[];
  nextCursor: string | null;
};
