# Published Mac preview and native public-page QA

Date: 2026-09-11 (JST). Public site source: `c81ee9cd77dec4302f4a3927e4b327a63cf520ca`. The maintainer explicitly approved publication of the repository/history, release and dedicated domain. This pass uses a newly created owned synthetic Codex profile on macOS 26.6.2, Apple Silicon, Codex Desktop 26.903.61454 and its native executable 0.153.4. It does not replace the remaining fresh-model-task qualification.

## Public delivery

- [Source repository](https://github.com/NemuKei/unharness) is public; unauthenticated repository API access returned `private: false`. PR #8 is merged.
- [Mac arm64 development preview 0.0.1](https://github.com/NemuKei/unharness/releases/tag/v0.0.1) is a published prerelease. Its tag fixes plugin source `258c674a4984e9d9c9cdda9e9dba16999fcbe834`.
- The ZIP is **91,901,182 bytes**, SHA-256 **`581f523d663958ddb78b016f8901305f5fa9cf4551b474364368d1bc8a0bc2d2`**. The public asset, SHA sidecar and a complete unauthenticated download agree. A separate real Codex in-app-browser download saved the same bytes in the Mac Downloads directory with a quarantine attribute.
- The public wrapper updates only the installation guide from the [private candidate](2026-09-11-final-native-candidate.md). Plugin distribution `dcacd38531d8a07e38da2488713966668548b09b585e47f6b7eac865674a28e3` is unchanged. All 7,406 extracted files and executable bits match the wrapper; its bundled Node signature and indexed content validate.
- [The public workbench](https://unharness.deltahelmlab.com/) is served by the dedicated `deltahelmlab-unharness` Pages project. Production deployment `d6e4ed38-1a2d-481c-9d9e-dd21df5304bd` reports successful static deployment from the site revision above, without Functions. The domain and TLS certificate are active.

The first live file comparison found that the parent Cloudflare zone injected its analytics beacon despite the site's CSP and absence of analytics in the build. A host-specific free Configuration Rule now sets `disable_rum: true` only for `unharness.deltahelmlab.com`. The parent site's analytics configuration is unchanged. Afterward, **all 21 served files matched the build's sizes and SHA-256 values**. The live response retains the self-only script policy, bounded loopback connection policy, no-referrer, nosniff and frame denial. No paid service or application backend was added.

## Installation and explicit connection

1. The public-download ZIP was extracted into a fresh owned test location. Native `plugin marketplace add` and `plugin add unharness@deltahelmlab-unharness` installed the distribution. The native app-server exposed 62 MCP tools. Configuring with only system directories in `PATH` used the bundled Node and created the independent recovery copy. No authentication file was copied and no model turn was submitted.
2. The actual in-app browser registered only the explicitly selected synthetic global instruction and optional Skill, retained the required project guide and other sources, saved Normal and an initial favorite, and saved an empty-official v2 pair through native MCP. Saving the pair left source files unchanged. The setup basis expressly records that this was fixture input, not a model consultation or proof of official-plugin control.
3. Native MCP requested a short-lived connection. The local UI displayed the exact site, registered scope, root artwork collection and thirteen permitted operations. Approval did not change source files. The approved link was opened through its documented in-app-browser handoff.
4. The actual **public HTTPS origin** connected to loopback: preflight returned 204, redemption and state/artwork reads returned 200. The browser's existing local-network permission was observed as granted; this pass did not change that permission. The one-time fragment disappeared from the address before the public page exposed its connected state.
5. Codex's real website-tool capability enumerated all eleven WebMCP tools. Calls below used those handles, without a synthetic `modelContext`, intercepted HTTPS routes or relaxed browser security.

One unused ticket expired after its two-minute issue lifetime. A second approved attempt ended unconfirmed before its ticket expired; its cause was not established. Later immediate approval/open/connect attempts succeeded without a product change. Clicking the local public link did not produce an observed popup in one attempt; the existing explicit in-app-browser handoff succeeded. Neither event is presented as a repaired defect or a guaranteed first-attempt connection.

## Shared GUI and WebMCP operations

| Actual entry | Action | Verified result |
| --- | --- | --- |
| WebMCP | Review and apply TRUEFORM | Prepared TRUEFORM, revision 2; two source changes |
| Public GUI | Review and apply UNSEAL | Prepared UNSEAL, revision 3; two source changes |
| WebMCP | Read the GUI operation's original ID | Completed, successful receipt matching that UNSEAL result |
| WebMCP | Review and restore Normal | Prepared Normal, revision 4 |
| Native MCP | Read all three original public receipts | Same successful operation results after the public connection |
| Independent source readback | Compare all seven saved source locations | Original bytes/absence and supported metadata match; no conflict or pending recovery |

The public UI continues to distinguish prepared files from unverified running-task state. These operations did not start a fresh Desktop model task and cannot establish task-loaded behavior.

## Artwork, cards and connection end

The public GUI selected a deterministic 724px synthetic PNG through the native file chooser, rendered three poses and saved it as a versioned appearance. WebMCP read that exact owned item and renamed it. The public collection then selected the standard appearance and reselected the saved work. Native readback verified the stored artwork, selected identity, receipts and unchanged Normal revision 4/source files after connection expiry.

A new explicitly approved connection generated a **1,200 × 820 PNG card** from that saved work. The public UI accepted only the chosen public work/author text and showed all three labeled poses without performance figures. The actual Mac Downloads file was inspected: 481,788 bytes, SHA-256 `93266e43a2d81eba76401831040866d3b8a8c49b5207d056c4ae3da98c9f633f`. The screenshot and saved PNG both show the selected synthetic work, chosen labels and author link. The automation's download-event wait timed out, but the file's current creation time, bytes and rendered contents independently prove saving. No social post was submitted.

Before local revocation, WebMCP still reported connected Normal revision 4 with no conflict or pending recovery, and the browser reported no warning/error logs. Local revocation then caused the public UI and WebMCP to report an expired/unavailable connection with `state: null`; current mode controls were removed. Natural expiry was also observed. Historical receipts remained readable through native MCP after expiry. Reload/restart/revocation handling beyond these live cases remains covered separately by the protocol tests.

The public installation request's copy action reported success, and the OS text clipboard independently contained the expected release URL, SHA and installation request. Its automation-only clipboard differed, so that buffer was not used as proof. The installer ZIP and card downloads above were checked as saved files rather than inferred solely from browser events.

## Checks and remaining scope

Before publication, type/CSP and both builds passed; sixteen explicitly enabled built-Chrome cases and one render check passed without skips. The final full source regression at `66b5dfa` passed **1,068 of 1,133 tests, zero failures, 65 optional/platform skips**. The later site revision changes published coordinates, entry wording and documentation; it does not alter the native payload.

The published source, ZIP, HTTPS-to-loopback connection, actual WebMCP calls, source round trip and public artwork/card saving are now verified within the environment above. Quarantine-preserving extraction/launch, Finder launch, reboot/remount, fresh Desktop model tasks using the installed package, AI-led initial setup/creation and positive automatic-only control of a nonempty official-plugin selection remain unqualified. The maintainer's strict legacy registration was not migrated or restored by this synthetic test. The development preview is not the completed Mac product.

Raw profiles, source bodies, connection tickets/tokens, clipboard contents and personal task recordings are excluded from this report and Git.
