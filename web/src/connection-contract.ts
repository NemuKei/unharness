// Browser projection of the protocol. No local paths or server credentials.
export const PUBLIC_WEB_ORIGIN = "https://unharness.deltahelmlab.com";
export const CONNECTION_PROTOCOL = 2 as const;
export const CONNECTION_OPERATIONS = ["status", "plan", "apply", "operation-status", "artwork", "artwork-item", "artwork-image",
  "review-appearance-import", "read-appearance-import", "save-appearance-import", "select-appearance", "name-appearance", "recover-appearance"] as const;
export const isConnectionId = (value: unknown): value is string => typeof value === "string"
  && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const isConnectionHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function connectionRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid-connection-response");
  return value as Record<string, unknown>;
}
export function connectionFields(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw Error("invalid-connection-response");
}
export type ConnectionBinding = {
  protocolVersion: 2; launchId: string; webOrigin: string; expiresAt: number;
  target: { application: "codex" | "claude"; scopeId: string; collectionScopeId: string }; operations: string[];
};
export type ConnectionSummary = ConnectionBinding & { connectionId: string };
export function readConnectionBinding(value: unknown): ConnectionBinding {
  const v = connectionRecord(value), target = connectionRecord(v.target);
  connectionFields(target, ["application", "scopeId", "collectionScopeId"]);
  if (v.protocolVersion !== CONNECTION_PROTOCOL || !isConnectionId(v.launchId) || v.webOrigin !== PUBLIC_WEB_ORIGIN
    || !Number.isSafeInteger(v.expiresAt) || (v.expiresAt as number) < 0 || !isConnectionHash(target.scopeId) || !isConnectionHash(target.collectionScopeId)
    || !["codex", "claude"].includes(target.application as string)
    || JSON.stringify(v.operations) !== JSON.stringify(CONNECTION_OPERATIONS)) throw Error("invalid-connection-response");
  return { protocolVersion: 2, launchId: v.launchId, webOrigin: PUBLIC_WEB_ORIGIN, expiresAt: v.expiresAt as number,
    target: { application: target.application as "codex" | "claude", scopeId: target.scopeId, collectionScopeId: target.collectionScopeId }, operations: [...CONNECTION_OPERATIONS] };
}
export function readConnectionSummary(value: unknown): ConnectionSummary {
  const v = connectionRecord(value);
  connectionFields(v, ["protocolVersion", "launchId", "webOrigin", "expiresAt", "target", "operations", "connectionId"]);
  if (!isConnectionId(v.connectionId)) throw Error("invalid-connection-response");
  return { ...readConnectionBinding(v), connectionId: v.connectionId };
}
export function loopbackPort(origin: string): string | null {
  try {
    const url = new URL(origin), port = Number(url.port);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" && origin === url.origin
      && Number.isInteger(port) && port >= 1 && port <= 65535 ? url.port : null;
  } catch { return null; }
}
