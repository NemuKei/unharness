import { PUBLIC_WEB_ORIGIN, connectionFields, connectionRecord, isConnectionHash, isConnectionId, readConnectionSummary } from "./connection-contract.ts";
import type { ConnectionSummary } from "./connection-contract.ts";
import { isPublicMode, readPublicReceipt, readPublicState } from "./connection-results.ts";
import type { PublicSourceState, PublicReceipt, PublicPlanReceipt } from "./connection-results.ts";
import type { SourceMode } from "./sources";

type Handoff = { protocolVersion: 1; port: number; launchId: string; ticket: string };
export type ConnectionHandoff = { kind: "none" } | { kind: "invalid"; reason: string } | { kind: "ready"; handoff: Handoff };
export type ConnectionPhase = "disconnected" | "pairing" | "connected" | "expired" | "incompatible" | "unknown";
export type PublicOperation = { requestId: string; operation: "plan" | "apply"; connectionId: string; receipt: PublicReceipt | null; error: string | null };
type Command = { requestId: string; operation: "plan" | "apply"; subject: string; mode: SourceMode; revision: number; connectionId: string;
  confirmedReceipt?: Extract<PublicReceipt, { state: "completed" }> };
export type ConnectionSnapshot = {
  phase: ConnectionPhase; connection: ConnectionSummary | null; state: PublicSourceState | null;
  plan: PublicPlanReceipt | null; lastOperation: PublicOperation | null; busy: boolean; error: string | null;
};
export class ConnectionError extends Error {
  kind: string;
  constructor(kind: string) { super(kind); this.kind = kind; }
}
function fail(kind: string): never { throw new ConnectionError(kind); }
const errorKind = (error: unknown) => error instanceof ConnectionError ? error.kind : "remote-state-unconfirmed";
const EMPTY: ConnectionSnapshot = { phase: "disconnected", connection: null, state: null, plan: null, lastOperation: null, busy: false, error: null };

/** Only the locally generated, exact public fragment is a connection handoff.
 * Removal happens before validation or any caller-initiated network request. */
export function consumeConnectionHandoff(href: string, replace: (clean: string) => void): ConnectionHandoff {
  const url = new URL(href), values = new URLSearchParams(url.hash.slice(1));
  if (!["unharness", "port", "launch", "ticket"].some(key => values.has(key))) return { kind: "none" };
  replace(url.origin + url.pathname);
  if (url.origin !== PUBLIC_WEB_ORIGIN || url.pathname !== "/" || url.search
    || [...values.keys()].length !== 4 || [...values.keys()].some(key => !["unharness", "port", "launch", "ticket"].includes(key))
    || ["unharness", "port", "launch", "ticket"].some(key => values.getAll(key).length !== 1)) return { kind: "invalid", reason: "remote-pairing-unavailable" };
  if (values.get("unharness") !== "1") return { kind: "invalid", reason: "remote-incompatible" };
  const port = values.get("port")!, launchId = values.get("launch"), ticket = values.get("ticket");
  if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535 || !isConnectionId(launchId) || !isConnectionHash(ticket))
    return { kind: "invalid", reason: "remote-pairing-unavailable" };
  return { kind: "ready", handoff: { protocolVersion: 1, port: Number(port), launchId, ticket } };
}

/** One page, one current grant. GUI and WebMCP share these deterministic calls.
 * Authority and tickets stay private, never in the subscribed view or storage. */
export class PublicConnection {
  #view: ConnectionSnapshot = Object.freeze({ ...EMPTY });
  #listeners = new Set<() => void>();
  #fetch: typeof fetch; #now: () => number; #pageOrigin: string;
  #handoff: Handoff | null = null; #token: string | null = null; #loopback: string | null = null;
  #grant: ConnectionSummary | null = null; #epoch = 0; #readGeneration = 0;
  #lastCommand: Command | null = null; #receiptGeneration = 0;
  #requestInputs = new Map<string, string>();
  #active: { operation: "plan" | "apply"; subject: string; requestId: string; promise: Promise<PublicReceipt> } | null = null;
  constructor({ pageOrigin, handoff = { kind: "none" }, fetcher = (...args) => globalThis.fetch(...args), now = Date.now }: {
    pageOrigin: string; handoff?: ConnectionHandoff; fetcher?: typeof fetch; now?: () => number;
  }) { this.#fetch = fetcher; this.#now = now; this.#pageOrigin = pageOrigin; this.acceptHandoff(handoff); }
  getSnapshot = () => this.#view;
  getLocalWorkbenchUrl = () => this.#grant && this.#grant.expiresAt > this.#now() && this.#view.phase === "connected" ? this.#loopback : null;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #set(update: Partial<ConnectionSnapshot>) {
    this.#view = Object.freeze({ ...this.#view, ...update });
    this.#listeners.forEach(listener => listener());
  }
  acceptHandoff(value: ConnectionHandoff) {
    ++this.#epoch; ++this.#readGeneration; this.#token = null; this.#grant = null; this.#loopback = null; this.#handoff = null;
    this.#requestInputs.clear();
    if (value.kind === "ready") this.#handoff = value.handoff;
    this.#set({ phase: value.kind === "ready" ? "pairing" : value.kind === "none" ? "disconnected"
      : value.reason === "remote-incompatible" ? "incompatible" : "unknown",
      connection: null, state: null, plan: null, error: value.kind === "invalid" ? value.reason : null });
  }
  disconnect() { this.acceptHandoff({ kind: "none" }); }
  tick() {
    if (this.#grant && this.#grant.expiresAt <= this.#now()) {
      this.#token = null; this.#grant = null;
      this.#set({ phase: "expired", connection: null, state: null, plan: null, error: "remote-connection-expired" });
    }
  }
  #authority() {
    this.tick();
    if (!this.#grant || !this.#token || !this.#loopback) fail("remote-connection-expired");
    return { grant: this.#grant, token: this.#token, loopback: this.#loopback };
  }
  #failed(error: unknown) {
    const kind = errorKind(error), expired = this.#view.phase === "expired" || ["remote-connection-expired", "remote-pairing-unavailable"].includes(kind);
    const incompatible = kind === "remote-incompatible";
    if (expired || incompatible || kind === "remote-connection-changed" || kind === "remote-request-forbidden") { this.#token = null; this.#grant = null; }
    this.#set({ phase: expired ? "expired" : incompatible ? "incompatible" : "unknown", connection: null, state: null, plan: null, error: kind });
  }
  async #post(loopback: string, action: string, body: object, token?: string) {
    let response: Response;
    try {
      response = await this.#fetch(loopback + "/remote/v1/" + action, {
        method: "POST", mode: "cors", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json", "X-Unharness-Client": "1", ...(token ? { Authorization: "Bearer " + token } : {}) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
      });
    } catch { fail("remote-connection-lost"); }
    let data: unknown;
    try { data = await response.json(); } catch { fail("remote-state-unconfirmed"); }
    if (!response.ok) {
      const error = connectionRecord(connectionRecord(data).error);
      fail(typeof error.kind === "string" && /^[a-z-]{1,64}$/.test(error.kind) ? error.kind : "remote-state-unconfirmed");
    }
    return data;
  }
  async connect() {
    if (this.#active || this.#view.busy) fail("remote-operation-in-progress");
    if (this.#pageOrigin !== PUBLIC_WEB_ORIGIN || !this.#handoff) fail("remote-pairing-unavailable");
    const handoff = this.#handoff, before = ++this.#epoch;
    this.#handoff = null; this.#set({ busy: true, phase: "pairing", error: null });
    const loopback = `http://127.0.0.1:${handoff.port}`;
    try {
      const raw = connectionRecord(await this.#post(loopback, "redeem", { ticket: handoff.ticket, launchId: handoff.launchId, protocolVersion: 1 }));
      if (raw.protocolVersion !== 1) fail("remote-incompatible");
      const { token, ...rest } = raw, grant = readConnectionSummary(rest);
      if (!isConnectionHash(token) || grant.launchId !== handoff.launchId) fail("remote-connection-changed");
      if (grant.expiresAt <= this.#now()) fail("remote-connection-expired");
      if (before !== this.#epoch) return;
      this.#token = token; this.#grant = grant; this.#loopback = loopback;
      this.#set({ phase: "connected", connection: grant, busy: false });
      await this.refresh();
    } catch (error) { if (before === this.#epoch) this.#failed(error); throw error; }
    finally { if (before === this.#epoch) this.#set({ busy: false }); }
  }
  async refresh() {
    if (this.#active) fail("remote-operation-in-progress");
    const { grant, token, loopback } = this.#authority(), before = this.#epoch, read = ++this.#readGeneration;
    try {
      const value = connectionRecord(await this.#post(loopback, "status", {}, token));
      connectionFields(value, ["connection", "state"]);
      if (connectionRecord(value.connection).protocolVersion !== 1) fail("remote-incompatible");
      const connection = readConnectionSummary(value.connection);
      if (JSON.stringify(connection) !== JSON.stringify(grant)) fail("remote-connection-changed");
      const state = readPublicState(value.state, grant.target.scopeId);
      if (before !== this.#epoch || read !== this.#readGeneration) return null;
      this.tick(); if (!this.#grant) return null;
      const prior = this.#view.plan;
      this.#set({ phase: "connected", connection, state, error: null,
        plan: prior?.result.data.revision === state.revision && !state.conflict && !state.recoveryPending ? prior : null });
      return state;
    } catch (error) { if (before === this.#epoch && read === this.#readGeneration) this.#failed(error); throw error; }
  }
  #checkReceipt(receipt: PublicReceipt, command: Command) {
    if (receipt.state === "not-found") return;
    if (receipt.operation !== command.operation) fail("remote-operation-unconfirmed");
    if (receipt.state !== "completed" || !receipt.result.ok) return;
    if (receipt.operation === "plan") {
      if (receipt.result.data.mode !== command.mode || receipt.result.data.revision !== command.revision) fail("remote-operation-unconfirmed");
    } else if (receipt.result.data.planRequestId !== command.subject || receipt.result.data.preparedMode !== command.mode
      || receipt.result.data.revision !== command.revision + 1) fail("remote-operation-unconfirmed");
  }
  #write(operation: "plan" | "apply", subject: string, requestId?: string): Promise<PublicReceipt> {
    if (this.#active) {
      if (this.#active.operation === operation && this.#active.subject === subject && (!requestId || requestId === this.#active.requestId)) return this.#active.promise;
      return Promise.reject(new ConnectionError("remote-operation-in-progress"));
    }
    try {
      const { grant, token, loopback } = this.#authority(), current = this.#view.state;
      if (this.#view.lastOperation && this.#view.lastOperation.receipt?.state !== "completed") fail("remote-operation-unconfirmed");
      if (!current || this.#view.phase !== "connected") fail("remote-state-unconfirmed");
      if (current.conflict || current.recoveryPending) fail(current.conflict ? "source-conflict" : "recovery-required");
      const id = requestId ?? crypto.randomUUID(); if (!isConnectionId(id)) fail("remote-invalid-request");
      const plan = this.#view.plan;
      if (operation === "plan" && !isPublicMode(subject)) fail("remote-invalid-request");
      if (operation === "apply" && (!plan || plan.requestId !== subject || plan.result.data.revision !== current.revision)) fail("remote-plan-unavailable");
      const body = operation === "plan" ? { requestId: id, mode: subject, expectedRevision: current.revision } : { requestId: id, planRequestId: subject };
      const command: Command = { requestId: id, operation, subject, mode: operation === "plan" ? subject as SourceMode : plan!.result.data.mode,
        revision: current.revision, connectionId: grant.connectionId };
      // Failure receipts have no mode/revision fields. Never reuse an issued
      // UUID for different input and then mistake its old failure for this call.
      const fingerprint = JSON.stringify([operation, subject, command.mode, command.revision, command.connectionId]);
      const priorInput = this.#requestInputs.get(id);
      if (priorInput !== undefined && priorInput !== fingerprint) fail("remote-operation-conflict");
      this.#requestInputs.set(id, fingerprint);
      this.#lastCommand = command;
      const before = this.#epoch; ++this.#readGeneration; ++this.#receiptGeneration;
      this.#set({ busy: true, error: null, plan: operation === "plan" ? null : plan,
        lastOperation: { requestId: id, operation, connectionId: grant.connectionId, receipt: null, error: null } });
      const promise = (async () => {
        try {
          const receipt = readPublicReceipt(await this.#post(loopback, operation, body, token), id, grant.target.scopeId);
          this.#checkReceipt(receipt, command); ++this.#receiptGeneration;
          if (this.#view.lastOperation?.requestId === id && this.#view.lastOperation.connectionId === grant.connectionId)
            this.#set({ lastOperation: { requestId: id, operation, connectionId: grant.connectionId, receipt, error: null } });
          if (before === this.#epoch) {
            this.tick();
            if (this.#grant) this.#set({ state: operation === "apply" || receipt.state !== "completed" || !receipt.result.ok ? null : this.#view.state,
              plan: receipt.state === "completed" && receipt.operation === "plan" && receipt.result.ok ? receipt as PublicPlanReceipt : null });
          }
          return receipt;
        } catch (error) {
          ++this.#receiptGeneration;
          // A validated terminal lookup belongs to this exact dispatched
          // command, including a saved failure. A late transport error cannot
          // erase it or tell the original caller a contradictory outcome.
          const receipt = command.confirmedReceipt ?? null;
          if (this.#view.lastOperation?.requestId === id && this.#view.lastOperation.connectionId === grant.connectionId)
            this.#set({ lastOperation: { requestId: id, operation, connectionId: grant.connectionId, receipt,
              error: receipt ? null : errorKind(error) } });
          // Preserve the historical result without reconfirming the connection.
          if (before === this.#epoch) { this.tick(); this.#failed(error); }
          if (receipt) return receipt;
          throw error;
        } finally { this.#active = null; this.#set({ busy: false }); }
      })();
      this.#active = { operation, subject, requestId: id, promise };
      return promise;
    } catch (error) { return Promise.reject(error); }
  }
  plan(mode: SourceMode, requestId?: string) { return this.#write("plan", mode, requestId); }
  apply(planRequestId: string, requestId?: string) { return this.#write("apply", planRequestId, requestId); }
  async operationStatus(requestId: string) {
    if (!isConnectionId(requestId)) fail("remote-invalid-request");
    const { grant, token, loopback } = this.#authority(), before = this.#epoch, read = ++this.#receiptGeneration;
    const command = this.#lastCommand;
    try {
      const receipt = readPublicReceipt(await this.#post(loopback, "operation-status", { requestId }, token), requestId, grant.target.scopeId);
      if (command?.requestId === requestId && command.connectionId === grant.connectionId) {
        this.#checkReceipt(receipt, command);
        if (receipt.state === "completed") command.confirmedReceipt ??= receipt;
      }
      const last = this.#view.lastOperation;
      if (before === this.#epoch && read === this.#receiptGeneration && last?.requestId === requestId && last.connectionId === grant.connectionId) {
        const current = this.#view.state;
        this.#set({ lastOperation: { ...last, receipt, error: null },
          ...(command && receipt.state === "completed" && receipt.operation === "plan" && receipt.result.ok
            && current?.revision === receipt.result.data.revision && !current.conflict && !current.recoveryPending
            ? { plan: receipt as PublicPlanReceipt } : {}) });
      }
      return receipt;
    } catch (error) { if (before === this.#epoch && read === this.#receiptGeneration) this.#failed(error); throw error; }
  }
}
