import { connectionFields, connectionRecord, isConnectionId } from "./connection-contract.ts";
import { ConnectionError } from "./connection.ts";
import type { PublicConnection } from "./connection.ts";
import { isPublicMode } from "./connection-results.ts";

type PageTool = {
  name: string; description: string; inputSchema: object;
  annotations: { readOnlyHint: boolean; consequentialHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown, options?: { signal?: AbortSignal }) => Promise<string>;
};
export type PageModelContext = { registerTool: (tool: PageTool, options: { signal: AbortSignal }) => Promise<void> };
const uuid = { type: "string", pattern: "^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$" };
const schema = (properties: Record<string, object>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });

export function registerConnectionTools(modelContext: PageModelContext | undefined, client: PublicConnection) {
  const lifetime = new AbortController();
  const dispose = () => lifetime.abort();
  if (!modelContext || typeof modelContext.registerTool !== "function") return { dispose, ready: Promise.resolve("unavailable" as const) };
  function tool(name: string, description: string, properties: Record<string, object>, readOnly: boolean,
    perform: (input: Record<string, unknown>) => Promise<object>): PageTool {
    return { name, description, inputSchema: schema(properties), annotations: { readOnlyHint: readOnly, consequentialHint: false, untrustedContentHint: false },
      async execute(input, { signal } = {}) {
        try {
          if (lifetime.signal.aborted || signal?.aborted) throw new ConnectionError("remote-request-cancelled");
          const value = connectionRecord(input); connectionFields(value, Object.keys(properties));
          for (const key of Object.keys(properties).filter(key => key !== "mode")) if (!isConnectionId(value[key])) throw new ConnectionError("remote-invalid-request");
          if (Object.hasOwn(properties, "mode") && !isPublicMode(value.mode)) throw new ConnectionError("remote-invalid-request");
          // Once dispatched, a write is not undone by tool unregistration or
          // caller cancellation. The shared client preserves its operation ID
          // and result; backend transactions and receipt publication continue.
          return JSON.stringify(await perform(value));
        } catch (error) {
          return JSON.stringify({ ok: false, error: { kind: error instanceof ConnectionError ? error.kind : "remote-invalid-request" } });
        }
      } };
  }
  const tools = [
    tool("unharness_status", "Read this page's local connection and current prepared configuration. A preparation is for a fresh task; the running task remains unverified. Without a connection, returns only the disconnected state.", {}, true,
      async () => {
        const before = client.getSnapshot();
        if (before.phase !== "connected" && before.phase !== "unknown") return { ok: true, connectionState: before.phase, state: null };
        const state = await client.refresh();
        return { ok: true, connectionState: client.getSnapshot().phase, state };
      }),
    tool("unharness_plan_mode", "Review a change to a saved Normal, UNSEAL or TRUEFORM in the locally approved scope. Requires a current status and a new lowercase request UUID. Creates a durable plan, not a configuration change. After a lost response, inspect the same request ID.",
      { mode: { type: "string", enum: ["normal", "unseal", "trueform"] }, requestId: uuid }, false,
      async input => ({ ok: true, result: await client.plan(input.mode as "normal" | "unseal" | "trueform", input.requestId as string) })),
    tool("unharness_apply_plan", "Prepare the reviewed plan from this connection after the user requests that mode. Use its plan request UUID and a new operation UUID. Does not verify the running task. Retain the operation UUID after a timeout and inspect its saved result before another change.",
      { planRequestId: uuid, requestId: uuid }, false,
      async input => ({ ok: true, result: await client.apply(input.planRequestId as string, input.requestId as string) })),
    tool("unharness_operation_status", "Read a saved public-page operation using its original UUID. Completed receipts still distinguish success from failure. Unconfirmed or missing records do not justify retrying with a new UUID. After expiry, use the local workbench or local MCP public_operation_status.",
      { operationId: uuid }, true, async input => ({ ok: true, result: await client.operationStatus(input.operationId as string) })),
  ];
  const ready = (async () => {
    try {
      for (const definition of tools) {
        if (lifetime.signal.aborted) return "unavailable" as const;
        await modelContext.registerTool(definition, { signal: lifetime.signal });
      }
      return lifetime.signal.aborted ? "unavailable" as const : "available" as const;
    } catch { dispose(); return "unavailable" as const; }
  })();
  return { ready, dispose };
}
