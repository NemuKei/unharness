# Selected real-source desktop sequence on macOS

Checked on 2026-09-08 JST with runtime revision `9582992`, native macOS arm64 / Darwin 25.6.0, Node 24.20.0, Codex app 26.901.51231 (build 8109), and embedded runtime 0.153.4.

This operator check connects the actual registered-source workbench to four fresh local Codex tasks. It covers one explicitly selected optional global instruction source and one local Skill. It does not establish removal of every harness source, complete runtime coverage, other app/runtime versions, Windows support, or performance improvement.

## Chosen Normal

The maintainer asked to use the original global instructions as Normal instead of an existing inert override, and then asked to restore the existing Skills disabled by an earlier lightweight trial. Before registration:

- The inert override was backed up and set aside, exposing the unchanged original global AGENTS.md.
- The old configuration backup was checksum-verified. Its per-Skill disable list was absent, so the 23 currently present affected Skills had been enabled by default.
- Those 23 Skills were enabled again. A private-copy change was checked with both the native parsed user layer and an independent TOML parser. All other configuration values, comments and supported metadata were retained. A private checkpoint and guarded Node-only recovery were prepared; synthetic checks covered exact restoration, repeated recovery, independent edits and a known interrupted stage.
- Five old disable selectors with no current catalog entry were left unchanged. Four of the restored Skills were already manual-only before the earlier trial; their metadata matched the backup and was retained.

This was the maintainer-authorized choice of a new starting Normal, separate from a product mode application. No old full-profile backup was applied wholesale. Private configuration, backup receipts, source identities and recordings remain outside Git.

## Workbench and task observations

The workbench registered the selected global source and Skill, saved Normal, prepared UNSEAL and TRUEFORM through their displayed plans, saved both versions, and restored the original Normal favorite. Each condition used a new local task in the same saved project with the same plain request to return `READY` without tools. A later explicit Skill request was made only in the UNSEAL task. No app restart or personal Skill timestamp refresh was used.

| Condition | Original global instructions | Minimal guide | Selected Skill in automatic catalog | Retained project instructions |
| --- | --- | --- | --- | --- |
| Normal | Present | Absent in record | Present | Present |
| UNSEAL | Absent in record | Present | Absent in record | Present |
| TRUEFORM | Absent in record | Absent in record | Absent in record | Present |
| Restored Normal | Present | Absent in record | Present | Present |

Every plain task recorded the expected desktop originator, agent-created route, no fork, matching initial working directory, start after its captured preparation boundary, and completed first turn. Recorded model, reasoning and execution-policy fields matched across cases: GPT-6 Astra with medium reasoning. Memory guidance remained recorded. This is not a claim that all memory contents or all inputs were identical.

The restored-Skill baseline exposed 19 of the 23 restored Skills in the automatic catalog. The four omitted ones had the pre-existing manual-only policies described above.

In UNSEAL, an explicit `$skill` request located and read the selected Skill body through filesystem reads. It did not run that Skill's application commands or access its application data. This establishes the tested literal-name/manual-read route; native picker selection was not tested.

For TRUEFORM, a separate native read also reported the selected Skill disabled. That read is configuration evidence, distinct from the desktop recording's catalog omission. A Normal task from before TRUEFORM preparation failed the freshness condition and still contained the old source pattern, providing an old-task negative control.

## Restoration and limits

The final current snapshot equals the saved Normal snapshot. Configuration bytes and supported file metadata match that chosen Normal, the temporary instruction override and owned Skill-policy directory are absent again, and the original Normal favorite ID was reused. The restored fresh task again recorded the original global instructions and selected Skill catalog entry. The profile is left at Normal.

Recordings were inspected only for the explicitly created tasks. Initial-source checks exclude later assistant/tool activity. The first full recorded `agents_md` and `host_skills` fields independently contained the corresponding source patterns; raw transcripts and source contents were not copied into this document. The existing desktop projection was combined with private operator receipts for this check.

The registered-source GUI still reports prepared files and unverified full runtime/mode status. Persisted user-source preparation timestamps, source-specific task association, and displaying that evidence through the shared service are the next implementation step. This manual check must not silently turn those product flags true. Comparison measurement and the AI/MCP endpoint are still separate work.
