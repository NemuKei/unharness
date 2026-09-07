export class ApiError extends Error {
  kind: string;
  checkpointId?: string;
  disposition: "rejected" | "uncertain" | "auth-required";
  constructor(
    kind: string,
    checkpointId?: string,
    disposition: "rejected" | "uncertain" | "auth-required" = "rejected",
  ) {
    super(kind);
    this.kind = kind;
    this.checkpointId = checkpointId;
    this.disposition = disposition;
  }
}
export class RequestGeneration {
  private value = 0;
  next() {
    return ++this.value;
  }
  isCurrent(value: number) {
    return this.value === value;
  }
}
export class Api {
  private token = "";
  private base: string;
  constructor(base = "") {
    this.base = base;
  }
  async connect() {
    const result = await this.request<{ token: string }>("/bootstrap");
    this.token = result.token;
  }
  get<T>(route: string) {
    return this.request<T>(route);
  }
  post<T>(route: string, body: object) {
    return this.request<T>(route, { requestId: crypto.randomUUID(), ...body });
  }
  private async request<T>(route: string, body?: object): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.base}/api${route}`, {
        method: body ? "POST" : "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "X-Unharness-Client": "1",
          ...(this.token ? { "X-Unharness-Token": this.token } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ApiError("connection-lost", undefined, "uncertain");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new ApiError("invalid-response", undefined, "uncertain");
    }
    if (!response.ok) {
      if (!payload || typeof payload.error?.kind !== "string")
        throw new ApiError("invalid-response", undefined, "uncertain");
      const disposition =
        response.status === 401 || response.status === 403
          ? "auth-required"
          : response.status >= 500
            ? "uncertain"
            : "rejected";
      throw new ApiError(
        payload.error.kind,
        payload.error.checkpointId,
        disposition,
      );
    }
    return payload as T;
  }
}
export function errorMessage(error: unknown) {
  const kind = error instanceof ApiError ? error.kind : "request-failed";
  if (error instanceof ApiError && error.disposition === "uncertain")
    return "操作の結果は未確認です。「状態を再取得」で確認してください。自動再送は行いません。";
  if (kind.includes("stale-plan"))
    return "準備状態が変わったため、この変更計画は使えません。状態を再取得し、変更計画を確認してください。";
  if (kind.includes("stale-application"))
    return "この適用記録と現在の準備状態が一致しません。条件を適用し直して、新しいタスクで確認してください。";
  if (kind.includes("session") || kind.includes("record"))
    return "このタスクの記録を確認できません。UUIDと、新しく作成したローカルタスクであることを確認してください。";
  if (kind.includes("conflict") || kind.includes("source"))
    return "検証環境の状態に競合があります。外部の変更を確認してください。復帰用の記録は下に表示します。";
  if (
    kind === "gui-request-forbidden" ||
    kind.includes("token") ||
    kind.includes("unauthorized")
  )
    return "接続の有効期限が切れました。「状態を再取得」で再接続してください。";
  return `操作を完了できませんでした（${kind}）。状態を再取得して確認してください。`;
}
