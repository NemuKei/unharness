# Public client and static entry — 2026-09-10

Scope: the public connection client, website-tool adapter and static interface, based on `b086e2c` in `codex/mac-finish`. Source/configuration tests used newly created owned synthetic profiles. Personal settings and public resources were not changed.

The client/adapter run passed **15 tests, zero failures and zero skips**:

```text
node --test test/web-connection.test.mjs test/web-connection-tools.test.mjs test/web-local-connection-contract.test.mjs
```

- Actual local HTTP tests exercised all three modes and exact Normal restoration, discarded mismatched connection/state data, preserved original operation IDs on lost responses, and retained a successful receipt through expiry or later failed status reads.
- A successful plan must match its requested mode/revision. Same-ID lookup recovers a lost plan for review. Late pre-write state responses cannot undo the resulting view, and adopting a new saved setup invalidates the public plan through the common revision.
- Website-tool adapter tests cover the four-operation boundary, exact arguments, disconnected calls, pre-dispatch cancellation, absent capability and partial/interrupted registration cleanup. These use a synthetic model-context implementation, not a Codex caller.

`npm run check` and `npm run build:site` passed. The built site then passed **three browser cases, zero failures and zero skips**:

```text
node --test test/web-entry.test.mjs test/web-public-workbench.test.mjs
```

The named Browser plugin was unavailable, so the existing Playwright runtime opened new owned headless Chrome profiles. Static files were served through a routed synthetic HTTPS origin; loopback requests were routed to the actual local HTTP server. WebMCP registration was represented by a synthetic browser interface. This setup deliberately does not establish real network permission or native Codex tool discovery.

Browser evidence covers the three entrances, Mac/Codex versus deferred combinations, sample-only demo, copy failure, fragment removal before connecting, real GUI mode changes, page-tool calls through the same client, open-page state updates, Normal restoration, bundled local-workbench navigation, receipt lookup after a lost apply response, and expiry clearing current-state claims. Runtime errors and horizontal overflow were absent in the passing runs. Intentional aborted requests/expiry responses are expected in the failure case. Screenshots at 1440 × 1050 and 390 × 844 were inspected; mode choices remain visible before desktop scrolling.

A browser-only defect was reproduced before repair: retaining native `fetch` as an unbound object method caused `Illegal invocation` before sending any request. The default client now invokes `globalThis.fetch` in its proper context. The same rendered connection tests passed after that correction.

The current build contains 19 files (about 4.9 MB total); its largest image is about 2.4 MB. Generated files are ignored. Read-only Cloudflare checks found the dedicated Pages project, no deployments/custom domains and no DNS record for the selected subdomain. Publishing, actual response headers, real HTTPS-to-loopback permission, Codex enumeration/invocation, artwork import and full package/onboarding qualification remain unfinished.

Primary references checked on this date: [Chrome's imperative WebMCP API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [local-network permission](https://developer.chrome.com/blog/local-network-access), [Pages response headers](https://developers.cloudflare.com/pages/configuration/headers/), [custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/) and [limits](https://developers.cloudflare.com/pages/platform/limits/). Their existence does not establish that the installed Codex browser supports this journey.

The exact staged source was exported to a separate temporary checkout, excluding all earlier appearance changes. It passed **45 client/backend/contract regression tests**, `npm run check`, both local and public builds, and **12 built-browser cases** (public entry/workbench, local connection, setup and inheritance), without failures or skips. All 223 relative Markdown links checked successfully. The 19-file public artifact passed file-size, source-map and fixture/private-path checks. Opening the temporary preview through Codex returned `queued`; that result is not evidence that the native app rendered it.

## Native preview and reviewed follow-ups

The subsequently opened loopback preview of `24c1aeb` was observed in the actual Codex in-app browser on macOS 26.6.2, Codex Desktop 26.903.61454 (8378). Its real website-tool capability enumerated all four Unharness tools; a native `unharness_status` invocation returned a successful disconnected result with no state. This establishes discovery and one read-only invocation on that loopback preview. It does not qualify the public HTTPS domain, network permission, pairing or mode switching through native website tools.

[PR #2](https://github.com/NemuKei/unharness/pull/2) and [PR #3](https://github.com/NemuKei/unharness/pull/3) are merged at `57a3663`. They preserve an already verified durable receipt through a delayed transport failure, isolate superseded connection attempts and distinguish an operation still running from an unknown result. The final Mac review source passed **77 focused/regression tests**, both builds, type/CSP checks and **15 browser cases**, all without failures or skips. An additional owned browser scenario confirmed lookup, connection expiry and a later failed original response retained one identical completed receipt with exactly one apply request. These browser checks retain the routed synthetic HTTPS/model-context boundary described above.

The later `2085b96` source preview also enumerated the four real website tools in the native Codex browser and returned a successful disconnected status. At its 1280 × 720 viewport the initial entrance cards fell below the fold. A height-specific desktop layout adjustment reduced the hero and card spacing; a browser regression reproduced the problem before the change and passed afterward, while retaining the mobile/demo/install/connection checks. The updated native screenshot shows all three complete entrance cards before scrolling. This is still a loopback preview and has not been published.
