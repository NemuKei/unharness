# Local public-connection approval — 2026-09-10

Scope: the local approval screen, owned-launcher/MCP issuance and old public-operation lookup, built on `6e31b91` in `codex/mac-finish`. All configuration reads and writes used newly created owned synthetic profiles. Earlier appearance changes were preserved separately. No personal configuration or public site was changed.

The focused backend/contract run passed **35 tests, zero failures and zero skips**:

```text
node --test test/gui-pairing.test.mjs test/gui-remote-http.test.mjs test/gui-remote-controller.test.mjs test/gui-launch.test.mjs test/ai-public-connection.test.mjs test/web-local-connection-contract.test.mjs
```

This includes one-time local cancellation before and after redemption; fresh details despite repeated read IDs; HMAC-authorized issuance without approval or token disclosure; same-ID MCP retries; strict public-link binding; and old public receipts through the workspace ledger. A Pro static review identified that damaged request claims could appear as not-found. A failing reproduction preceded the fix: HTTP, local and MCP lookup now preserve the unknown result, and the underlying operation is never replayed.

`npm run check` and `npm run build` passed. The built local screen then passed **three browser cases, zero failures and zero skips**, using `test/web-local-connection.test.mjs`. The named Browser plugin was unavailable; the existing Playwright runtime opened a new owned headless Chrome profile on this Mac.

- An AI-issued local handoff removes its pairing fragment, shows the exact site/scope/operations, focuses the review heading and requires approval. Cancellation invalidates the token. Reloading retains only a non-authorizing pairing UUID, and the old plan receipt remains readable after revocation.
- A lost issuance response keeps the same request ID; lost approval is resolved through fresh details. The copy-failure fallback selects the link. Expiry hides it, and refusal prevents redemption. Desktop 1440 × 1000 and mobile 390 × 844 screenshots were inspected; no horizontal overflow or relevant application errors remained. Deliberately aborted network requests are expected in the failure case.
- Invalid polling results hide the link and approval controls until a valid read restores the state. Unrelated fragments do not reopen the approval panel.

The tests verify that connection approval/refusal/lookup do not alter source files or preparation state. The direct public redemption used Node HTTP with the configured Origin; it does **not** establish HTTPS-to-loopback permission in Chrome or Codex. Public client, WebMCP, hosting and the full native Mac product journey remain unqualified.

Before commit, the exact staged source was exported to an isolated temporary checkout excluding the earlier appearance work. It passed **78 backend/contract/regression tests** and **eight built-browser cases** (the three connection cases plus the five existing setup/inheritance cases), with no failures or skips. Type checks, build, 215 relative Markdown links and diff whitespace checks passed. The management Skill's frontmatter, schema, naming, description and placeholders were checked using the locked YAML dependency; the Python validator itself was unavailable because PyYAML was absent.
