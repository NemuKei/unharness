import type { SourceView } from "./sources";
import { PUBLIC_WEB_ORIGIN, connectionRecord, connectionFields, isConnectionId, isConnectionHash,
  readConnectionBinding, readConnectionSummary, loopbackPort } from "./connection-contract.ts";
import type { ConnectionBinding, ConnectionSummary } from "./connection-contract.ts";

export type LocalPairing =
  | ({ pairingId: string; status: "awaiting-approval" | "approved"; ticket: string } & ConnectionBinding)
  | { pairingId: string; status: "connected"; connection: ConnectionSummary }
  | { pairingId: string; status: "expired" | "unavailable" };
export type LocalConnectionAction = "issue" | "approve" | "details" | "cancel" | "revoke" | "operation-status";
export type LocalConnectionRequest = <T>(action: LocalConnectionAction, input: object) => Promise<T>;

export function pairingFromHash(hash: string): string | null {
  const match = /^#pairing=([^&]+)$/.exec(hash);
  return match && isConnectionId(match[1]) ? match[1] : null;
}
export function readLocalPairing(value: unknown, view: SourceView, pairingId: string): LocalPairing {
  const v = connectionRecord(value);
  if (!isConnectionId(v.pairingId) || v.pairingId !== pairingId) throw Error("invalid-connection-response");
  if (v.status === "expired" || v.status === "unavailable") {
    connectionFields(v, ["pairingId", "status"]);
    return { pairingId, status: v.status };
  }
  let binding: ConnectionBinding;
  if (v.status === "connected") {
    connectionFields(v, ["pairingId", "status", "connection"]);
    binding = readConnectionSummary(v.connection);
  } else {
    connectionFields(v, ["pairingId", "status", "ticket", "protocolVersion", "launchId", "webOrigin", "expiresAt", "target", "operations"]);
    if (!["approved", "awaiting-approval"].includes(v.status as string) || !isConnectionHash(v.ticket)) throw Error("invalid-connection-response");
    binding = readConnectionBinding(v);
  }
  if (binding.launchId !== view.metadata.launchId || binding.target.application !== view.metadata.application
    || binding.target.scopeId !== view.source?.registration.scopeId) throw Error("remote-connection-changed");
  return v.status === "connected" ? { pairingId, status: "connected", connection: binding as ConnectionSummary }
    : { pairingId, status: v.status as "approved" | "awaiting-approval", ticket: v.ticket as string, ...binding };
}
export function publicPairingUrl(pairing: LocalPairing, origin: string, now = Date.now()): string | null {
  const port = loopbackPort(origin);
  if (pairing.status !== "approved" || pairing.expiresAt <= now || !port) return null;
  const fragment = new URLSearchParams({ unharness: "1", port, launch: pairing.launchId, ticket: pairing.ticket });
  return PUBLIC_WEB_ORIGIN + "/#" + fragment;
}
