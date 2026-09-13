# Public workbench development build

The static public interface has three entrances: a synthetic demo, installation guidance and connection to a locally approved registered scope. It shares the deterministic mode operations with the local workbench/MCP through the [restricted connection bridge](domain-connection.md). A dedicated build keeps the authenticated local workbench and its private readers out of the public entry.

```text
npm run check
npm run build:site
npm exec vite -- preview --config vite.site.config.mjs --host 127.0.0.1
```

The source entry is `site/index.html` → `web/src/public-main.tsx`; generated `site-dist/` is ignored. A local preview can demonstrate the static entry, but cannot redeem a public-origin connection. The connection origin is exactly `https://unharness.deltahelmlab.com`, fixed in the local bridge and browser protocol. The [published Mac QA](evidence/2026-09-11-public-mac-qa.md) verifies the real site at that origin and its native in-app-browser connection.

## Public introduction

The public introduction explains trying a selected harness before rewriting it,
then shows initial setup, configuration review, mode switching and artwork with
both screen and chat entry points. The demo is the primary entrance;
installation and already-installed connection are separate actions. The
appearance preview and the dedicated demo share the same illustrative mode
settings; neither reads or changes visitor settings nor measures AI performance.
The availability section distinguishes the current Apple Silicon Mac Codex
preview from Windows Codex next and Claude Code later. The current source
and published site can differ; see [status](status.md).

Connected operation uses **モード・設定・外観**. Mode selection, change review,
confirmation and an actionable blocking reason share one area. Read-only AI
inspection prompts remain usable when changes are blocked. The public snapshot
does not expose initial-registration or saved-setup details beyond its existing
fields; a connected scope is already registered, and unavailable state must not
be guessed as initial setup. Purpose-labelled local links use an allowlisted
client-side `view` fragment to open settings, history or support without changing
the selected scope or granting any operation. See [workbench UX](spec-workbench-ux.md).

## Connection and operations

The one-time v2 fragment is removed before network requests. Exact keys, protocol, canonical port and launch/ticket identifiers are validated before constructing a loopback URL. The grant includes the exact registered scope, root artwork collection and thirteen ordered capabilities; v1 fragments/grants are refused, not expanded. Public requests use CORS, omitted credentials, no referrer, no cache and no redirects. The native browser's own local-network permission remains in force.

The page keeps its ticket and connection token only in memory. Issuing and approving remain local operations; the public page exposes neither. Reloading the public page loses its grant. It distinguishes disconnected, pairing, connected, expired, incompatible and unknown states; losing current-state evidence clears the prepared-state and plan display.

`PublicConnection` owns the shared calls for both buttons and WebMCP. It validates response shape and scope, binds receipts to their original requested mode/revision, suppresses duplicate in-flight writes, and keeps the original operation ID after uncertainty. Results are stored in the view separately from subsequent status requests. Expiry during an accepted write can therefore show its historical result while current connection/state remain expired. A recovered plan can be reviewed after a same-ID result lookup. Local setup adoption advances the existing revision and invalidates an older public plan.

The page can open the currently verified local workbench for configuration saving, comparisons, favorites and source recovery. Configuration advice and fresh-task requests have copyable handoffs with a selectable fallback. The published installer and public-origin GUI/WebMCP operations are verified in the QA above. Fresh Desktop model tasks and the full AI-led onboarding journey remain unfinished.

## Artwork

The public `ArtworkPort` uses the same import, collection, card and selected-appearance components as the local workbench. The local approval screen explicitly includes image/collection reads, review, save, selection, naming and artwork-save recovery. File selection happens in the browser; authoring locations remain available only to the private MCP/Skill. Three-pose previews and cards do not prepare a source mode.

Artwork receipts have their own validators and history. A lost result is looked up with the original operation ID; the client never reuploads a known request automatically. Its history contains compact expectations and byte fingerprints rather than base64 images. Definitive artwork errors leave sound mode state usable; unknown authentication/binding clears current connection claims. Expiry can preserve a historical saved result without presenting a current selection as verified.

Images use authenticated POSTs with exact PNG type and declared/streamed byte limits, cancellation and stale-connection/expiry checks. The existing renderer independently checks content hashes and decoded images. Visible metadata is checked periodically for private-MCP updates. Unchanged checks preserve pages the user has already expanded; changed state or pending recovery refreshes the shared view, and read failures remain visible.

## Website tools

The page feature-detects `document.modelContext.registerTool` and registers eleven tools: the existing `unharness_status`, `unharness_plan_mode`, `unharness_apply_plan` and `unharness_operation_status`, plus `unharness_artwork`, `unharness_artwork_item`, `unharness_read_appearance_import`, `unharness_save_appearance_import`, `unharness_select_appearance`, `unharness_name_appearance` and `unharness_recover_appearance`. Model tools cannot upload base64, read arbitrary paths or access authoring locations. Artwork and mixed-receipt tools mark user-supplied names/authors as untrusted data.

Registration uses `AbortSignal`; missing capability or partial registration is reported without claiming success. Tool input uses exact schemas and the same connection client. An aborted call before dispatch does not operate; cancellation after an accepted mutation does not undo the local transaction or create a replacement request.

The demo closes this page's connection before showing sample data. Demo controls do not use local operations, and website tools cannot operate a disconnected scope. Tool registration inside the page is distinct from actual enumeration and invocation by Codex Desktop. Actual enumeration and mixed GUI/WebMCP invocation were verified in the published Mac QA; automated registration checks alone do not establish them.

## Publishing boundary

The maintainer selected the existing `deltahelmlab-unharness` Cloudflare Pages project, separate from the main DeltaHelm Lab site. The first approved rollout and its 21-file comparison are historical evidence. The [0.0.8 artwork qualification](evidence/2026-09-13-awakening-motion.md) records the current release, 48-file comparison and live appearance selection; the [0.0.6 qualification](evidence/2026-09-13-mac-codex-completion.md) retains the native mode/control baseline. A host-specific `disable_rum` Configuration Rule prevents the parent zone's analytics injection on this site while leaving the parent site's settings unchanged.

`site/public/_headers` supplies CSP and referrer/content-type/frame protections. Document and immutable asset cache rules do not overlap for the same header. The build uses local bundled assets and has no analytics, external scripts or account backend. Each built file is below the documented [25 MiB Pages limit](https://developers.cloudflare.com/pages/platform/limits/). The installed package/Node ZIP is served as the pinned GitHub release asset, separately from the static build.

See the earlier [mode-client evidence](evidence/2026-09-10-public-client.md) and current [v2 artwork evidence](evidence/2026-09-11-public-artwork-client.md). Browser tests with a routed synthetic HTTPS origin do not establish real HTTPS, native local-network permission, DNS/TLS success or Codex website-tool invocation. The [published QA](evidence/2026-09-11-public-mac-qa.md) now adds those live checks with a fresh owned native profile; it does not establish fresh model-task loading.
