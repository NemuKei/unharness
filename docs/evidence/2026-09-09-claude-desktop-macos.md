# Claude Code Mac adapter — Phase 2 evidence

Dated 2026-09-09. What was actually run for the Claude Code desktop adapter on
macOS, on which versions, and what remains unverified. Read
[claude-macos](../claude-macos.md) for the design this qualifies and
[compatibility](../compatibility.md) for how it sits beside the Codex results.

This is scoped implementation evidence. It does **not** claim a completed Mac
release, verified runtime loading of a prepared mode, complete source coverage,
Windows support, or any performance result.

## Environment

| Item | Value |
| --- | --- |
| OS | macOS 26.6.2, build 25G83, arm64 |
| Desktop application | Claude 1.49585.0, `com.anthropic.claudefordesktop` |
| Claude Code runtime | 2.1.260, embedded in the desktop bundle |
| Node.js | 24.20.0 |
| Branch | `codex/claude-macos` |
| Source/test/evidence baseline | `1cac327a0997c349f4d634954de93087db02bcf3` |
| Handoff HEAD | `4bff4fe542bd56d76cffb7272b27b10ee177f709` |
| Revisions under test | `01705a3`, `e1d66a4` |

There is no `claude` executable on `PATH` and none inside the application
bundle; the runtime ships in the Electron `app.asar`. The runtime version above
was read from a session recording's `version` field, not from a CLI. The
desktop version is read by the adapter itself from
`/Applications/Claude.app/Contents/Info.plist` through `/usr/bin/plutil`.

## Commands and results

```text
npm ci --ignore-scripts
node --test --test-concurrency=2      # browser checks enabled, see below
npm run check
npm run build
git diff --check
```

`npm run check` and `npm run build` pass. `git diff --check` is clean.

Browser checks were enabled with the maintainer's already-installed runtime:
`UNHARNESS_PLAYWRIGHT_MODULE` pointing at the local Playwright module and
`UNHARNESS_BROWSER_EXECUTABLE` at the installed Google Chrome. Missing browser
configuration is a skip, not a pass, so the counts below distinguish them.

| Run | Tests | Pass | Fail | Skip |
| --- | --- | --- | --- | --- |
| Baseline `4bff4fe`, browser checks off | 616 | 598 | 0 | 18 |
| After the application seam (`01705a3`), browser checks off | 616 | 598 | 0 | 18 |
| Final, browser checks on | 687 | 685 | 1 | 1 |

The seam run reproduces the baseline exactly: the Codex adapter is a move, not
a rewrite, and no Codex record migrates.

The one skip is the existing platform skip, "unqualified platforms refuse both
publication and pending recovery writes". The one failure is the pre-existing
browser case below, which is not caused by this work.

### One pre-existing browser failure

`web-starting-conditions.test.mjs` → "built form stops an old reviewed save when
the same URL is rebound to another owned project and home" fails in this
environment with a 7 s click timeout on a disabled save button. It is **not**
caused by this work: the same test fails identically at the untouched handoff
baseline `4bff4fe`, with `dist` rebuilt from that revision, run in an extracted
copy of that tree. It passed in one browser-enabled run on this machine and
failed in the others, so it is environment- or timing-dependent.
It is a Codex starting-conditions case and is reported here rather than fixed,
because changing it is outside this handoff's scope.

## Real Claude Code environment, read only

`sources discover` was run against the maintainer's actual `~/.claude` with the
real project and the installed application. Nothing was written: no
`.unharness-user-sources` directory was created, and `~/.claude` is unchanged.

| Result | Value |
| --- | --- |
| `application` | `claude` / Claude Code |
| Global instructions | `~/.claude/CLAUDE.md` — **absent**, `no-effective-instructions`, not eligible |
| Skills discovered | 1 (`kanary`, user scope) |
| `kanary` | **not eligible**, `source-redirection`: `~/.claude/skills/kanary` is a symlink to `~/.agents/skills/kanary` |
| Notices | `worktree-local-settings` (count 0): this project is a git worktree, so Claude Code reads its local settings from the main checkout root |
| `unavailableSources` | none |

Two registration attempts were made and both were refused, correctly:

```text
register instructionsOptional=true  -> {"error":{"kind":"unsupported-source"}}
register selectedSkillIds=[]        -> {"error":{"kind":"optional-role-required"}}
locate                              -> null
```

**No real personal source can be registered in this environment today.** There
is no user-scope `CLAUDE.md`, and the only personal Skill is a symlink, which
the capture rules refuse rather than follow. That is a truthful result, not a
gap in the adapter: both refusals are the intended behavior.

The worktree notice is worth recording separately. The adapter resolved this
worktree's `.git` file to the main checkout and reported
`<main>/.claude/settings.local.json` as the file Claude Code would read its
local settings from, with an override count of 0 because that file does not
exist. This was found by review, verified against the primary documentation,
and then confirmed against this real checkout.

## Real recording grammar

The desktop record reader and the run parser were run against an actual Claude
Code 2.1.260 session recording on this machine — 1,066 records, 3,521,611 bytes
— not a fixture. Only counts and recorded-field presence are reproduced here;
no transcript text, prose or personal path is committed.

```text
claudeCodeVersion         2.1.260
provenance.desktopOriginator  true      (entrypoint "claude-desktop")
provenance.anySidechain       false
provenance.cwdMatches         true
recordedSources.instructions  field-recorded, 2 files, scopes [Project, Project]
recordedSources.skillListing  field-recorded, 82 names
recordedSources.model         field-recorded
permissionModeRecorded        auto
recordRead.incompleteTrailingLine  false
```

The measurement projection over the same recording:

```text
app / parserVersion   claude-desktop / claude-desktop-2.1.260/v1
runtimeVersion        2.1.260
turns                 3
usage.responseCount   191        (unique API requests)
usage.duplicateCount  180        (records repeating one request's usage)
usage.totals          inputTokens, cachedInputTokens, cacheWriteInputTokens,
                      outputTokens, reasoningOutputTokens all present
usage.totals.totalTokens  null
usage.availability    partial, reasons ["response-usage-missing-field"]
conditions            model claude-opus-5, effort max, execution policy digest
issues                ["turn-incomplete"]   (the recording was still open)
```

This is the point of the per-request attribution: 371 assistant records
collapse to 191 charged requests. `totalTokens` is null because Claude Code
records component counters and no total; deriving a sum would publish this
parser's arithmetic under a field name that means a recorded value for the
Codex parser.

## Owned synthetic profile

Everything below runs against a freshly created synthetic profile in a
temporary directory — its own Claude home, project and an `Info.plist`-only
application bundle. No application is launched and no model is called.

Node checks, 65 Claude cases across five files:

- **Discovery**: source layout, desktop version, effective instruction state,
  unmanaged-source notices, verification flags all false.
- **Refusals that stay visible**: a name shared by two scopes
  (`skill-name-not-addressable`), a symlinked Skill directory
  (`source-redirection`), a plugin Skill
  (`provider-managed-or-outside-owned-profile`), a `user-invocable: false`
  Skill (`manual-control-unavailable`).
- **Settings precedence**: project `"off"` over user `"on"` and local `"on"`
  over user `"off"` both report the winning state and refuse selection with
  `skill-override-shadowed`; a worktree reads the main checkout's local file; a
  layer added after registration invalidates plans with `stale-discovery`; an
  unparsable layer blocks registration.
- **Modes**: UNSEAL writes the fixed guide (`unharness-minimal-v1`, matching
  digest) and `"user-invocable-only"`; TRUEFORM writes the inert comment and
  `"off"`; every mode compiles from the saved Normal; Normal returns the exact
  original bytes, metadata and absence. An absent settings file is created and
  removed again. An unselected override entry and unrelated keys survive. An
  already-manual Skill needs no write.
- **Guarded sources**: `SKILL.md` is captured and hashed but is never a control
  key; the project instruction file is untouched.
- **Conflicts and recovery**: an independent edit blocks planning and is left
  intact; six interruption phases (`journal`, `staged`, `write-0`, `write-1`,
  `before-completion`, `state`) each recover to the exact prior bytes; a second
  recovery is a no-op; recovery refuses to overwrite an edit made during the
  interruption; recovery runs from the CLI with the settings transform, the
  frontmatter parser, YAML and the native catalog blocked at resolution.
- **Retained settings**: a retained-only edit is reviewable and recordable in
  all three modes with `managedFilesChanged: 0` and no key or value in the
  summary; an edit to a selected Skill's override is a conflict; an old
  favorite adapts across a new Normal and keeps the newer retained value.
- **Numbers that cannot round-trip**: `9007199254740993`, `1e2`, `1.0`, `-0`
  are refused and the file is left exactly as written.
- **Favorites and checkpoints**: a favorite restores its saved state exactly; a
  checkpoint undoes the last application; a duplicate apply returns the first
  result without rewriting; a changed desktop version invalidates a release
  plan while Normal still plans.
- **Observation**: a prepared UNSEAL task matches; a task still showing a
  withdrawn Skill is `not-matched-record`; the inert instruction file matches
  whether recorded verbatim, stripped, or absent; unqualified records
  (`cli` entrypoint, sidechain, wrong project, incomplete turn, unsupported
  version, unexpected user type) never become matched; a task started before
  preparation is `unqualified-record`; a missing recording is
  `task-record-unavailable` with every source unknown.
- **Comparison**: per-request attribution, replay conflict, cutoff selection,
  unfinished turn, unqualified recording, and a saved run with its source
  association, assessment and private output.
- **Replay**: refused with `replay-application-unsupported`; saved starting
  conditions still work.

Seven of those 65 drive the loopback HTTP and AI paths: the launch identity names the application and
carries no Codex fields; the browser cannot register an arbitrary path; the
full discover → register → plan → apply → save → Normal loop runs over the
built interface; a duplicate request identifier returns the first result once
and a changed payload under it is refused; a stale launch or context identity
is refused; the MCP stdio connection drives the same operations and its result
is visible to the open workbench.

Built browser, 5 Playwright cases with effects off: registration, UNSEAL
preparation, exact Normal return and no page errors; a shadowed Skill shown
under "利用できない候補" with `skill-override-shadowed` and
"UNSEAL: 非対応 ／ TRUEFORM: 非対応" instead of a working toggle; a 420 px
viewport with no horizontal overflow; server loss and same-port relaunch
leaving the workbench truthful; and an externally applied mode plus two
externally recorded Claude observations reaching the open page through
background updates, matched and not-matched, with no invalid-response notice.
That last case fails against the pre-fix validator and passes after it, which
is how it was confirmed to cover the reported defect.

## Review findings fixed during this work

Three defects were reported by checkpoint review and each was reproduced,
fixed and covered by a regression before continuing:

1. **A retained number outside the double range was silently rewritten**
   (`9007199254740993` became `...992`). `JSON.parse` rounds the literal before
   any before/after comparison could see it, so the round-trip check could not
   catch it. Source number tokens are now compared against their own
   re-serialization.
2. **Skill state was read from the user settings layer alone**, though Claude
   Code applies managed over project-local over shared-project over user. A
   Skill named in a higher layer is now unselectable with
   `skill-override-shadowed` while still reporting its true current state, and
   a worktree resolves its local settings from the main checkout root.
3. **The browser's background-update validator required `codexVersion`**, so a
   legitimate Claude observation was rejected as `invalid-response` and an open
   workbench would stop updating after a native `observe_task`. The validator is
   now application-aware, with a built-browser case that fails without the fix.

A fourth report corrected this document set rather than the code: the
`sources discover` example wrapped its context in a `context` key, which that
CLI does not accept. The corrected command is verified against the real
environment.

## What is not verified

- **A fresh native Claude Code task with a prepared mode**, and **the native
  AI connection**. Everything above establishes prepared file state, record
  projection and the loopback and MCP paths against owned data. No task was
  started against a registered profile, so runtime loading of UNSEAL or TRUEFORM
  by Claude Code is **unverified**. `runtimeStateVerified` and
  `modeSwitchingVerified` remain false and `sourceCoverage` remains unknown, as
  they should.

  The operator-assisted step that closes both is specified in
  [native qualification](../claude-native-qualification.md) and implemented as
  `test-support/claude-native-fixture.mjs`. Its full cycle — create, register,
  prepare each mode, list sessions, observe, restore, guarded removal — was run
  end to end here except for the three desktop tasks, with exact byte
  restoration. The launch control is the Code tab's own local environment
  editor setting `CLAUDE_CONFIG_DIR`; whether a desktop-launched session
  receives it is the first thing that run establishes.
- **The maintainer's real sources.** Discovery is verified against them; no
  registration, plan or write was attempted beyond the two refusals above.
  Selecting an optional role is the maintainer's decision.
- **A managed policy delivered outside a file.** MDM profiles, the claude.ai
  console and the embedding desktop application can all set managed settings
  that no file read can see. A prepared user-layer override is confirmed only
  by a fresh task observation.
- **Sequential replay.** Refused by design for Claude, with a recorded reason.
- **Windows.** Untouched by this work.
- **Any performance claim.** A lighter harness is a comparison condition.
