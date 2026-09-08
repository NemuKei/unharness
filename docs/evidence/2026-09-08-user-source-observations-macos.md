# Registered-source task observations on macOS

Date: 2026-09-08. This extends the [selected real-source pilot](2026-09-08-real-source-desktop-macos.md) into the shared service and registered-source workbench. The [observation contract](../spec-user-source-observations.md) defines its narrow meaning.

## Scope and implementation

Registration, successful preparation and pending-operation recovery now publish a fresh preparation identity. The selected task must start after that boundary, in the registered project, through a recognized unforked desktop route, and complete its first turn. Existing registrations without this metadata remain readable; they require a reviewed re-preparation before a task can qualify. The earlier pilot's operator timestamps were not inserted into those records.

`sources observe --json` and the authenticated workbench action share the same service. The caller supplies only a task UUID; expected source contents, scope, mode and time come from the frozen registered records. Matching uses the first native instruction/catalog fields before assistant or tool activity. Pasted prose, later source states, missing fields and unsupported runtime formats cannot manufacture a match.

The immutable observation references the exact snapshot and preparation. A new preparation or recovery clears its current pointer while retaining the historical record. Pending recovery, conflicting files and invalid optional observation metadata suppress a current match without disabling ordinary status or offline recovery. Subset favorites derive Skill intent from frozen settings, rather than assuming every registered Skill was disabled.

The workbench separates the recorded result from its mode preview. Its compact result is dated and names the prepared mode; the UUID input, selected-source details and coverage limits are collapsed. Mismatch, unqualified and unknown results have separate labels. These are selected-record observations, with both full runtime/mode flags still false and source coverage unknown.

## Qualification

- Tested implementation: `1d07cbb` (following the task-reviewed core and workbench commits). Native environment: Darwin 25.6.0, arm64; Codex desktop 26.901.51231; embedded Codex 0.153.4; Node.js 24.20.0.
- The native owned-profile selector check passed with read-only method confinement, duplicate/absent selectors and retained comments. No model task or personal profile is used by that check.
- A separately created native owned profile registered one synthetic global guide and one synthetic Skill. The actual CLI returned `matched-record` for its synthetic Normal task and persisted the matching snapshot/preparation identity.
- The four selected real pilot catalogs parsed using the shipped parser. The selected Skill was present, absent, absent and present across Normal, UNSEAL, TRUEFORM and restored Normal. This corroborates the catalog grammar against desktop data; it does not retrofit a service association for those older tasks.
- Integrated suite at `c33281d`: 331 passed, one existing platform skip, no failures. The subsequent wording/notice fixes passed the complete affected web suite (2/2), TypeScript, the Pixi CSP guard and the production build. Core/HTTP behavior did not change in those fixes.
- Built in-app-browser checks exercised all four observation statuses, invalid UUIDs, mode preview versus prepared mode, and clearing the current result after application. The native owned profile completed Normal → UNSEAL → TRUEFORM → Normal with synthetic records showing the expected instruction and Skill catalog states. Effects were off during the latter modes and restoration.
- At 390 CSS pixels, the task input, source detail and recovery controls remained usable; document and viewport widths were both 390 with no horizontal overflow. The viewport override was reset afterward. The normal and narrow checks produced no browser warning/error logs.
- Restarting the GUI on the same port with a different owned context invalidated an old plan before application; the new context stayed at revision zero. Reopening the same context retained its dated observation and favorite. Unit coverage separately exercises responses whose preparation/snapshot/observation identities no longer match the accepted state.
- A deliberate independent edit suppressed the current match and disabled preparation/save/observe, while recovery controls remained available. Reverting only that known synthetic edit restored the source bytes. Legacy metadata required a reviewed preparation; preparing the same mode established a boundary without changing source bytes or metadata.
- Browser QA found a legacy response being mislabeled as a superseded preparation. The fix disables observation without a valid boundary and reports a specific observation issue before the stale-result fallback. Its regressions, scoped re-review and rebuilt-browser legacy check passed. Normal preparation and recovery remained enabled.
- Final native readback matched frozen Normal bytes and metadata exactly. The saved Normal favorite and final matching observation reference the same snapshot; conflict and pending recovery were absent. No real model task was started for this browser pass.

Private fixture locations, task IDs, configuration bytes and raw recordings stay outside Git. Tests use synthetic input. This slice does not collect performance metrics, grade quality, start desktop tasks, prove manual picker availability or qualify Windows/Claude Code support. Comparison records and the AI/MCP entry point remain subsequent Mac work.

## Retained-setting change observed separately

A read-only recheck of the previously restored real registration found an independent change to the retained `service_tier` setting. The global instructions, selected Skill files and all other parsed configuration values still matched restored Normal. The service reported a configuration conflict and the independent change was not reverted. Reviewing such retained-setting changes while preserving existing saved versions is subsequent product work; this pass does not silently adopt or overwrite them.

One exploratory synthetic profile inherited a configuration group the process could not reproduce. Its Skill TRUEFORM control was correctly unavailable; that profile was restored to Normal. The full-mode browser check used a new owned profile with all three controls explicitly available.
