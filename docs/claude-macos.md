# Claude Code on macOS

How Unharness reads, prepares and observes Claude Code desktop sources, and
exactly where that differs from the Codex adapter. Read [registered
sources](spec-user-sources.md) first: the mode contract, plan/apply/recovery
boundary and retained-condition policy are shared, and only the differences
below are Claude-specific.

## Application adapters

`src/apps/` resolves one adapter from the registration's stored context. A
Codex registration keeps its original three-field context with no application
marker, so absence means Codex and no existing record migrates. A Claude
registration stores `{ application: "claude", claudeHome, project, appBundle }`.

Everything an application decides — its source paths, eligibility rules, the
bytes each mode writes, its control keys, its task-record grammar and its run
measurement — lives in its adapter. The shared core keeps snapshots, hashing,
the exclusive profile lock, journaling, recovery, favorites and the CLI, GUI
and AI operations. Restoration never depends on an application: the target
bytes are already saved, so recovery stays Node-only for both adapters.

## Sources

| Key | Path | Role |
| --- | --- | --- |
| `instructions` | `<home>/CLAUDE.md` | Selected optional global instructions; written by UNSEAL and TRUEFORM |
| `settings` | `<home>/settings.json` | Skill invocation policy (`skillOverrides`) plus retained user settings |
| `<skill>:body` | `<home>/skills/<name>/SKILL.md` | Captured and guarded; never written |

`<home>` is the Claude configuration directory (`~/.claude`, or whatever
`CLAUDE_CONFIG_DIR` selects). Project Skills under
`<project>/.claude/skills/<name>/SKILL.md` are discoverable with scope `repo`.

### Why these differ from Codex

- **One instruction file, no override pair.** Codex has `AGENTS.md` plus
  `AGENTS.override.md`, so its base file can stay untouched behind an override.
  Claude Code has a single user-scope `CLAUDE.md` and nothing falls back when it
  is replaced. UNSEAL writes the fixed minimal guide into it; TRUEFORM writes an
  inert `<!-- -->` comment, which Claude Code strips before injecting a memory
  file. Keeping the file present rather than deleting it avoids removing a user
  file to express absence, and makes Normal a byte replacement.
- **Skill policy is central, not per Skill.** Codex writes a per-Skill
  `agents/openai.yaml` for manual-only and `skills.config` for disabled. Claude
  Code keys both off one settings map: UNSEAL sets `"user-invocable-only"`
  (hidden from the model, still invocable with `/name`), TRUEFORM sets `"off"`.
  `SKILL.md` is therefore captured, hashed and guarded against independent
  edits, but it is never a control target and never rewritten.
- **Settings are layered, and only the lowest layer is ours.** Claude Code
  applies managed settings over project-local over shared-project over user
  settings. Unharness writes only the user layer, so it reads the layers above
  it to find out whether a user-layer override could take effect at all.
- **The catalog is a filesystem read.** Codex answers `skills/list` over a local
  read-only RPC. Claude Code on macOS ships inside the desktop bundle with no
  CLI and no local RPC, so discovery reads the documented on-disk layout and
  says so in `limitations`. Discovery starts no process belonging to the
  application and calls no model.
- **The freshness key is the desktop bundle version.** With no runtime to ask,
  a plan depends on `CFBundleShortVersionString` from the registered
  application. An application update invalidates dependent plans with
  `stale-discovery`. The runtime version is only observable from a task
  recording.

### What stays unselectable, and why it is visible

Discovery returns a `notices` list so a TRUEFORM absence claim is never read as
covering more than it does. The workbench renders them under the
unavailable-candidates disclosure, beside the sources it refused:

| Notice | Meaning |
| --- | --- |
| `user-rules` | `<home>/rules/*.md` load every session and no mode changes them |
| `managed-policy-instructions` | `/Library/Application Support/ClaudeCode/CLAUDE.md` cannot be excluded and is preserved |
| `instruction-imports` | `@path` imports inside the selected file also disappear while it is replaced |
| `plugin-skills` | Plugin-owned Skills are provider sources, retained in every mode |
| `higher-precedence-settings` | A settings layer above the user layer names Skill overrides that win over anything a mode writes |
| `worktree-local-settings` | This project is a worktree, so its local settings come from the main checkout root |

A Skill is refused rather than silently omitted when it is not addressable:
`skillOverrides` is keyed by invocation name, so two discovered Skills sharing
one name report `skill-name-not-addressable`. A symlinked Skill directory
reports `source-redirection`; a `user-invocable: false` Skill reports
`manual-control-unavailable`, because making it manual-only would leave it
invocable by nobody. Hooks are unchanged in this slice, as for Codex.

### Settings precedence

Claude Code applies settings highest first: managed, then
`<project>/.claude/settings.local.json`, then `<project>/.claude/settings.json`,
then `<home>/settings.json`. In a git worktree it reads the local file from the
main checkout's root, which this resolves through the worktree's `.git` file.

A Skill named in any layer above the user layer reports
`skill-override-shadowed` and cannot be selected: a user-layer write would be
overridden, so preparing one would claim an effect it cannot have. Its
**current** state is still reported truthfully from the winning layer, in both
directions — a project `"off"` over a user `"on"`, and a local `"on"` over a
user `"off"`. A layer that appears after registration invalidates the affected
plans with `stale-discovery`; returning to the saved Normal never depends on
the catalog. Project and managed settings are read, never written.

A layer file that exists but cannot be parsed blocks registration rather than
being skipped, because the effective state is then unknown.

One boundary cannot be closed from disk: managed settings can also arrive by
MDM configuration profile, from the claude.ai console, or from the embedding
desktop application, and none of those is a readable file. A prepared
user-layer override is therefore confirmed only by a fresh task observation,
which is what `limitations` says.

### Retained settings

`settings.json` mixes managed and retained state. Only the `skillOverrides`
entries for registered Skills are managed; every other key — permissions,
memory, model, status line, unselected override entries — is retained. An
independent edit that touches only retained state can be reviewed with
`plan-retained` and recorded as a new Normal with `accept-retained`, without
writing a managed file. An edit that changes a selected Skill's override is a
conflict.

The reconciliation is structural rather than a line diff, because JSON has no
comments. It refuses any document containing a number this process cannot
reproduce byte for byte — `9007199254740993`, `1e2`, `1.0`, `-0` — since the
parser rounds such a literal before any before/after comparison could prove the
value survived. A refused file is left exactly as the user wrote it, and the
settings source is reported unavailable rather than rewritten.

## Task observations

A Claude Code session is one JSONL file at
`<home>/projects/<project>/<taskId>.jsonl`, located by filename only. Its
startup attachments carry what the session actually loaded:

| Attachment | Used for |
| --- | --- |
| `instructions` | Which instruction files reached the session, and their content |
| `skill_listing` | The Skill names the model was shown |
| `model` | `identity.modelId` |

Because that surface differs from the Codex world-state record, Claude
observations are persisted as `schemaVersion: 2` with their own reason
vocabulary. Codex observations keep `schemaVersion: 1` unchanged; nothing
migrates. A matched claim additionally requires a qualified runtime version.

A task is unqualified when its `entrypoint` is not `claude-desktop`, its
`userType` is not `external`, any record is a sidechain (a subagent, not the
requested task), its `cwd` is not the registered project, it started before the
current preparation or in the future, or no assistant record ended a turn.

Two boundaries are worth stating plainly. UNSEAL and TRUEFORM both predict the
Skill is **absent** from the listing shown to the model; the recording does not
distinguish "manual only" from "off", because the `/` menu is not recorded.
And `memoryGuidanceRecorded: false` means the projection saw no auto-memory
index in this recording — never that the user's memory is disabled or empty.

## Ordinary run measurement

`review-run` projects the same measurement shape as Codex, under
`app: "claude-desktop"` and `parserVersion: "claude-desktop-2.1.260/v1"`. Two
properties of the recording shape it:

- Several `assistant` records can belong to one API request and repeat the same
  `usage`. Usage is attributed **once per `requestId`**; a repeat with different
  numbers is a `response-replay-conflict` that withholds every total rather than
  charging twice.
- The recorded usage carries component counters (`input_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`,
  `output_tokens_details.thinking_tokens`) but **no total**. `totalTokens`
  therefore stays `null` with `response-usage-missing-field`, and availability
  is `partial`. Deriving a sum would publish this parser's arithmetic under a
  field name that means a recorded value for the Codex parser, so comparisons
  across the four component counters stay exact and the total stays unknown.

A `user` record starts a new turn only when it is a human prompt; tool results
share the same record type and are not turn boundaries.

## Sequential replay is unavailable

`review-replay` and every later replay operation fail with
`replay-application-unsupported` for a Claude registration. The blocker is
concrete: a qualified attempt needs a runtime-authoritative report of the
resolved configuration layers, Skill catalog and hooks before the task starts,
and a command that opens one specific project as a fresh task. Codex provides
both through its local app server and `codex app <project>`. Claude Code on
macOS ships inside the desktop bundle with no CLI and no local read-only RPC,
so neither exists on this machine.

Saved starting conditions (`review-start`, `save-start`, `start`, `starts`) are
application neutral and remain available, as do ordinary recorded runs and their
comparison. Substituting a weaker preflight would produce a different
comparison product under the same name; the refusal is deliberate.

## Running it

Read-only discovery, from the project root:

```bash
node bin/unharness.mjs sources discover --json "{\"application\":\"claude\",\"claudeHome\":\"$HOME/.claude\",\"project\":\"$PWD\",\"appBundle\":\"/Applications/Claude.app\"}"
```

`discover` and `locate` take the context object directly. `register` takes it
under a `context` key alongside the discovery identity and the selection.

The registered workbench, after `npm run build`:

```bash
node bin/unharness.mjs gui --manage-sources --app claude --claude-home "$HOME/.claude" --project "$PWD" --app-bundle /Applications/Claude.app
```

The AI connection over stdio, against an already registered workspace:

```bash
node bin/unharness.mjs mcp --workspace <registered-workspace>
```

Registration requires an explicit optional-role declaration. A source under a
home directory is not evidence that the user authored it or wants it removed;
`userAddedOptional` must be an explicit decision, and Unharness never selects
one for the user.

## Verified boundary

See [the Mac Claude Code evidence](evidence/2026-09-09-claude-desktop-macos.md)
for what was actually run, on which versions, and what remains unknown. The one
remaining Phase 2 step needs someone to drive the desktop window: its exact
fixture, launch control, request, expected observation and restoration are in
[native qualification](claude-native-qualification.md).
