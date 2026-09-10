import { connectionFields, connectionRecord, isConnectionHash, isConnectionId } from "./connection-contract.ts";
import type { SourceMode } from "./sources";

export const isPublicMode = (value: unknown): value is SourceMode => ["normal", "unseal", "trueform"].includes(value as string);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
export type PublicSourceState = {
  scopeId: string; revision: number; preparedMode: SourceMode; setupRequired: boolean; modeChangeRequired: boolean;
  conflict: boolean; recoveryPending: boolean; runtimeState: "unknown";
};
export function readPublicState(value: unknown, scopeId: string): PublicSourceState {
  const v = connectionRecord(value);
  connectionFields(v, ["scopeId", "revision", "preparedMode", "setupRequired", "modeChangeRequired", "conflict", "recoveryPending", "runtimeState"]);
  if (v.scopeId !== scopeId || !isConnectionHash(v.scopeId) || !revision(v.revision) || !isPublicMode(v.preparedMode)
    || ["setupRequired", "modeChangeRequired", "conflict", "recoveryPending"].some(key => typeof v[key] !== "boolean")
    || v.runtimeState !== "unknown") throw Error("invalid-connection-response");
  return { scopeId, revision: v.revision, preparedMode: v.preparedMode, setupRequired: v.setupRequired as boolean,
    modeChangeRequired: v.modeChangeRequired as boolean, conflict: v.conflict as boolean, recoveryPending: v.recoveryPending as boolean, runtimeState: "unknown" };
}
export type PublicPlanData = { planId: string; scopeId: string; revision: number; mode: SourceMode; changedFileCount: number };
export type PublicApplyData = { planRequestId: string; scopeId: string; revision: number; preparedMode: SourceMode; readback: "matched"; runtimeState: "unknown" };
type FailedResult = { ok: false; error: { kind: string } };
export type PublicPlanReceipt = { requestId: string; operation: "plan"; state: "completed"; result: { ok: true; data: PublicPlanData } };
export type PublicApplyReceipt = { requestId: string; operation: "apply"; state: "completed"; result: { ok: true; data: PublicApplyData } };
export type PublicReceipt = PublicPlanReceipt | PublicApplyReceipt
  | { requestId: string; operation: "plan" | "apply"; state: "completed"; result: FailedResult }
  | { requestId: string; operation: "plan" | "apply"; state: "unconfirmed" }
  | { requestId: string; operation: null; state: "not-found" };
export function readPublicReceipt(value: unknown, requestId: string, scopeId: string): PublicReceipt {
  const v = connectionRecord(value);
  if (v.requestId !== requestId || !isConnectionId(requestId)) throw Error("invalid-connection-response");
  if (v.state === "not-found" || v.state === "unconfirmed") {
    connectionFields(v, ["requestId", "operation", "state"]);
    if (v.state === "not-found" && v.operation === null) return { requestId, operation: null, state: "not-found" };
    if (v.state === "unconfirmed" && (v.operation === "plan" || v.operation === "apply")) return { requestId, operation: v.operation, state: "unconfirmed" };
    throw Error("invalid-connection-response");
  }
  connectionFields(v, ["requestId", "operation", "state", "result"]);
  if (v.state !== "completed" || (v.operation !== "plan" && v.operation !== "apply")) throw Error("invalid-connection-response");
  const result = connectionRecord(v.result);
  if (result.ok === false) {
    connectionFields(result, ["ok", "error"]);
    const error = connectionRecord(result.error); connectionFields(error, ["kind"]);
    if (typeof error.kind !== "string" || !/^[a-z-]{1,64}$/.test(error.kind)) throw Error("invalid-connection-response");
    return { requestId, operation: v.operation, state: "completed", result: { ok: false, error: { kind: error.kind } } };
  }
  connectionFields(result, ["ok", "data"]);
  if (result.ok !== true) throw Error("invalid-connection-response");
  const data = connectionRecord(result.data);
  if (data.scopeId !== scopeId || !revision(data.revision)) throw Error("invalid-connection-response");
  if (v.operation === "plan") {
    connectionFields(data, ["planId", "scopeId", "revision", "mode", "changedFileCount"]);
    if (!isConnectionHash(data.planId) || !isPublicMode(data.mode) || !revision(data.changedFileCount)) throw Error("invalid-connection-response");
    return { requestId, operation: "plan", state: "completed", result: { ok: true,
      data: { planId: data.planId, scopeId, revision: data.revision, mode: data.mode, changedFileCount: data.changedFileCount } } };
  }
  connectionFields(data, ["planRequestId", "scopeId", "revision", "preparedMode", "readback", "runtimeState"]);
  if (!isConnectionId(data.planRequestId) || !isPublicMode(data.preparedMode) || data.readback !== "matched" || data.runtimeState !== "unknown")
    throw Error("invalid-connection-response");
  return { requestId, operation: "apply", state: "completed", result: { ok: true,
    data: { planRequestId: data.planRequestId, scopeId, revision: data.revision, preparedMode: data.preparedMode, readback: "matched", runtimeState: "unknown" } } };
}
