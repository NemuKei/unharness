# Public artwork protocol v2 and shared UI

Date: 2026-09-11 (JST). Server base: `422e2bb1129c6c10d6643897cd83b46eafba5e4a`, retaining PR #6's protocol changes and the current Mac source/renderer fixes. The client code and tests are committed with this record. All source profiles and artwork used here were synthetic.

## Implemented boundary

The public client requires v2 fragments/grants, the registered scope and root collection, and thirteen ordered capabilities. Local approval explicitly names the artwork access. The public port uses the existing import/collection/card/Hangar components; its eleven WebMCP adapters omit uploads, private paths, authoring locations and arbitrary operations.

Artwork results have separate strict projections and history. Concurrent duplicates compare frozen input and real byte fingerprints; saved expectations omit base64. A known request is only looked up again, even when its claim is missing or unconfirmed. Verified successes and failures survive late replies and expiry. Images are authenticated bounded POSTs with type/size, abort, old-grant and expiry checks; renderer hash/decode validation remains separate. Artwork operations preserve the source configuration.

## Verification

- `npm run check` (TypeScript/CSP), `npm run build` and `npm run build:site` pass. Both outputs retain the dependency notices and existing bounded `blob:` image policy.
- **50 server checks pass**, including real artwork/core operations, pre-body authentication, wrong scopes/references, the one-upload capacity boundary, body interruption, naming reset and the existing mode lifecycle.
- The first full regression exposed an eager stock-asset JSON import in the v2 server boundary, preventing basic CLI startup without image assets. The policy/projections now use the existing pure core template and limits. **61 affected server/template/entry-point checks pass**, including actual configuration/status from a source-only export without dependencies or artwork files.
- **67 client/HTTP/boundary checks pass**. These include five real public-port/HTTP/core cases, deterministic transport-order cases, same-ID real-byte conflicts, terminal preservation, old protocol/collection refusal and image stream cancellation/size/expiry checks. A prematurely pulling synthetic stream was corrected to wait for an actual reader before exercising mid-stream cancellation.
- **14 built Chrome cases pass, none skipped**. They cover local approval, mode preparation/Normal restoration, three artwork poses, version save/reselection, lost save readback, expiry, private-core updates, cards, source-file invariance, expanded collections and artwork read failures. The HTTPS origin and WebMCP registry are routed test doubles; browser rendering, shared UI/port and local HTTP/core are real. Desktop and 390px layouts were inspected.
- The final default `node --test` run passes: **1,131 tests, 1,067 passed, 0 failed, 64 skipped**. Its optional browser/platform skips are separate from the fourteen explicitly enabled Chrome cases above.
- Independent review reproduced a 21-item collection collapsing from 21 visible rows to 20 at an unchanged poll. The public adapter now compares state and pending-recovery identities before refreshing. The browser regression observes two unchanged polls without losing expanded pages, then observes a private rename. Collection read failures remain visible without clearing sound mode state. The mixed operation-result tool also marks user names/authors as untrusted data.

Initial browser diagnostics included an in-flight route callback during fixture teardown and a single unidentified HTTP 400 during the first artwork flow. Teardown now drains routes before closing; later runs record only safe response path/status/error kinds. The final fourteen-case run has no unexpected errors, but the earlier unidentified response is not attributed to a proven production cause. One intermediate run also used a mistyped screenshot directory and was discarded after its permission error; no product permission was changed.

## Not established

No site deployment, DNS/TLS binding, real public HTTPS-to-loopback browser permission, native Codex WebMCP invocation, personal configuration change or external post occurred. These checks do not establish the final distribution, fresh native model tasks or the complete Mac product journey. The public v2 server and client must ship together; publishing the server alone would leave the old v1 page incompatible.
