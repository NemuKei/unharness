# Public-page connection protocol

The development build has a restricted public-page backend, local approval screen and MCP handoff for one locally selected, registered source workspace. This is part of [domain entry](spec-domain-entry.md). The public client, WebMCP and actual HTTPS-to-loopback browser qualification remain subsequent work; the complete public entry is not yet qualified.

## Local authority and lifetime

The initial public origin is the maintainer-selected `https://unharness.deltahelmlab.com`, fixed in the local runtime. No request can register a different origin, wildcard or suffix match. Serving the site does not authorize access to a PC.

The authenticated local API or owned HMAC launcher can issue a connection request. Only the local API can approve it. Issuing creates a random 256-bit ticket valid for two minutes; issuance is not approval. Approval binds the selected application, workspace identity, root scope, current scope, context and launch. Redemption consumes an approved ticket once and returns a separate random token valid for ten minutes. These deadlines are product defaults, not browser standards.

The local process stores connection-token hashes and pending tickets in process memory. Tickets/connections disappear on restart. Expiry, local revocation and a detected scope/context change refuse new requests. A revision change does not renew the connection or expand its scope. The public client must keep tokens only in memory and remove any one-time fragment after reading it; that public-client behavior needs its own tests.

The local screen shows the fixed site, selected Mac/application/project, registered-source count, allowed operations and expiry before approval. It can refuse or cancel both an unused ticket and a redeemed connection. Its session storage remembers only a non-authorizing pairing UUID, keyed to the launch/context/scope, so a reload can still cancel the connection. Neither ticket nor connection token is persisted there. An unreadable or mismatched status hides the link; an uncertain write retains the original request ID.

After `open_workbench`, MCP `request_public_connection` uses the owned launcher's separately signed request. It returns a local `/#pairing=<UUID>` approval URL and a summary without a ticket or token. The local screen consumes this fragment, reads the current binding and requires the displayed approval. An approved one-time public link contains only protocol, loopback port, launch UUID and ticket. Repeated issuance does not extend the original deadline. A new connection after known expiry is a new explicit logical request.

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

The local `/api/remote/` routes are `issue`, `approve`, `details`, `cancel`, `revoke` and `operation-status`. Each takes a local `requestId`; additional fields are respectively none, `pairingId`, `pairingId`, `pairingId`, `connectionId` and `operationId`. Existing local Host, Origin/fetch metadata, client marker and GUI token checks run first. Reads remain fresh with repeated read IDs; mutations retain duplicate-request checks. Repeating an issuance request does not renew its expired ticket.

Public projections omit paths, source names/bodies, guidance, recovery commands, memory, model identifiers and raw task recordings. Registration, setup editing, permission changes, arbitrary commands/paths and artwork readers are outside this initial capability. Images will use a separate bounded route.

## Operations outlive transport

The bridge reuses the source controller and `createRequestLedger`. Source transactions keep their locks, journals and recovery checks; public/local writes share one server queue. Authorization runs before receipt lookup and again when queued execution can start. After the service starts, expiry/disconnection does not cancel it or prevent receipt publication. Server shutdown drains public operations through result storage.

The durable ledger is the registered workspace's `ai-requests` directory, anchored to its root scope, with no public token saved. A plugin MCP ledger may instead live under its plugin binding. The local screen's public-operation lookup and MCP `public_operation_status` deliberately read the same workspace ledger as the bridge. The latter works without the GUI server, including after expiry or restart. Corrupt or missing request claims report `remote-operation-unconfirmed` without returning unidentified contents; they are not converted to proof of non-execution.

`completed` means a receipt was saved; `result.ok` distinguishes success from failure. Failed transactions can still need journal recovery. Corrupt/incomplete receipts remain unconfirmed and do not restart the service. Apply results are saved separately from subsequent status requests. After expiry, restart or scope change, use the local lookup for old operations; a new public connection does not inherit old plans or receipts. Never invent another request UUID to resolve a lost response.

[Backend evidence](evidence/2026-09-10-domain-bridge-backend.md) and [local approval evidence](evidence/2026-09-10-local-connection-approval.md) use owned synthetic profiles, real local HTTP and the built local screen in Chrome. They do not establish public-origin browser network permission, deployment, WebMCP discovery or the complete Mac journey.
