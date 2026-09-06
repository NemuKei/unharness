# Desktop records and a manually opened fixture

This diagnostic reads one local session recording and prepares synthetic sources for a fresh desktop task. It does not connect to a private socket, launch a model turn, edit personal configuration, restart an app, or apply a product mode. Node.js 24+ and its standard library are sufficient.

## Read the current desktop task

Run inside the selected Codex task's terminal/tool environment:

```text
node bin/unharness.mjs inspect-desktop --current --output local-evidence/desktop-record.json
```

`--current` uses `CODEX_THREAD_ID` and the existing Codex home location. It searches only filenames in the conventional `sessions/YYYY/MM/DD` tree, opens exactly one matching file, and verifies its internal task identity. It never scans other conversations' contents. If the environment does not expose a current task ID, or the location is ambiguous, select the exact local JSONL file explicitly:

```text
node bin/unharness.mjs inspect-desktop --session "<selected local session.jsonl>" --output "<new report.json>"
```

Reports contain recognized source categories, provenance checks, marker detections when a fixture is supplied, and usage-field availability. They omit source text, personal paths, task IDs, model output, arbitrary version suffixes, and numeric token totals. Output creation is exclusive. Keep local reports under the ignored `local-evidence/` directory; review an intentionally reduced evidence summary before committing it.

Only regular files are read. Input is limited to 64 MiB and each JSONL record to 8 MiB. A partial trailing append is ignored and marked incomplete; a malformed newline-terminated record fails. The read is a snapshot of the opened file, not a subscription to live desktop events. Exit 0 means the diagnostic completed, not that a mode or fixture expectation passed; exit 1 is an error, and exit 2 is invalid usage.

## What each observation means

| Field | Interpretation |
| --- | --- |
| `surface: local-session-record` | Reads a persisted record. Does not attach to the running desktop app. |
| `desktopOriginator` | Metadata names Codex Desktop. This is recorded provenance, not a cryptographic attestation. |
| `recordedStartRoute` / `knownFork` | Distinguish known user-created, agent-created and agent-forked routes. A known fork never qualifies as a fresh fixture task; unknown source text is not exported. |
| `freshFixtureTaskCandidate` | The originator, known fork fields, initial cwd and preparation time meet the fixture checks. The operator still confirms a newly created local task in the app. |
| `recordedSources.*: field-recorded` | A recognized key exists in the initial full `world_state`. Its value can be empty, disabled, or a hash; key presence does not establish enablement or complete content. |
| `initialInput.*` | Detections in recorded initial input, before assistant/tool activity. Missing detections do not establish removal. |
| marker `present` | The unique fixture marker occurs in recognized initial input or the initial full world's AGENTS/host-skills text. |
| marker `absent-in-record` | The marker was not found in the inspected initial text. Other runtime sources may be omitted from this recording. |
| marker `unknown` | No recognized initial text is available for this check. |
| `fixtureBodyInToolOutput` | The body marker occurred in recognized string or `input_text`-array output from a function/custom tool. This alone does not establish which tool read it or that manual skill selection worked. |
| `usage.fieldsPresent` | Recognized numeric usage fields exist in records belonging to this task. No totals, complete retries/child usage, or performance comparison is claimed. |

`desktopSessionAttached`, `runtimeStateVerified`, and `modeSwitchingVerified` remain false. Source coverage and usage completeness remain unknown. An assistant's “READY” or “applied” response is never accepted as configuration evidence. Later user messages, assistant text, tool outputs, and later world snapshots cannot contaminate the initial marker result.

The local recording format is an observed implementation detail of runtime 0.153.4, not a stable public integration API. A future format must be inspected again. Unknown fields are ignored; malformed identity fails closed.

## Prepare one synthetic project

```text
node bin/unharness.mjs desktop-fixture create
```

This creates a uniquely named folder in the OS temporary directory. Use `--parent "<existing private directory>"` for a durable location; it creates only a new child, not files in an existing project. The JSON result includes `fixture`, `project`, a plain observation prompt, and an explicit-skill prompt. These local handoff paths are deliberately present in fixture-command output and are not part of the sanitized observation report.

The fixture contains only generated AGENTS/Skill calibration data. A small manifest outside its `project` folder records ownership, source generation identity, preparation time, revision, and pending operations. No user configuration is copied. Each marker has an independent digest so the body marker cannot be derived merely from the visible fixed marker.

| Case | Synthetic sources prepared | Question to test in a fresh desktop task |
| --- | --- | --- |
| `baseline` | AGENTS fixed and optional tokens; one ordinary Skill | Are both AGENTS tokens and the skill description recorded, with the body absent initially? |
| `manual-only` | Same sources plus `agents/openai.yaml` with manual-only invocation | Is catalog omission observed while AGENTS remain, and can an explicit selection still deliver the skill? |
| `fixed-only` | Manual-only Skill plus a fixed-only `AGENTS.override.md` | Does the fixed marker remain while the optional AGENTS marker is omitted? |
| restored `baseline` | Override and manual-only metadata removed | Do the original observations return in another fresh task? |

`fixed-only` does not disable skills or control hooks/memory and is not TRUEFORM. The fixture never writes a `skills.config` array: replacing a user's array could lose other disabled entries, and the documented enablement control has a restart boundary.

## Fresh-task sequence on macOS or native Windows

1. Prepare `baseline`. In Codex desktop, open the returned **project folder itself** as a new local task. Keep the selected model, reasoning and permission settings the same for every case. Do not fork or continue a previous task; do not start at the repository root and change cwd later. If the app chooses a parent folder automatically, the report must show a cwd mismatch and the test remains unresolved.
2. Send the returned plain prompt, which asks for `READY` without tools. Do not paste marker values, fixture files, previous answers or this whole runbook into the trial prompt. Record the app's selected folder and local/native environment.
3. After its first reply, ask that same task to run the observation command below, or observe its exact session file from the control task. Save the report **outside** the fixture root, before changing the next case. A second turn used only for collection does not replace the recorded initial input.
4. In the control task, set `manual-only`, start another fresh local task at the same project, and repeat the plain check. Then explicitly select the synthetic skill through the desktop skill picker if available and send `manualPrompt`. Record whether the UI selected a Skill input, whether its body appeared initially or through a file-read tool, and any unresolved selection behavior. A literal `$name` fallback and a picker selection are different routes.
5. Set `fixed-only`, start another fresh task, and repeat. Restore baseline and repeat once more. Inspect both source markers and retained model/permission choices. Do not extrapolate fixture changes into removal of global/host-provided sources.
6. Restore baseline after observations. Keep the fixture intact while its saved desktop project is still used; run cleanup when it is no longer needed. Keep the sanitized conclusions and test revision, not raw conversations or personal settings, in Git.

Commands from the control checkout:

```text
node bin/unharness.mjs desktop-fixture status --fixture "<fixture>"
node bin/unharness.mjs desktop-fixture set --fixture "<fixture>" --case manual-only
node bin/unharness.mjs desktop-fixture set --fixture "<fixture>" --case fixed-only
node bin/unharness.mjs desktop-fixture restore --fixture "<fixture>"
node bin/unharness.mjs desktop-fixture cleanup --fixture "<fixture>"
```

Command inside the trial task (replace the checkout and fixture paths):

```text
node "<Unharness checkout>/bin/unharness.mjs" inspect-desktop --current --fixture "<fixture>" --output "<new report outside the fixture>"
```

The observer accepts only an intact, prepared fixture snapshot. A pending operation, active lock, changed snapshot, wrong initial cwd, known fork parent, or task started before the current preparation cannot qualify as a fresh fixture observation. Historical reports must be collected before the next case; the current manifest does not retain a history of old case intervals.

The commands are portable structured Node operations, with no shell translation or paid API. Native Windows and WSL need separate observations. Windows still needs real evidence for path/case handling, hard-link publication, lock reclamation, and desktop loading; a passing Mac test is insufficient.

## Reload and scope boundaries

The official [Skill guide](https://learn.chatgpt.com/docs/build-skills) describes automatic detection of skill-file changes and a restart fallback, and explicitly asks for a restart after skill enablement changes in configuration. The [AGENTS guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md) describes instruction discovery at startup and same-directory override precedence. These are control candidates; the desktop fixture sequence must establish the actual version-specific result.

Always try a fresh task without restarting first and record that condition. If the fixture still appears stale, stop at “prepared, runtime unverified.” A later restart may be tested when the user chooses an appropriate time; do not restart an app with active work automatically. Existing conversation history can retain previous guidance even when later settings change.

The public [App Server guide](https://learn.chatgpt.com/docs/app-server) documents per-process extra skill roots, cached skill lists, invalidation notifications and usage events. Calling these on a new app-server process does not observe or reconfigure the desktop's existing process. This implementation does not use an undocumented desktop IPC endpoint.

The [fresh Mac fixture sequence](evidence/2026-09-06-desktop-fixture-macos.md) observed source changes and restoration, including two stale-catalog failures before later successful refreshes. The [earlier recording note](evidence/2026-09-06-desktop-observation-macos.md) covers broader source categories. Sources that cannot be controlled and observed keep TRUEFORM unresolved.

## Diagnostic notification for a stale fixture catalog

On the observed Mac version, removing manual-only YAML restored disk contents but two tool-created fresh tasks still omitted the Skill. A user-created desktop task was followed by a visible catalog, including in the next tool-created task. Another same-route trial restored visibility after an mtime-only notification of the owned Skill file. This is evidence of a freshness boundary; the precise cache cause and a guaranteed propagation delay are unknown.

For this generated fixture only, the notification is available as:

```text
node bin/unharness.mjs desktop-fixture refresh --fixture "<fixture>"
```

The command locks and validates the entire fixture, journals a same-condition pending operation, updates only its `SKILL.md` timestamp, checks that source contents remain intact, and advances preparation revision/time. It changes neither case nor marker identity. It always returns `runtimeReloadVerified: false`. Start another fresh task and observe its recording; do not turn a successful timestamp write into an “applied” label. A killed notification is recovered through the ordinary fixture recovery path and invalidates earlier task associations.

The successful notification-assisted desktop result is one trial. This command is not a supported Codex reload API, a restart substitute for configuration-based disablement, or permission to touch personal Skill timestamps. If the next task remains stale, keep the outcome unknown and use the documented user-operated fresh-task check or an explicitly chosen later restart.

Record the creation route in every case. Use the same route for a matched source-control check, or establish both routes' baselines; equal cwd/model settings alone did not initially guarantee equal catalogs. App tool-created prompts can be delivered as app tool-output entries rather than ordinary user messages. Do not use these route differences as performance comparisons.

## Recovery and conflicts

```text
node bin/unharness.mjs desktop-fixture recover --fixture "<fixture>"
```

`restore` returns intact fixture sources to baseline. `recover` can reclaim a lock only when its recorded owner process no longer exists; it completes interrupted initialization, restores interrupted case changes, or finishes pending cleanup. It does not terminate a process. Permission errors or PID reuse are treated conservatively as a live/unknown owner.

Operations use exclusive locks and write-ahead state. Recovery callers also serialize. When reclaiming a dead recovery guard, the old nonempty guard is retained under its immutable token so a delayed recovery caller cannot remove a newly active guard. Cleanup deletes synthetic project files and directories but retains the small completion manifest and any retired recovery receipts; subsequent cleanup is safe to repeat. These receipts remain local and contain no user-configuration backup.

The tool checks the entire known tree, exact synthetic content, journal content, links, and independent additions before progressing. Unknown changes return a conflict and are retained. Inspect and preserve the changed file or additional work, then repair only the owned synthetic difference before retrying; there is no force-overwrite or force-unlock flag. A symlink or an external hard link is rejected. The brief hard-link pair used to publish a fully written source is recognized only when the stage and fixture source share the same inode.

This is a diagnostic recovery mechanism, not a transaction engine for personal configuration. A malformed/truncated manifest or stage, missing/invalid lock ownership, unsupported filesystem operations, or a hostile filesystem race requires manual inspection. It does not promise power-loss durability or protection against an adversarial editor racing between the final filesystem check and mutation. Do not edit a fixture while its CLI is running. Recovery/fault tests cover process termination at recorded operation boundaries, interrupted recovery and cleanup, duplicates, ordinary concurrent callers, and detected independent edits; they do not establish production-config or Windows recovery support.
