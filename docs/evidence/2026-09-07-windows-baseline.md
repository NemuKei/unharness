# Native Windows diagnostic baseline, 2026-09-07

The inventory, source-control matrix, current-task recording projection and registered-fixture save/restore loop ran on native Windows. Fresh tasks in the generated fixture project have not yet been observed. This establishes the available diagnostic and local filesystem slices, not complete Codex desktop support or product modes.

## Environment and revision

- Windows 11 Home, OS version `10.0.26100`, x64; native PowerShell/Node execution, not WSL.
- Installed Codex desktop package `26.901.6511.0` (x64).
- Native desktop-runtime executable and selected task recording both report Codex `0.153.4`.
- Bundled Node.js `24.19.0`; no dependency installation or paid API was required.
- Runtime tested at `13c590205fae6ded3238eb0c137cd411b82235b7`. The accompanying changes affect tests and documentation only; production runtime files remain identical to that revision.
- Final test revision: `af91a9a92ff29fff92c7901935c01f620c6b04bd`.

## Observations

| Check | Native Windows result |
| --- | --- |
| `inspect` | Exit 0; initialized a separate app-server and recognized configuration, Skill, hook and managed-requirement responses |
| `probe-controls` | Exit 0; all six cases collected and owned temporary fixture removed |
| Manual-only Skill | Catalog omitted; fixed/optional AGENTS and literal user markers retained |
| Disable by `SKILL.md` | Catalog omitted |
| Disable by directory | Catalog remained, matching the observed Mac limitation; this check is observational |
| Fixed-only AGENTS override | Fixed/user markers retained; optional AGENTS, catalog and body markers omitted |
| Restored sources | Original baseline markers returned |
| `inspect-desktop --current` | Exit 0; selected user-created desktop task recognized, with initial source categories and numeric usage-field availability |
| Current task initial input | Host Skill catalog and memory guidance detected; no fixture markers were supplied for this observation |
| Register/save fixture | Four generated sources registered; baseline and manual-only saved as distinct immutable versions in one family |
| Refresh then save baseline | Original favorite version reused |
| Restore exact baseline favorite | Planned restoration and configuration readback matched |
| Restore pre-change checkpoint | Configuration readback matched and manual-only condition returned |
| Finish at baseline | Original baseline version reused; retained fixture intact and baseline application receipt prepared |

The selected `.codex/config.toml`, `.codex/AGENTS.md` and `.codex/AGENTS.override.md` locations had unchanged content/existence across the diagnostic sequence. No personal configuration was copied or edited, and no app restart or comparison task was requested. Source-control child processes retained the fixed hook/memory-disable flags in all cases.

The inventory uses a standalone app-server. Recording projection reads the selected persisted task, not a live desktop attachment; its first turn was still running at collection. Neither source counts nor recorded field presence establishes complete control. Numeric usage fields were recognized, but totals and complete task/child usage were not collected.

## Test portability corrections

The initial full native run found 10 failures, 115 passes and one existing platform skip. A store-initialization assertion assumed POSIX permission bits on Windows. Several synthetic child processes exceeded the tests' 100–1000 ms startup budgets; oversized-output cases sometimes timed out before emitting output or their readiness/PID file. Three RPC assertion failures bypassed cleanup and left owned synthetic servers alive. Those specific servers were verified by process ancestry and fixture command before termination.

The corrected tests use shared, bounded startup allowances: 5 seconds for ordinary subprocess responses and 3 seconds for readiness-dependent timeout/oversize cleanup scenarios. The existing 100 ms RPC timeout assertion remains. Synthetic readiness/PID publication follows shutdown-handler registration; expected error kinds, bounded caller exit and child-death assertions remain required. Cleanup is registered before assertions, so failed RPC/prompt checks still release their owned children. The POSIX permission-bit assertions remain active on non-Windows systems. These test changes do not alter product deadlines, disable behavior checks or certify Windows ACLs.

Final verification: `node --test` using normal default scheduling passed **125 tests, zero failures, one skip** (126 discovered). The existing skipped case creates a POSIX FIFO; it does not establish Windows named-pipe behavior. Native tests exercised fixture interruption/recovery, conflicting edits, locks, exclusive hard-link publication, immutable records and path handling. The local CLI smoke independently checked registration, saving and exact favorite/checkpoint restoration.

## Next Windows desktop check

The retained fixture is at baseline; its store, exact favorite/application IDs, project path and prompts are in ignored local handoff data. Open that exact generated `project` folder as a **new local task**, preserving model, reasoning and execution permissions. Send only the generated marker-free READY prompt. Collect its recording before changing the fixture.

Follow the [fresh-task runbook](../desktop-observation.md#fresh-task-sequence-on-macos-or-native-windows) through baseline → manual-only (including explicit Skill invocation) → fixed-only → restored baseline, one new task at a time. Use the same creation route. Connect the saved manual-only and baseline versions to their application receipts with [loadout observation](../loadouts.md#associate-a-fresh-task-with-the-saved-version). A refresh requires a new receipt before the next task. Retain baseline at the end and preserve conflicts; do not restart the app automatically.

Pending: fresh fixture/task and saved-version associations on Windows, picker selection, generic refresh guarantees, Windows ACL isolation/named-pipe behavior, real personal-source classification/control and full Normal/UNSEAL/TRUEFORM. `desktopSessionAttached`, `runtimeStateVerified` and `modeSwitchingVerified` remain false. A local save/restore success does not promote these flags.

The [reduced result](2026-09-07-windows-baseline.json) contains versions, test counts, fixed labels and booleans only. Private paths, source hashes/bodies, favorite/application IDs and raw recordings remain outside Git.
