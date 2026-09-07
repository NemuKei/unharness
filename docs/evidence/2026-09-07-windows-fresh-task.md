# Native Windows fresh fixture task, 2026-09-07

The first user-created Windows fixture task completed, and the GUI saved its recording observation against the exact baseline favorite/application. The recording qualified as a fresh fixture task but returned **`not-matched-record`**: fixed and optional AGENTS markers were present, while the expected Skill catalog marker was absent. Baseline loading has therefore not passed, and the next condition has not been started.

## Environment and method

- Tested source: `995bc37003b1e92b98d1a590cc4d22dd2f412351`; no runtime changes for this observation.
- Windows 11 Home `10.0.26100`, native x64; Codex desktop `26.901.6511.0`, recorded runtime `0.153.4`, bundled Node `24.19.0`.
- Recorded execution settings: `gpt-6-astra`, reasoning `max`, approval policy `never`, sandbox type `danger-full-access`. These are observed starting conditions, not recommended permission defaults.
- The operator opened the generated project itself as a new local task and sent only the existing marker-free READY request. Its first turn completed with READY and no tool call.
- The control task selected that exact task through the app listing and entered its UUID in the built loopback GUI. The server saved a sanitized observation for the current application and favorite. A separate `inspect-desktop --session` projection agreed with the GUI's result.

The [earlier Windows baseline](2026-09-07-windows-baseline.md) contains the automated test, source-control and initial GUI smoke results. The source under test was unchanged for this follow-up; the full test suite was not rerun.

## First baseline observation

| Check | Result |
| --- | --- |
| Desktop origin and creation route | Codex Desktop; user-created; no known fork |
| Initial project and time | Cwd matched; task started after both fixture preparation and application boundary |
| Fresh fixture candidate | `true` |
| Fixed AGENTS marker | `present` |
| Optional AGENTS marker | `present` |
| Skill catalog marker | `absent-in-record`; expected `present` |
| Skill body marker | `absent-in-record`, as expected |
| Application-bound GUI observation | Saved; `not-matched-record` |
| Usage availability | First turn completed; recognized numeric fields present; totals not collected |

The GUI displayed the mismatch instead of treating READY or matching disk configuration as successful runtime loading. The initial report and immutable application-bound observation were retained locally before further preparation.

This is a recorded catalog omission. A stale catalog is one hypothesis, consistent with [earlier Mac observations](2026-09-06-desktop-fixture-macos.md), but the Windows cause and complete runtime contents have not been established. The fixture had previously been switched between baseline and manual-only during the local GUI smoke; this task alone cannot separate loading, refresh and recording causes.

## Same-baseline retry preparation

The control task ran the existing owned-fixture `refresh` diagnostic. It notified only the synthetic `SKILL.md` timestamp and advanced preparation; all fixture source bytes remained unchanged. No personal Skill, configuration or permission setting was modified, and no app restart was requested.

After the notification, the GUI correctly marked the previous application/observation as stale and disabled recording submission for it. Reviewing and reapplying the same baseline favorite showed no configuration difference and created a new application receipt for the next task. The favorite version remained the same. Selected personal configuration/instruction file content and existence were unchanged across this preparation.

The retained fixture is still baseline, with a current replacement application. **No post-refresh fresh task has yet been observed.** `runtimeReloadVerified` remains false. The next step is one new user-created local task at the same generated project, with the same model, reasoning, permissions and plain READY request. Collect it against the replacement application before changing cases; do not reuse the first task or old application receipt.

If the baseline remains unmatched, keep the result unresolved and investigate the loading boundary before moving to manual-only. A later app restart is a separate user-operated check. Once baseline matches, continue the [fresh-task sequence](../desktop-observation.md#fresh-task-sequence-on-macos-or-native-windows), including explicit Skill selection and final restoration.

`desktopSessionAttached`, `runtimeStateVerified` and `modeSwitchingVerified` remain false; source coverage is unknown. The Windows GUI UUID-observation path has now been exercised, but successful saved-version matching, the remaining fixture sequence and full product modes are unverified. Private task IDs, paths, source bytes, hashes and application/favorite IDs remain outside Git. The [reduced result](2026-09-07-windows-fresh-task.json) records only the scoped outcomes.
