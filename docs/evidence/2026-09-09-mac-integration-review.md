# Mac integration review before native Claude qualification

Codex reviewed Claude's committed Mac adapter through `6767c35` and combined it with the local appearance core through `d78e72b` on the isolated `codex/mac-finish` branch. The integration merge is `c9a601d`. Private main and the existing personal Codex registration were left unchanged during this review. Fresh native Claude mode and AI qualification is still pending; this is not a completed Mac release.

## Review findings and verification

Three concrete Claude findings were reproduced and returned to its implementation owner: an unsafe retained JSON number was rounded during a settings rewrite; higher-precedence Skill overrides were ignored during discovery/admission; and the GUI's background observation validator still required a Codex version field after a Claude observation. Claude corrected them and added regression coverage. Its documented discovery command was also corrected to pass the CLI's direct context object.

Codex independently ran the 12 settings/precedence tests against `e1d66a4`. After integration, the full suite included those checks and the actual built-browser external Claude observation update test. The app-specific path/control seam keeps heavyweight discovery, transformation and recording dependencies out of offline recovery. A trailing blank line in the extracted Codex adapter was removed; no additional behavior change was needed for this review.

```text
npm run check
npm run build
UNHARNESS_PLAYWRIGHT_MODULE=<existing-playwright-module> UNHARNESS_BROWSER_EXECUTABLE=<installed-chromium> node --test --test-concurrency=4
git diff --check 90b929b
```

Result: **723 tests, 722 passed, zero failed, one existing platform-conditional skip**. TypeScript, the CSP-compatible renderer check, the production build and the branch whitespace check passed. Both browser environment variables pointed at already installed local software; no browser/runtime was downloaded for this review.

The same-URL starting-form test that intermittently failed during Claude's handoff passed both alone against `6767c35` and in this integrated suite. No claim is made that its timing sensitivity was fixed. No product guard or assertion was weakened to obtain the result.

## Remaining native and product work

The documented Claude Desktop local environment editor was opened through the native UI. Its environment-variable field was empty and was closed without saving a change. This establishes that the editor is available; it does not establish that a fresh Code task honors the proposed fixture configuration directory.

The [native qualification plan](../claude-native-qualification.md) still needs fresh actual tasks, source observations, native MCP operations, open-GUI readback and exact restoration. Personal Claude source roles were not inferred or registered. The appearance recipe renderer, user-facing creation/collection and sharing/first-user/release preparation also remain open.
