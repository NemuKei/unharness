import { Api, ApiError, errorMessage } from "./api.ts";
import type { Envelope, CheckpointPage } from "./types.ts";

export type OperationFailure = {
  status: "rejected" | "uncertain" | "auth-required";
  connection: "connected" | "unconfirmed";
  message: string;
  notice: string;
  checkpointId?: string;
};
export function operationFailure(reason: unknown): OperationFailure {
  const disposition =
    reason instanceof ApiError ? reason.disposition : "uncertain";
  return {
    status: disposition,
    connection: disposition === "rejected" ? "connected" : "unconfirmed",
    message: errorMessage(reason),
    notice:
      disposition === "rejected"
        ? "操作を完了できませんでした。表示された理由を確認してください。"
        : disposition === "auth-required"
          ? "接続を再確認してください。状態を再取得してから操作できます。"
          : "操作の成功は確認できていません。状態を再取得してください。",
    checkpointId: reason instanceof ApiError ? reason.checkpointId : undefined,
  };
}
export async function submitOperation<T>(
  api: Api,
  route: string,
  body: object,
): Promise<{ status: "confirmed"; response: Envelope<T> } | OperationFailure> {
  try {
    const response = await api.post<Envelope<T>>(route, body);
    if (
      !response ||
      typeof response !== "object" ||
      !response.state ||
      !response.result
    ) {
      throw new ApiError("invalid-response", undefined, "uncertain");
    }
    return { status: "confirmed", response };
  } catch (reason) {
    return operationFailure(reason);
  }
}
// Auxiliary reads do not change the outcome or identity of a confirmed mutation.
export async function refreshCheckpointPage(
  api: Api,
): Promise<
  | { status: "current"; page: CheckpointPage }
  | { status: "stale"; message: string }
> {
  try {
    const page = await api.get<CheckpointPage>("/checkpoints");
    if (
      !page ||
      !Array.isArray(page.checkpoints) ||
      !(page.nextCursor === null || typeof page.nextCursor === "string")
    ) {
      throw new ApiError("invalid-response", undefined, "uncertain");
    }
    return { status: "current", page };
  } catch {
    return {
      status: "stale",
      message:
        "復帰点の一覧を更新できませんでした。確認済みの適用記録と復帰点IDは保持しています。一覧を再取得してください。",
    };
  }
}
