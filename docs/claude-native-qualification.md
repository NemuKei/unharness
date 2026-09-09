# Operator-assisted native Claude Code qualification

The remaining step for Phase 2. Everything below is prepared and tested except
the part that needs someone to drive the Claude Desktop window: starting a
fresh Code task and letting Unharness observe what that task actually loaded.

Reading an existing session recording and passing owned-fixture browser tests
do **not** verify fresh native mode loading, and they do not verify the native
AI connection. Those two are what this plan closes. See
[the Phase 2 evidence](evidence/2026-09-09-claude-desktop-macos.md) for what is
already established.

## Why an operator is needed

Claude Code on macOS ships inside the desktop bundle. There is no `claude`
executable on `PATH` and none in the bundle, so nothing here can start a task,
and nothing here should: dispatching a model task is not a deterministic local
operation. The harness prepares state before the task and projects the
recording after it; the task itself is a person using the app.

## The owned fixture

`test-support/claude-native-fixture.mjs` builds and drives everything. It works
only inside the gitignored `.unharness/claude-native/` directory: its own Claude
configuration directory, its own project, its own registered store. It never
reads, writes or registers the real `~/.claude`, launches nothing, and calls no
model.

```bash
node test-support/claude-native-fixture.mjs create
```

That creates a profile with two selectable sources and registers them:

| Source | Content | Why |
| --- | --- | --- |
| `<fixtureHome>/CLAUDE.md` | `- Always end your reply with the marker UNHARNESS-FIXTURE-GUIDE.` | A behavioral marker: the reply itself shows whether the instruction reached the model, independently of the recording |
| `<fixtureHome>/skills/example/SKILL.md` | a real directory, not a symlink | The Skill listing shown to the model is recorded by name |

It also writes `<fixtureProject>/.mcp.json` pointing at
`bin/unharness.mjs mcp --workspace <fixtureWorkspace>`, and sets
`enableAllProjectMcpServers` in the fixture's own settings, so the same operator
session can drive the deterministic operations through the native AI
connection. That settings key is retained state, so it survives every mode —
which is itself worth confirming during the run.

The fixture binds to the **installed** `/Applications/Claude.app`, because the
desktop bundle version is the freshness key for a Claude plan.

## Launch mechanism

`CLAUDE_CONFIG_DIR` relocates every `~/.claude` path
([primary documentation](https://code.claude.com/docs/en/claude-directory)), and
the string appears 11 times in the installed 1.49585.0 bundle, so the embedded
runtime references it.

The Code tab has a documented control for exactly this. Per the
[desktop reference](https://code.claude.com/docs/en/desktop#local-sessions):
the app does not inherit a full shell environment, and to set variables for
local sessions you "open the environment dropdown in the prompt box, hover over
**Local**, and click the gear icon to open the local environment editor."
Variables saved there are stored encrypted on the machine and apply to every
local session and preview server started afterwards.

**Use that editor first.** It needs no app quit, does not disturb the running
session, and changes nothing outside the app.

1. Open the local environment editor and **record what is already there**,
   including whether `CLAUDE_CONFIG_DIR` is already set and to what. That
   recorded before-state is the restoration target.
2. Add `CLAUDE_CONFIG_DIR` with the `setEnvironment.value` that `prepare`
   printed.
3. Start a **new** local session — existing sessions keep the old environment.
4. After the run, remove the variable, or return it to its recorded prior
   value. The variable applies to every local session started while it is set,
   so restore it as soon as the last mode is observed rather than later.

Because the stored value is encrypted, nothing here can read it back. Confirm
in the editor, and confirm functionally: if the launch worked, the new task's
recording appears under the fixture's `projects/` directory, which
`node test-support/claude-native-fixture.mjs sessions` lists. If it does not
appear there, the variable did not reach the session — that is the answer, not
a failure of the adapter.

If `Local` is greyed out in the environment dropdown, the
`disableDesktopLocalSessions` managed setting is in force on this device. That
is a hard blocker for the fixture route; record it and stop, rather than
working around a policy.

### Tested alternatives, in order, if the editor does not work

1. **Launch the binary from a terminal with the variable set.** Requires a full
   ⌘Q first — a second launch otherwise focuses the running instance, which
   does not have the variable — and quitting ends the current session. `open -a
   Claude` does **not** pass environment variables. `prepare` prints this line
   as `fallbackLaunch`.
2. **`launchctl setenv CLAUDE_CONFIG_DIR <fixtureHome>`**, relaunch normally,
   then `launchctl unsetenv CLAUDE_CONFIG_DIR`. This is machine-wide for newly
   launched apps until unset, so it needs an explicit decision and the cleanup
   is part of the step.
3. **If none work**, `CLAUDE_CONFIG_DIR` is not a usable control for the desktop
   Code tab. Record that specific blocker. The only remaining route is the real
   `~/.claude`, which needs the decisions in the last section.

The signed-in account lives in `~/.claude.json`, a sibling **file** of the
`~/.claude` directory, so it may or may not follow `CLAUDE_CONFIG_DIR`. If the
fixture session asks you to sign in again, that is expected and is not an
Unharness result either way.

## The run

Four tasks, in this order: `normal`, `unseal`, `trueform`, `normal`.

Normal comes **first** as a positive control. Until one task shows that the
fixture's instruction and Skill do reach a session, a later absence proves
nothing — it could just as easily mean the configuration directory never
applied. The final Normal is the restoration check.

```bash
node test-support/claude-native-fixture.mjs prepare <mode>
```

It prints the changed files, the planned Skill states, the fixed guide identity,
the preparation timestamp, the environment setting to apply, the project to
open, the request and the expected observation. Then, in the app:

1. Open the printed `openProject` directory in the Code tab.
2. Send exactly: `Give a one-line greeting without using tools.`
3. Let the turn finish.

The request deliberately does not constrain the reply's shape. An earlier draft
asked for "exactly READY and nothing else", which would have suppressed the
fixture's suffix marker whether or not the instruction loaded, so an absent
marker would have proved nothing.

Then, back in this repository:

```bash
node test-support/claude-native-fixture.mjs sessions      # lists the new task UUID
node test-support/claude-native-fixture.mjs observe <task-uuid>
```

### What each mode should show

The recorded evidence is primary. The reply marker is a secondary observation.

| Mode | Recorded user `CLAUDE.md` | Recorded Skill listing | Observation | Marker, secondary |
| --- | --- | --- | --- | --- |
| Normal | the saved fixture guide | contains `example` | `matched-record` | reply expected to carry `UNHARNESS-FIXTURE-GUIDE` |
| UNSEAL | the fixed minimal guide | omits `example` | `matched-record` | marker not expected |
| TRUEFORM | the inert comment, or absent | omits `example` | `matched-record` | marker not expected |

A model may decline or vary a behavioral instruction for reasons that have
nothing to do with loading, so the marker on its own settles nothing. Record it
anyway: if the recording says `matched-record` and the marker disagrees, that
disagreement is a finding worth more than either check alone.

If the **first** Normal task does not show the marker and does not list
`example`, stop: the configuration directory did not apply, and nothing after
that is evidence about modes. Check `sessions` — a recording that never appears
under the fixture's `projects/` directory is the same answer.

`unqualified-record` with `task-before-preparation` means the task started
before `prepare` ran — start a genuinely new task. `unknown-record` with
`task-record-unavailable` means the session was written under a different
configuration directory, which is itself the answer to whether the launch
mechanism worked.

### The native AI connection

In the same session, with the fixture project open, ask Claude to use the
`unharness` MCP server: read `status`, then plan and apply a mode, then read
`status` again.

If the server does not appear, check `~/.claude.json`: a top-level `mcpServers`
entry with the same name takes precedence over a project `.mcp.json` in the Code
tab. On this machine that file currently defines no `mcpServers`, so there is
nothing to collide with, but it is the first thing to look at. That exercises the same deterministic operations over the
native connection rather than over the loopback interface. Confirm afterwards
with `node test-support/claude-native-fixture.mjs status` that the recorded
prepared mode matches, that there is no conflict, and that recovery is not
pending.

## Restoration

```bash
node test-support/claude-native-fixture.mjs prepare normal
node test-support/claude-native-fixture.mjs status     # preparedMode normal, conflict null
node test-support/claude-native-fixture.mjs remove     # refuses unless Normal and recovered
```

Then return the local environment editor to its recorded before-state — remove
`CLAUDE_CONFIG_DIR`, or restore its prior value — and start one new local
session to confirm it is back on the real configuration directory. If a
fallback was used instead, quit the fixture-configured app and relaunch
normally, and run `launchctl unsetenv CLAUDE_CONFIG_DIR` if that was the route.

`remove` deletes only `.unharness/claude-native/` and refuses while the fixture
is in a release mode or has pending recovery. Nothing under `~/.claude` is
touched at any point in this plan.

This cycle — create, register, prepare each mode, list sessions, observe,
restore, guarded removal — has been run end to end here except for the four
desktop tasks, with exact byte restoration confirmed on disk.

## What this closes, per handoff requirement

| # | Requirement | Status after this plan |
| --- | --- | --- |
| 1 | Inspect real sources and capabilities without changing them | Already done; see the evidence |
| 2 | Save Normal, prepare all three modes, preserve retained conditions | Already done on owned fixtures; the run confirms the prepared state is what a task loads |
| 3 | Plan/apply, state distinctions, favorites, restoration | Already done; the run adds the recorded half of the state distinction |
| 4 | Observe fresh actual desktop tasks | **Closed by this run**, or replaced by a recorded blocker if the configuration directory cannot be applied. Until then, `runtimeStateVerified` and `modeSwitchingVerified` stay false |
| 5 | Ordinary usage, attributed checks, replay where qualifiable | Runs and comparison already done; replay stays refused with its recorded reason |
| 6 | Same operations through the web interface and a local AI connection | Loopback and MCP already done on owned data; the run adds the **native** AI connection |
| 7 | Return to exact Normal with no unresolved recovery | Already done; the restoration step repeats it after real tasks |

## The real-source decision, which is not assumed

Registering the maintainer's actual `~/.claude` is impossible today, and both
reasons are recorded rather than worked around:

- There is no `~/.claude/CLAUDE.md`, so there is no effective user-scope
  instruction to select (`no-effective-instructions`).
- The only personal Skill, `~/.claude/skills/kanary`, is a symlink to
  `~/.agents/skills/kanary`. Capture refuses links rather than following them
  (`source-redirection`).

Changing either is a decision about personal configuration and about which
sources are optional and user-added. **No approval for it is assumed or
implied.** If the maintainer wants real-source qualification, these are the
candidates and the exact change each would need:

| Candidate | Change required | What it would enable | Cost if declined |
| --- | --- | --- | --- |
| `~/.claude/CLAUDE.md` | Create it, with content the maintainer declares optional and user-added | Instruction selection for all three modes | None; the fixture already covers the instruction path |
| `~/.claude/skills/kanary` | Replace the symlink with a real directory, or add a second Skill as a real directory | Skill selection for all three modes | None; the fixture already covers the Skill path |
| A higher-precedence layer | Nothing — but note that a project or managed `skillOverrides` entry would shadow the user layer and make the Skill unselectable | — | — |

The fixture route needs none of these. It is the recommended path precisely
because it qualifies the adapter against the real application and the real
runtime without any change to personal configuration.
