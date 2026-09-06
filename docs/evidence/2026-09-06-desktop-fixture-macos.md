# macOS fresh desktop fixture, 2026-09-06

The synthetic AGENTS/Skill controls now have actual fresh-task observations on native Mac desktop. Baseline, manual-only catalog omission, a fixed-only AGENTS override and restoration were observed. Restoration also exposed a stale Skill catalog: a new task alone did not always refresh it. The product must keep prepared settings separate from observed task state.

Initial fixture/runtime revision: `7889864a560651f8f231087757fa07f2c123c62f`; evidence collection started from `0bfe886`. The follow-up collector/refresh implementation is pinned in the final verification below. Native macOS 26.6.2 arm64; installed desktop bundle 26.901.41600/build 7982; actual tasks record runtime 0.153.4. No app restart was requested.

## Observed sequence

The maintainer added the synthetic project and started the first new local task in the desktop UI. After explicit authorization, the control task created further fresh tasks through the Codex app's task-creation tool, using that saved project and the local environment. Every plain trial requested the same short READY reply without tools. App task APIs and the recordings corroborated completion, the intended cwd, absence of ordinary tool calls during the plain turn, and no known fork parent.

The observer inspected unique calibration markers in initial messages and the initial full world snapshot. The requested prompt contained no marker values. Each original association/report was saved before changing the next fixture case. The matrix retains failed observations rather than replacing them with later successful retries.

| Observation | Creation / refresh | Fixed AGENTS | Optional AGENTS | Skill catalog | Initial Skill body |
| --- | --- | --- | --- | --- | --- |
| Baseline | User-created desktop task | Present | Present | Present | Absent |
| Manual-only | App tool-created task | Present | Present | Absent | Absent |
| Fixed-only | App tool-created task | Present | Absent | Absent | Absent |
| Restored, initial | App tool-created task | Present | Present | **Absent** | Absent |
| Restored, delayed retry | App tool-created task; no further source change | Present | Present | **Absent** | Absent |
| Restored, UI check | User-created desktop task; no source change | Present | Present | Present | Absent |
| Restored, after UI check | App tool-created task; no source change | Present | Present | Present | Absent |
| Manual-only, repeat | App tool-created task after the visible baseline above | Present | Present | Absent | Absent |
| Restored with notification | App tool-created task after an owned Skill mtime notification | Present | Present | Present | Absent |

“Absent” means absent from the inspected initial recording. The fixed condition stayed present throughout. Recorded cwd, model, reasoning effort, approval policy, sandbox, and permission-profile fields matched the original baseline in all plain observations. Host Skill catalog and memory guidance remained present as broader source categories.

Task creation routes were not assumed equivalent. User-created prompts appeared as user messages; app tool-created prompts arrived through an app tool-output entry. The initially different routes made the first manual-only result insufficient by itself to attribute omission to the setting. The later same-route baseline → manual-only repeat supplies that missing control. This is source-control evidence, not a numerical performance comparison.

## Explicit manual invocation

After the first manual-only plain turn, an explicit literal `$unharness-desktop-fixture` follow-up completed. The task performed scoped file discovery inside the synthetic project, read only the fixture's `SKILL.md`, and returned its expected body token. The body occurred in the recorded tool output and matched the retained synthetic file. No source file was modified by the trial task.

This verifies the literal-name/file-read route. Desktop picker selection and structured Skill-input injection were not tested and are not claimed. The model's reply alone is not the proof: it is corroborated by the actual read operation and tool-output marker.

That output exposed a collector gap: runtime 0.153.4 used `custom_tool_call_output.output` with `input_text` blocks. The old collector recognized only string `function_call_output` values and missed it. A synthetic regression failed before the fix and passed after adding the known text-block shape. Arguments, metadata, non-text blocks and later output remain excluded from initial input. The original per-case association was retained; the same recording was reprojected only to correct the later body-output observation.

## Restoration and refresh boundary

On the first restore, the generated manual-only YAML was absent and fixture content matched baseline, yet two tool-created tasks still omitted the Skill catalog entry. A separate native CLI prompt-input check found the baseline catalog marker; this was only a disk-side control, not desktop verification. The subsequent UI-created task exposed the catalog, and another tool-created task exposed it too without further source edits.

This pattern is consistent with stale host catalog state or a refresh-timing dependency. It does not identify the exact cache implementation, prove that UI creation is the only refresh mechanism, or measure a guaranteed wait duration.

A second same-route trial again omitted the catalog under manual-only. After restoring baseline, changing only the owned `SKILL.md` mtime while preserving its exact bytes was followed by a tool-created task with the catalog present. This is **one successful notification-assisted restoration trial** on this version, not a supported general reload API or a guarantee for arbitrary sources.

`desktop-fixture refresh` now makes that diagnostic notification reproducible. It validates and locks the generated fixture, records a same-condition pending operation before touching the timestamp, preserves file bytes/identity, then advances preparation revision/time. A killed notification is recoverable, and earlier task observations cannot qualify for the recovered preparation. It always reports `runtimeReloadVerified: false`; only the following task can supply evidence. No automatic mtime touching of personal Skills was introduced.

## Retained state and limits

Three selected personal configuration/instruction locations had identical before/after content or absence across the sequence. No personal hook, memory, configuration array, managed policy or execution permission was switched. The fixture was restored to baseline and remains intact because the maintainer added its project to the desktop; fixture cleanup was tested separately and is available when that project is no longer needed.

The shared `desktopSessionAttached`, `runtimeStateVerified` and `modeSwitchingVerified` flags remain false. The controlled scope is this fixture; complete host-source coverage, configuration-based Skill disablement/restart conditions, same-task removal, native Windows and full UNSEAL/TRUEFORM support remain unresolved. No token totals, costs or performance scores are published.

[The reduced machine-readable matrix](2026-09-06-desktop-fixture-macos.json) includes all nine plain observations, explicit invocation and the two stale-catalog failures. Task IDs, raw chats, paths, marker nonces and personal comparison conditions remain in ignored local association data. See [the runbook](../desktop-observation.md) for the supported diagnostic sequence and manual/conflict boundaries.
