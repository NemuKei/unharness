# Public-page connection protocol

The development server now has a restricted public-page backend for one locally selected, registered source workspace. This is the backend portion of [domain entry](spec-domain-entry.md). The approval screen, MCP handoff, public client, WebMCP and actual HTTPS-to-loopback browser qualification are subsequent work; these routes are not yet an end-user connection flow.

## Local authority and lifetime

The initial public origin is the maintainer-selected `https://unharness.deltahelmlab.com`, fixed in the local runtime. No request can register a different origin, wildcard or suffix match. Serving the site does not authorize access to a PC.

Only the existing authenticated local API can issue or approve a connection. Issuing creates a random 256-bit ticket valid for two minutes; issuance is not approval. Approval binds the selected application, workspace identity, root scope, current scope, context and launch. Redemption consumes an approved ticket once and returns a separate random token valid for ten minutes. These deadlines are product defaults, not browser standards.

The local process stores only token hashes. Tickets/connections disappear on restart. Expiry, local revocation and a detected scope/context change refuse new requests. A revision change does not renew the connection or expand its scope. The public client must keep tokens only in memory and remove any one-time fragment after reading it; that browser behavior needs its own tests.

## Routes and data

Public calls use JSON `POST` under `/remote/v1/`, `X-Unharness-Client: 1`, an exact Origin and loopback Host. Calls other than `redeem` use `Authorization: Bearer <token>`. Bodies retain the 16 KiB limit with strict UTF-8/JSON and exact fields. Preflight permits only the required method/headers, an exact `Access-Control-Allow-Origin` and no credential cookies. Existing `/api/` authorization and the HMAC launcher channel remain separate.

| Public operation | Input | Result |
| --- | --- | --- |
| `redeem` | `ticket`, `launchId`, `protocolVersion` | Connection and token after local approval |
| `status` | None | Scope, revision, prepared mode, setup/preparation waiting, conflict/recovery flags and unknown live runtime state |
| `plan` | `requestId`, `mode`, `expectedRevision` | Durable plan receipt with identity, scope, revision and changed-file count |
| `apply` | `requestId`, `planRequestId` | Durable result for that same connection's successful plan receipt |
| `operation-status` | `requestId` | That connection's public operation receipt |

`mode` is Normal, UNSEAL or TRUEFORM. Public apply cannot submit an arbitrary `planId`; the backend resolves it from a completed successful `remote-plan` receipt belonging to that connection. Scope/revision and common content/conflict checks still apply. Another connection or local MCP plan cannot supply this authority.

The local `/api/remote/` routes are `issue`, `approve`, `revoke` and `operation-status`. Each takes a local `requestId`; additional fields are respectively none, `pairingId`, `connectionId` and `operationId`. Existing local Host, Origin/fetch metadata, client marker and GUI token checks run first. Repeating an issuance request does not renew its expired ticket.

Public projections omit paths, source names/bodies, guidance, recovery commands, memory, model identifiers and raw task recordings. Registration, setup editing, permission changes, arbitrary commands/paths and artwork readers are outside this initial capability. Images will use a separate bounded route.

## Operations outlive transport

The bridge reuses the source controller and `createRequestLedger`. Source transactions keep their locks, journals and recovery checks; public/local writes share one server queue. Authorization runs before receipt lookup and again when queued execution can start. After the service starts, expiry/disconnection does not cancel it or prevent receipt publication. Server shutdown drains public operations through result storage.

The durable ledger is the registered workspace's `ai-requests` directory, anchored to its root scope, with no public token saved. A plugin MCP ledger may instead live under its plugin binding. The local public-operation lookup deliberately reads the same workspace ledger as the bridge.

`completed` means a receipt was saved; `result.ok` distinguishes success from failure. Failed transactions can still need journal recovery. Corrupt/incomplete receipts remain unconfirmed and do not restart the service. Apply results are saved separately from subsequent status requests. After expiry, restart or scope change, use the local lookup for old operations; a new public connection does not inherit old plans or receipts. Never invent another request UUID to resolve a lost response.

[Backend evidence](evidence/2026-09-10-domain-bridge-backend.md) uses owned synthetic profiles and real local HTTP. It does not establish browser network permission, deployment, WebMCP discovery or the complete Mac journey.
