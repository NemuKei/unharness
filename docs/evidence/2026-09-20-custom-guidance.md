# Custom UNSEAL guidance verification — 2026-09-20

Scope: unreleased setup v4 in the local development checkout. See
[the contract](../spec-custom-guidance.md). These checks use owned synthetic
profiles. No personal source files, provider plugin cache, installed package,
release archive or public site were changed.

## Automated evidence

- New input/compile tests were observed failing before implementation. They now
  cover exact UTF-8 body preservation, the 8192-byte bound, blank/control/invalid
  Unicode rejection, strict mode fields and unchanged v3 behavior.
- Save/prepare/restore tests cover record-only adoption, TRUEFORM exclusion,
  byte-identical Normal restoration, old v3/custom favorites, Skill/plugin
  enrollment, frozen-body tampering, independent edits and interruption recovery.
  The actual v3 writer at `cc97c9b` refuses a v4 workspace before source writes.
- CLI, MCP and local HTTP share the same review identity and strict schema;
  unknown setup versions still fail. Render tests check escaped text and legacy
  summaries. Observation/replay tests recognize only the prepared frozen custom
  body, retain an old favorite's original scope and observe v4 Skill enablement.
- A full `node --test --test-concurrency=4` run before the final review fixes
  reported 1406 tests: 1320 passed, 83 skipped, 3 failed. Two failures were old
  assertions that setup v4 must be rejected; these now accept v4 and reject v5.
  The other failure is the pre-existing local-entry pairing assertion in
  `test/gui-launch.test.mjs:62` (`approved` undefined instead of false). It was
  reproduced against the untouched task baseline. It is outside this change.
- After the review fixes, the affected observation/replay/custom/entrypoint suite
  passed **177/177** with no skips. The full suite was not repeated after those
  fixes. The earlier targeted v4 plugin-enrollment test also passed.
- `npm run check` and `npm run build` passed after the final code changes.
  The build retains the existing >500 kB chunk advisory.

## Built GUI evidence

The built loopback GUI was exercised in Codex's in-app browser against a newly
created synthetic profile:

1. A saved custom pair left the prepared mode at Normal. Selecting UNSEAL showed
   the saved text, including a literal script-tag example rendered as plain text.
2. Reviewing and confirming prepared UNSEAL. Selecting TRUEFORM showed no added
   instructions; confirming prepared TRUEFORM. Normal then restored every
   registered captured file exactly.
3. The saved-target editor loaded v4, switched the instruction choice to None
   and back to Saved custom instructions, and reviewed the original exact body.
4. Saving the pair preserved the prepared Normal mode and all source files.
   The saved custom body still matched its original value.
5. The visible layout wrapped the text without horizontal overflow. Browser
   error/warning logs were empty; no script element was created from the body.

These are source preparation and synthetic task-record checks, not a fresh
model task's native runtime qualification. Official plugins remain at their
saved Normal state; this work adds no individual remote-plugin OFF support.

## Deployment boundary

Setup v4 is not in the installed 0.0.8 package. The live Mac runtime observed
while preparing this work is Codex `0.155.0-alpha.9.2`, whereas registered plugin
and source-state write qualification is pinned to `0.153.4`. The current
read-only inventory therefore reports a dependency/version conflict. Do not
relax that check, rewrite Normal, edit plugin caches or put the recommendations
in an always-on instruction field to bypass it. Native compatibility and a
reviewed package update remain separate before personal adoption/preparation.
