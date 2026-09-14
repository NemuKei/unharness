# Guided product entry implementation plan

> Execute inline with the executing-plans skill. The maintainer approved the
> screen concept and progression into the product on 2026-09-14; no further
> design approval or subagent workflow is needed for this reversible scope.

**Goal:** Bring the accepted bilingual Codex entrance into the real public
product and let its management Skill guide startup from actual state.

**Architecture:** Keep PublicConnection and registered configuration operations
unchanged. Share language and Codex draft helpers between production and the
concept. Add a bounded read-only release check to the installed MCP; the AI
continues through existing installation, registration, setup and recovery paths.

**Spec:** [Accepted concept](../../guided-entry-preview.md),
[domain entry](../../spec-domain-entry.md), [guided setup](../../spec-guided-setup.md).

**Constraints:** No paid API, hosted backend, unsolicited model calls or auto
updates. Preserve Normal, memory, task continuity, permissions, provider items,
managed/project requirements, immutable versions and independent edits. Native
prefill, package installation, running MCP, fresh-task loading and public HTTPS
qualification remain separate evidence. Personal installation is outside this
implementation's synthetic checks. Publication is a separate commitment.

## 1. Actual versions and bounded update discovery

- [x] Add `src/setup/product-version.mjs`: capture package identity when the MCP
  starts, and read metadata at that same installation root on later checks.
  Return unavailable on malformed or mismatched metadata. Explicitly leave the
  host's selected plugin path and fresh-task Skill loading unknown.
- [x] Add `src/setup/releases.mjs`: parse a strict versioned public release
  catalog, compare numeric release versions, allow only this repository's exact
  GitHub release/archive/source URLs, bound response size/time, reject redirects,
  and return unavailable on offline or malformed responses.
- [x] Add `check_updates` to the native plugin's tools with no path/URL inputs;
  attach version evidence to `installation_status` and `status`. The read-only
  check sends no profile, project, configuration or local version to the site.
- [x] Write and run failing tests first for 0.0.9 versus 0.0.10, newer local
  builds, changed files with an older running snapshot, unknown versions,
  offline/malformed/oversized/redirect responses and zero mutations. Use
  synthetic metadata and a fake fetch response, never a private profile.
- [x] Serve `releases/macos-arm64.json` as part of the ordinary static site;
  derive the public download card and startup reference from that same published
  catalog. Keep 0.0.9 until a replacement archive is published and verified.

## 2. Production entrance and language

- [x] Move the verified Codex draft helper into a shared production module;
  preserve encoding and the copy fallback. Native launch is an ordinary link,
  with no script claiming that Codex opened successfully.
- [x] Integrate the accepted hero, persistent GitHub/language controls and
  installation handoff into PublicApp while retaining real connection tools,
  consent, pending-operation and recovery behavior. Keep demonstrations visibly
  synthetic and prevent them from invoking configuration operations.
- [x] Provide Japanese/English for the entrance, installation, demo and ordinary
  connected journey; language changes preserve the current page and selection.
  Keep machine identifiers and user-authored content unchanged.
- [x] Extend real browser checks for JA/EN requests and labels, fallback copying,
  mode/appearance preservation, unsupported targets and disconnected writes.
  Existing connection and operation tests remain required.

## 3. AI-guided startup and release preparation

- [x] Update the bundled management Skill: check status and updates on a general
  open request, explain an available update and ask update/continue once, allow
  offline/deferred continuation, guide missing connection and first Normal, then
  offer one useful next step. A concrete mode/recovery request goes straight to
  its established operation. Skill-content editing remains optional and separate.
- [x] Document update verification: preserve recovery before native installation,
  refresh/restart as needed, then compare the new MCP identity in a fresh task;
  catalog/file refresh alone is not completion. Never downgrade a newer install.
- [x] Run targeted core and browser regressions, check/build both products, review
  changed contracts and inspect the built public page at desktop/mobile sizes.
- [x] Record final evidence and update README/README.ja and relevant specifications.
  Commit/push scoped changes to main after verification. Prepare any required
  new package from clean source; keep publication/live evidence distinct.
