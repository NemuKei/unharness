# macOS desktop-record observation, 2026-09-06

## Environment and scope

Native macOS 26.6.2, arm64; Node.js 24.20.0. The installed desktop bundle reports 26.901.41600/build 7982. The current development task's persisted session metadata reports `originator: Codex Desktop`, runtime 0.153.4 and `thread_source: agent_created_thread`. The `source` field is `vscode`; it is not used alone to classify a desktop session. The task's ID is correlated locally with the calling Codex environment and is not reproduced here.

The implementation consists of `desktop-record.mjs`, `desktop-fixture.mjs`, `desktop-cli.mjs` and CLI dispatch. The source revision is pinned in the final verification paragraph below. No private desktop socket was contacted, no app was restarted, and no personal configuration was stopped. Computer Use declined access to the Codex app itself, so a user-operated new task is the documented fixture-test boundary.

## Observed in the actual development task

`inspect-desktop --current` completed against the calling desktop task's real local recording. It found recognized initial input and one initial full `world_state`. Projection returned these observations without retaining private text in Git:

| Source or capability | Actual observation | Management conclusion |
| --- | --- | --- |
| Project instructions | The initial world record has an `agents_md` field with a directory/text shape | The recording can expose project guidance. The synthetic override still needs a fresh desktop task. |
| Host Skill catalog | Initial developer input includes the host-provided catalog; the world record has `host_skills` separately from `skills` | Standalone `skills/list` must not be assumed to cover this entire host contribution. Per-source desktop control is unresolved. |
| Memory guidance | Initial developer input includes memory guidance/summary markers | It is an actual additional input in this task; it was not disabled or exported. |
| Other source-state fields | `skills`, `orchestrator_skills`, `managed_developer_instructions`, `permissions`, `apps_instructions` and `plugins_instructions` fields are recorded | Field presence does not establish enablement, loaded content, or that a source is optional. Managed conditions remain outside Unharness changes. |
| Usage | `token_usage_record` entries for this task contain numeric input, cached-input, cache-write-input, output, reasoning-output and total fields | Availability is observable locally. The diagnostic exports only availability, not totals. Complete retries/child usage and aggregation remain unverified. |
| Task lifetime | The observed development turn was still running | This observation cannot establish final usage or a completed comparison. |

Read-only bundle inspection also found code reading the Codex-home `memories/memory_summary.md` file. This supports the existence of an app-side memory input path, but does not establish a supported toggle or a complete memory-source inventory. No personal memory contents are included in this note.

The machine-readable observation output stays in ignored local evidence. This committed note intentionally omits task IDs, file paths, source text, token totals and recording byte counts.

## Implemented and tested locally

The full `node --test` suite passed **82/82** tests. A separate reviewer found no remaining issues within the stated fixture-only contract. Tests cover source text/privacy projection, metadata identity/cwd/time checks, startup contamination, bounded records and FIFO rejection, interrupted creation/change/recovery/cleanup, staged source publication, independent source/manifest/stage edits, duplicate requests, links and concurrent recovery. The reviewer additionally reproduced a delayed stale-guard reclaimer racing a new live guard and confirmed that the live owner remains intact.

Fixture creation, changes, restoration and cleanup are deterministic local code. Cleanup retains a small completion manifest and retired recovery receipts. They are not backups of personal configuration. Corrupt or partial journals, missing/invalid owner information, unsupported filesystems, power loss and adversarial filesystem races remain explicit conflict/manual-inspection boundaries, as described in [the runbook](../desktop-observation.md).

A native local smoke run also completed fixture baseline → manual-only → fixed-only → restored baseline and cleanup, with `settingsPrepared: true` at each prepared state and all runtime/mode verification flags false. During that smoke run and desktop-record read, three selected personal configuration/instruction locations had identical before/after content or absence. This is a bounded unchanged-source check, not an inventory of every possible personal source.

## Not yet observed

A dedicated synthetic project is prepared outside tracked source files. No baseline/manual-only/fixed-only/restored sequence has yet been observed in actual fresh desktop tasks. Explicit Skill picker selection/body delivery, same-task reload behavior, restart-dependent skill enablement, full host-source control and Windows behavior remain unverified.

The real-task observation above proves that these input/usage categories can be found in this recording format. It does not prove that the prepared fixture was loaded, that any category was disabled, that all runtime sources were recorded, or that UNSEAL/TRUEFORM was applied. `desktopSessionAttached`, `runtimeStateVerified` and `modeSwitchingVerified` remain false.

## Next reproducible check

Use [the desktop sequence](../desktop-observation.md#fresh-task-sequence-on-macos-or-native-windows): open the returned synthetic project as a new local task, send the marker-free plain prompt, and collect the initial recording before changing a case. Keep the model and permissions fixed. If a new task does not reflect the fixture, report prepared/runtime-unverified; test a restart only when the user chooses to do so. Windows must repeat both filesystem recovery tests and desktop observations natively, with WSL identified separately.
