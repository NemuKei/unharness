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
    const result = await this.request<{ token: string; kind?: "fixture" | "user-sources" | "recovery" }>("/bootstrap");
    if (typeof result?.token !== "string" || !result.token) throw new ApiError("invalid-response");
    this.token = result.token;
    return result;
  }
  get<T>(route: string) {
    return this.request<T>(route);
  }
  post<T>(route: string, body: object) {
    return this.request<T>(route, { requestId: crypto.randomUUID(), ...body });
  }
  async image(route: string, expectedBytes: number, signal: AbortSignal): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(`${this.base}/api${route}`, { cache: 'no-store', credentials: 'same-origin', redirect: 'error',
        headers: { 'X-Unharness-Client': '1', 'X-Unharness-Token': this.token },
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]) });
    } catch { throw new ApiError('appearance-image-unavailable'); }
    if (!response.ok) {
      let payload: { error?: { kind?: string } } = {};
      try { payload = await response.json(); } catch {}
      throw new ApiError(payload.error?.kind ?? 'appearance-image-unavailable', undefined, response.status === 403 ? 'auth-required' : 'rejected');
    }
    if (response.headers.get('content-type') !== 'image/png' || !response.body || !Number.isSafeInteger(expectedBytes)
      || expectedBytes < 1 || expectedBytes > 8 * 1024 * 1024) throw new ApiError('appearance-image-unavailable');
    const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > expectedBytes) throw new ApiError('appearance-image-unavailable');
        chunks.push(new Uint8Array(value));
      }
      if (size !== expectedBytes) throw new ApiError('appearance-image-unavailable');
      return new Blob(chunks, { type: 'image/png' });
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
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
        signal: AbortSignal.timeout(["/sources/review-appearance-import", "/sources/review-start", "/sources/save-start", "/sources/start", "/sources/review-replay", "/sources/prepare-replay",
          "/sources/handoff-replay", "/sources/open-replay", "/sources/observe-replay", "/sources/save-replay-result", "/sources/replay-result", "/sources/compare-replays"].includes(route) ? 120000 : 30000),
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
