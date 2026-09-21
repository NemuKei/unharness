import { text as t } from './locale.ts';
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
    ? t("保存結果は未確認です。保存履歴を読み込み、確認してください。", "The save result is unconfirmed. Load saved history to check.")
    : t("開始条件を読み込めませんでした。接続を確認して、読み込み直してください。", "Could not load starting conditions. Check the connection and reload.");
  const kind = error instanceof ApiError ? error.kind : "request-failed";
  const messages: Record<string, string> = {
    "starting-files-changed": t("確認後にファイルが変わりました。保存内容を確認し直してください。", "Files changed after review. Review what will be saved again."),
    "starting-files-limit": t("ファイル数・サイズが保存上限を超えています（2,048件、1件8 MiB、合計64 MiB）。対象の作業フォルダを見直してください。", "Files exceed the storage limits: 2,048 files, 8 MiB per file and 64 MiB total. Review the project folder."),
    "starting-files-unsupported": t("リンクや対応していないファイル属性があるため、開始状態を保存できません。対象ファイルを確認してください。", "Links or unsupported file attributes prevent saving the starting state. Check the target files."),
    "starting-path-invalid": t("追加ファイルは、この作業フォルダからの相対パスで指定してください。重複や上位フォルダへの指定は使えません。", "Use paths relative to this project folder for additional files. Duplicates and parent-folder paths are not allowed."),
    "starting-project-root-required": t("Gitプロジェクトのルートフォルダを対象にしてください。入れ子のリポジトリはそのまま保存できません。", "Select the Git project root. Nested repositories cannot be saved as-is."),
    "starting-project-contains-store": t("Unharnessの保存先を含むフォルダは対象にできません。作業プロジェクトを選んでください。", "The target cannot contain Unharness storage. Select your work project."),
    "starting-inventory-unavailable": t("作業ファイルの一覧を取得できませんでした。Gitと作業フォルダの状態を確認してください。", "Could not list project files. Check Git and the project folder."),
    "starting-record-invalid": t("保存した開始条件の整合性を確認できません。設定の復帰は「モード」画面で利用できます。", "Could not verify saved starting conditions. Restore settings from the Mode page."),
    "starting-declaration-invalid": t("依頼文、必須の結果、評価の基準、試行上限を確認してください。", "Check the request, required outcome, criteria and attempt limit."),
    "gui-request-too-large": t("入力が保存できるサイズを超えています。追加ファイルの指定や入力内容を見直してください。", "Input exceeds the storage limit. Review the extra file paths and entered content."),
  };
  return messages[kind] ?? t(`開始条件の操作を完了できませんでした（${kind}）。`, `Starting-condition operation failed (${kind}).`);
}
