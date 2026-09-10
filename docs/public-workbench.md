# Public workbench development build

The static public interface has three entrances: a synthetic demo, installation guidance and connection to a locally approved registered scope. It shares the deterministic mode operations with the local workbench/MCP through the [restricted connection bridge](domain-connection.md). A dedicated build keeps the authenticated local workbench and its private readers out of the public entry.

```text
npm run check
npm run build:site
npm exec vite -- preview --config vite.site.config.mjs --host 127.0.0.1
```

The source entry is `site/index.html` → `web/src/public-main.tsx`; generated `site-dist/` is ignored. A local preview can demonstrate the static entry, but cannot redeem a public-origin connection. The connection origin is exactly `https://unharness.deltahelmlab.com`, fixed in the local bridge and browser protocol. This pass does not publish that site.

## Connection and operations

The one-time fragment is removed before network requests. Exact keys, protocol, canonical port and launch/ticket identifiers are validated before constructing a loopback URL. Public requests use CORS, omitted credentials, no referrer, no cache and no redirects. The native browser's own local-network permission remains in force.

The page keeps its ticket and connection token only in memory. Issuing and approving remain local operations; the public page exposes neither. Reloading the public page loses its grant. It distinguishes disconnected, pairing, connected, expired, incompatible and unknown states; losing current-state evidence clears the prepared-state and plan display.

`PublicConnection` owns the shared calls for both buttons and WebMCP. It validates response shape and scope, binds receipts to their original requested mode/revision, suppresses duplicate in-flight writes, and keeps the original operation ID after uncertainty. Results are stored in the view separately from subsequent status requests. Expiry during an accepted write can therefore show its historical result while current connection/state remain expired. A recovered plan can be reviewed after a same-ID result lookup. Local setup adoption advances the existing revision and invalidates an older public plan.

The page can open the currently verified local workbench for saving, comparisons, favorites and recovery. Configuration advice and fresh-task requests have copyable handoffs with a selectable fallback. Public artwork import/collection and the final downloadable installer remain separate unfinished slices.

## Website tools

The page feature-detects `document.modelContext.registerTool` and registers four tools: `unharness_status`, `unharness_plan_mode`, `unharness_apply_plan` and `unharness_operation_status`. Registration uses `AbortSignal`; missing capability or partial registration is reported without claiming success. Tool input uses exact schemas and the same connection client. An aborted call before dispatch does not operate; cancellation after an accepted mutation does not undo the local transaction or create a replacement request.

The demo closes this page's connection before showing sample data. Demo controls do not use local operations, and website tools cannot operate a disconnected scope. Tool registration inside the page is distinct from actual enumeration and invocation by Codex Desktop. That native qualification is still required.

## Publishing boundary

The maintainer selected the existing `deltahelmlab-unharness` Cloudflare Pages project, separate from the main DeltaHelm Lab site. Read-only API checks on 2026-09-10 found the project with no deployments or custom domains, and no DNS record for `unharness.deltahelmlab.com`. Publication and domain binding require the maintainer's approval of the concrete artifact.

`site/public/_headers` supplies CSP and referrer/content-type/frame protections. Document and immutable asset cache rules do not overlap for the same header. The build uses local bundled assets and has no analytics, external scripts or account backend. Each built file is below the documented [25 MiB Pages limit](https://developers.cloudflare.com/pages/platform/limits/). The installed package/Node download is not yet part of this static build.

See [public client evidence](evidence/2026-09-10-public-client.md). Browser tests with a routed synthetic HTTPS origin do not establish real HTTPS, native local-network permission, DNS/TLS success or Codex website-tool invocation. Those require the actual approved deployment and a fresh native Mac journey.
