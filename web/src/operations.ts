import { Api, ApiError, errorMessage } from "./api.ts";
import type { Envelope, CheckpointPage, State } from "./types.ts";

// These failures contradict the cached preparation even when HTTP is healthy.
const stalePreparationKinds = new Set([
  "fixture-conflict",
  "fixture-changed",
  "fixture-locked",
  "fixture-link-or-type",
  "invalid-fixture",
  "fixture-recovery-required",
  "fixture-cleanup-required",
  "fixture-incompatible-snapshot",
  "loadout-incompatible-scope",
  "loadout-source-unready",
  "loadout-readback-conflict",
  "loadout-stale-plan",
  "loadout-stale-application",
  "gui-application-not-current",
]);
const possiblyPostWriteKinds = new Set([
  "fixture-conflict",
  "loadout-readback-conflict",
]);

export function preparationUsability(
  state: State | null,
  connected: boolean,
  confirmed: boolean,
) {
  const canUsePreparation =
    connected && confirmed && !!state?.current && !state.conflict;
  return {
    canUsePreparation,
    applicationCurrent: canUsePreparation && !!state?.applicationCurrent,
  };
}

export type OperationFailure = {
  status: "rejected" | "uncertain" | "auth-required";
  connection: "connected" | "unconfirmed";
  message: string;
  notice: string;
  checkpointId?: string;
  invalidatePreparation: boolean;
};
export function operationFailure(reason: unknown): OperationFailure {
  const disposition =
    reason instanceof ApiError ? reason.disposition : "uncertain";
  const kind = reason instanceof ApiError ? reason.kind : "";
  const possiblyPostWrite = possiblyPostWriteKinds.has(kind);
  return {
    status: possiblyPostWrite ? "uncertain" : disposition,
    invalidatePreparation:
      disposition !== "rejected" || stalePreparationKinds.has(kind),
    connection: disposition === "rejected" ? "connected" : "unconfirmed",
    message: possiblyPostWrite
      ? "変更が途中まで進んだ可能性があります。復帰点を保持し、準備状態を再取得して確認してください。"
      : errorMessage(reason),
    notice: possiblyPostWrite
      ? "変更後の準備状態は未確認です。状態を再取得してください。"
      : disposition === "rejected"
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
export async function refreshCheckpointPage(api: Api): Promise<
  | { status: "current"; page: CheckpointPage }
  | {
      status: "stale";
      message: string;
      connection: "connected" | "unconfirmed";
      invalidatePreparation: boolean;
    }
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
  } catch (reason) {
    const { connection, invalidatePreparation } = operationFailure(reason);
    return {
      status: "stale",
      connection,
      invalidatePreparation,
      message:
        "復帰点の一覧を更新できませんでした。確認済みの適用記録と復帰点IDは保持しています。" +
        (connection === "unconfirmed"
          ? "現在の接続状態を確認できないため、接続と状態を再取得してください。"
          : "一覧を再取得してください。"),
    };
  }
}
