# Public connection backend evidence — 2026-09-10

Scope: the local backend portion of [domain entry](../domain-connection.md), built on `c794b95` in `codex/mac-finish`. Existing appearance work was preserved separately. All source registration/writes used new owned synthetic profiles. This pass did not connect or change personal settings.

## Verified

- Six pairing cases cover issuance without approval, approved one-time redemption, exact origin, launch/protocol rejection, deadlines, revocation/restart and scope/root/context/workspace changes.
- Three policy cases cover actual/preflight Origin, Host and client restrictions, exact fields and omission of private state.
- Five controller cases cover all three modes, exact Normal restoration, concurrent duplicates, changed-request rejection, separate public/MCP receipts, stale plans, independent edits, expiry during accepted apply, subsequent status failure and corrupt receipts without replay.
- Five HTTP cases cover local approval, launcher/local-token separation, CORS/Host, strict JSON/body-size rejection, duplicate apply, local result lookup after expiry, real v2 additive registration, and shutdown during an accepted transaction. Shutdown waits through result publication; the final source journal is clear.

The focused regression command passed **55 tests, zero failures and zero skips**:

```text
node --test test/gui-pairing.test.mjs test/gui-remote-policy.test.mjs test/gui-remote-controller.test.mjs test/gui-remote-http.test.mjs test/gui-sources.test.mjs test/gui-launch.test.mjs test/ai-requests.test.mjs test/ai-session.test.mjs test/plugin-recovery.test.mjs test/distribution.test.mjs
```

This includes existing source HTTP, owned launcher, AI request/session, independent recovery and distribution checks. No new MCP permission or deployment was required. The ledger and source controller were reused without code changes for this slice. Launcher runtime identity now includes the bridge modules, so an updated bridge cannot silently reuse an older owned server.

The exact staged source candidate was then exported into an isolated temporary checkout, excluding all earlier appearance work. It passed the same 55 tests, `npm run check`, `npm run build`, and five existing built-Chrome setup/inheritance browser cases without skips. The browser cases exercise the bundled local workbench, not a public page. Relative Markdown links and `git diff --check` passed.

## Remaining qualification

Approval UI, browser handoff, public client, local MCP issuance, WebMCP, static-site publishing and actual public HTTPS-to-loopback permission are subsequent work. A Node request with an Origin header does not establish Chrome or Codex permission behavior. Existing local GUI/offline recovery remain available; no complete desktop support claim follows from these tests.

Primary documentation checked on 2026-09-10 supports the planned `document.modelContext` entry: [Chrome imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api), [WebMCP draft](https://webmachinelearning.github.io/webmcp/) and [OpenAI website tools](https://learn.chatgpt.com/de-DE/docs/webmcp). Documentation does not establish detection or execution in the installed Codex browser.
