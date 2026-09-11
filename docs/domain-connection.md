# Public-page connection protocol

The development build has a restricted public-page backend, local approval screen, MCP handoff and [static public client](public-workbench.md) for one locally selected, registered source workspace. This is part of [domain entry](spec-domain-entry.md). The [published Mac QA](evidence/2026-09-11-public-mac-qa.md) now verifies publication, actual HTTPS-to-loopback access under the browser's existing granted permission, native Codex WebMCP calls, mode/artwork operations and local revocation. The full fresh-model-task onboarding journey remains unqualified.

## Local authority and lifetime

The initial public origin is the maintainer-selected `https://unharness.deltahelmlab.com`, fixed in the local runtime. No request can register a different origin, wildcard or suffix match. Serving the site does not authorize access to a PC.

The authenticated local API or owned HMAC launcher can issue a connection request. Only the local API can approve it. Issuing creates a random 256-bit ticket valid for two minutes; issuance is not approval. Approval binds the selected application, workspace identity, root scope, current scope, context and launch. Redemption consumes an approved ticket once and returns a separate random token valid for ten minutes. These deadlines are product defaults, not browser standards.

The local process stores connection-token hashes and pending tickets in process memory. Tickets/connections disappear on restart. Expiry, local revocation and a detected scope/context change refuse new requests. A revision change does not renew the connection or expand its scope. The public client keeps tokens only in memory and removes the one-time fragment before connecting; the [client evidence](evidence/2026-09-10-public-client.md) separates these tests from real browser-permission qualification.

The local screen shows the fixed site, selected Mac/application/project, registered-source count, artwork collection, allowed operations and expiry before approval. It explicitly includes artwork reads/review/save/selection/naming/recovery. It can refuse or cancel both an unused ticket and a redeemed connection. Its session storage remembers only a non-authorizing pairing UUID, keyed to v2, launch/context/current scope/root collection, so a reload can still cancel the connection. Neither ticket nor connection token is persisted there. An unreadable or mismatched status hides the link; an uncertain write retains the original request ID.

After `open_workbench`, MCP `request_public_connection` uses the owned launcher's separately signed request. It returns a local `/#pairing=<UUID>` approval URL and a summary without a ticket or token. The local screen consumes this fragment, reads the current binding and requires the displayed approval. An approved one-time public link contains only protocol, loopback port, launch UUID and ticket. Repeated issuance does not extend the original deadline. A new connection after known expiry is a new explicit logical request.

## Routes and data

Public calls use JSON `POST` under `/remote/v2/`, `protocolVersion: 2`, `X-Unharness-Client: 1`, an exact Origin and loopback Host. Calls other than `redeem` use `Authorization: Bearer <token>`. The grant's target contains `application`, `scopeId` and `collectionScopeId`; the collection ID is the registration root. Old v1 tickets/routes/fragments are never upgraded. Preflight permits only the required method/headers, an exact `Access-Control-Allow-Origin` and no credential cookies. Existing `/api/` authorization and the HMAC launcher channel remain separate.

Bodies retain strict UTF-8/JSON, exact fields and the 16 KiB limit except for image review: `ceil(64 MiB * 4 / 3) + 64 KiB` encoded JSON, with at most 8 MiB per decoded file and 64 MiB per set. Authentication and current binding are checked before reading a large body. One review upload may be held per server; completion, invalid input, interruption and disconnection release that capacity. Status/result reads remain available.

| Public operation | Input | Result |
| --- | --- | --- |
| `redeem` | `ticket`, `launchId`, `protocolVersion` | Connection and token after local approval |
| `status` | None | Scope, revision, prepared mode, setup/preparation waiting, conflict/recovery flags and unknown live runtime state |
| `plan` | `requestId`, `mode`, `expectedRevision` | Durable plan receipt with identity, scope, revision and changed-file count |
| `apply` | `requestId`, `planRequestId` | Durable result for that same connection's successful plan receipt |
| `operation-status` | `requestId` | That connection's public operation receipt |
| `artwork` | `after` (null or cursor hash) | Minimal collection page and selected appearance |
| `artwork-item` | `itemId` | One owned version without private acquisition/evidence data |
| `artwork-image` | `referenceId`, `assetId` | Owned item/review image as bounded `image/png` bytes |
| `review-appearance-import` | `requestId`, `importId`, `expectedStateId`, `manifest`, `files` | Durable image-review receipt; no adopted work yet |
| `read-appearance-import` | `reviewId` | Existing review summary |
| `save-appearance-import` | `requestId`, `reviewId`, `expectedStateId` | Durable saved-version receipt |
| `select-appearance` | `requestId`, `itemId`, `expectedStateId` | Durable selection receipt |
| `name-appearance` | `requestId`, `itemId`, `expectedStateId`, `name` | Durable name receipt; empty text restores the automatic name |
| `recover-appearance` | `requestId` | Durable artwork-save recovery receipt |

`mode` is Normal, UNSEAL or TRUEFORM. Public apply cannot submit an arbitrary `planId`; the backend resolves it from a completed successful `remote-plan` receipt belonging to that connection. Scope/revision and common content/conflict checks still apply. Another connection or local MCP plan cannot supply this authority.

The ordered grant capabilities are `status`, `plan`, `apply`, `operation-status`, then the nine artwork rows above. Review/save allow a null `expectedStateId` for an empty collection; selection/naming require an existing state hash. Image requests accept only owned references and asset IDs, never a supplied URL/path. Core import retains PNG decoding, template/ownership checks and immutable version storage.

The local `/api/remote/` routes are `issue`, `approve`, `details`, `cancel`, `revoke` and `operation-status`. Each takes a local `requestId`; additional fields are respectively none, `pairingId`, `pairingId`, `pairingId`, `connectionId` and `operationId`. Existing local Host, Origin/fetch metadata, client marker and GUI token checks run first. Reads remain fresh with repeated read IDs; mutations retain duplicate-request checks. Repeating an issuance request does not renew its expired ticket.

Public projections omit paths, source names/bodies, guidance, source-recovery commands, memory, model identifiers and raw task recordings. The explicit artwork permission adds image bytes, artwork names/authors, manifests and minimal collection/operation data. Registration, setup editing, permission changes, arbitrary commands/paths and private authoring locations remain outside this capability.

## Operations outlive transport

The bridge reuses the source controller and `createRequestLedger`. Source transactions keep their locks, journals and recovery checks; public/local writes share one server queue. Authorization runs before receipt lookup and again when queued execution can start. After the service starts, expiry/disconnection does not cancel it or prevent receipt publication. Server shutdown drains public operations through result storage.

The durable ledger is the registered workspace's `ai-requests` directory, anchored to its root scope, with no public token saved. A plugin MCP ledger may instead live under its plugin binding. The local screen's public-operation lookup and MCP `public_operation_status` deliberately read the same workspace ledger as the bridge. The latter works without the GUI server, including after expiry or restart. Corrupt or missing request claims report `remote-operation-unconfirmed` without returning unidentified contents; they are not converted to proof of non-execution.

Artwork writes use separate result projections in that same ledger. Strictly validated upload input becomes a compact SHA-256 fingerprint; base64 is not kept in durable input records and the existing ledger limit is unchanged. Reusing an operation ID with different input is a conflict. The browser likewise keeps compact expectations, separates artwork from mode receipts and preserves a verified terminal result against late progress/unknown replies.

`completed` means a receipt was saved; `result.ok` distinguishes success from failure. Failed transactions can still need journal recovery. Corrupt/incomplete receipts remain unconfirmed and do not restart the service. Apply results are saved separately from subsequent status requests. After expiry, restart or scope change, use the local lookup for old operations; a new public connection does not inherit old plans or receipts. Never invent another request UUID to resolve a lost response.

[Backend evidence](evidence/2026-09-10-domain-bridge-backend.md) and [local approval evidence](evidence/2026-09-10-local-connection-approval.md) use owned synthetic profiles, real local HTTP and the built local screen in Chrome. They do not establish public-origin browser network permission, deployment, WebMCP discovery or the complete Mac journey.

The [v2 artwork client evidence](evidence/2026-09-11-public-artwork-client.md) adds the bounded image/collection routes, shared public UI and mixed-receipt verification while retaining those qualification limits.
