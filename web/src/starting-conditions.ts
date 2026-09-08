import { ApiError } from "./api";

export type StartingDeclaration = {
  title?: string;
  request: string;
  requirements: Array<{ id: string; label: string; critical: boolean }>;
  ratings: Array<{ id: string; label: string; lowAnchor: string; highAnchor: string }>;
  budget: { maxAttempts: number; maxTurnsPerAttempt: number; maxRecordedTokens: number | null };
};
export type StartingFile = { path: string; present: boolean; size: number; sha256: string | null };
export type StartingSelection = {
  kind: "git-working-files" | "directory-working-files";
  gitMetadata: "excluded";
  ignoredFiles: "excluded" | "not-applicable";
  retainedProjectInputs: "included";
  additionalPaths: string[];
};
export type StartingReview = {
  reviewId: string; scopeId: string; capturedAt: string; title: string | null;
  criteria: Omit<StartingDeclaration, "request" | "title">;
  requestBytes: number; selection: StartingSelection; conditions: Record<string, string>;
  totalBytes: number; fileCount: number; absentCount: number; files: StartingFile[];
};
export type SavedStart = Omit<StartingReview, "capturedAt" | "files"> & {
  startId: string; frozenAt: string; inputIntegrity: "verified" | "not-rechecked";
};
export type StartingDetail = SavedStart & { declaration: StartingDeclaration; files: StartingFile[] };
export type StartingPage = { starts: SavedStart[]; nextCursor: string | null };
export const isStartingMutation = (operation: string) => operation === "review-start" || operation === "save-start";
export function startingErrorMessage(error: unknown, operation: string) {
  if (error instanceof ApiError && error.disposition === "uncertain") return isStartingMutation(operation)
    ? "保存結果は未確認です。保存履歴を読み込み、確認してください。"
    : "開始条件を読み込めませんでした。接続を確認して、読み込み直してください。";
  const kind = error instanceof ApiError ? error.kind : "request-failed";
  const messages: Record<string, string> = {
    "starting-files-changed": "確認後にファイルが変わりました。保存内容を確認し直してください。",
    "starting-files-limit": "ファイル数・サイズが保存上限を超えています（2,048件、1件8 MiB、合計64 MiB）。対象の作業フォルダを見直してください。",
    "starting-files-unsupported": "リンクや対応していないファイル属性があるため、開始状態を保存できません。対象ファイルを確認してください。",
    "starting-path-invalid": "追加ファイルは、この作業フォルダからの相対パスで指定してください。重複や上位フォルダへの指定は使えません。",
    "starting-project-root-required": "Gitプロジェクトのルートフォルダを対象にしてください。入れ子のリポジトリはそのまま保存できません。",
    "starting-project-contains-store": "Unharnessの保存先を含むフォルダは対象にできません。作業プロジェクトを選んでください。",
    "starting-inventory-unavailable": "作業ファイルの一覧を取得できませんでした。Gitと作業フォルダの状態を確認してください。",
    "starting-record-invalid": "保存した開始条件の整合性を確認できません。設定の復帰は「装備」タブで利用できます。",
    "starting-declaration-invalid": "依頼文、必須の結果、評価の基準、試行上限を確認してください。",
    "gui-request-too-large": "入力が保存できるサイズを超えています。追加ファイルの指定や入力内容を見直してください。",
  };
  return messages[kind] ?? `開始条件の操作を完了できませんでした（${kind}）。`;
}
