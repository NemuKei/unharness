# Local workbench and work-record UX

> **For agentic workers:** Execute inline. The user asked to avoid subagents and consult Pro for consequential design questions.

**Goal:** Make the local workbench the everyday operating surface and let users record or inspect one job before comparing multiple jobs.

**Design:** The user accepted local GUI consolidation on 2026-09-14. Public pages provide introduction, demos and local launch/installation guidance. New local/AI entry points do not issue public pairings; existing versioned receipts and legacy transport remain readable during migration. Work records become a primary navigation item. Their landing view contains saved jobs, an add-record action and a separate entrance for controlled replay. A record opens on its own; two or three can be compared without first filling an experiment form.

**Grounding:** The current installed comparison screen puts expired public pairing, starting-condition capture, replay and UUID entry ahead of saved records, then shows a wide technical table. Pro's review supports separating recording, reflection and controlled replay and retaining uncertainty next to the corresponding values. A native Codex 0.153.4 schema/read check confirms `thread/list` with exact `cwd`, interactive sources and `useStateDbOnly: true` returns task names without turns; settings were unchanged.

## Constraints

- Preserve existing records, corrections, Normal versions, artwork and offline recovery.
- Never start/replay a model request merely by viewing, recording or comparing work.
- List only registered-project task metadata; read a task's transcript only after its explicit selection. Do not expose previews, paths or message bodies in the picker.
- The picker is qualified for metadata on Codex 0.153.4 and 0.155.0-alpha.9.2; unsupported runtimes/applications retain manual/AI-assisted alternatives without guessed results.
- Recording defaults to the latest completed turn, excluding an in-progress recording conversation; explicit older cutoffs and historical reviews retain their meaning.
- Keep unknown/partial usage and unverified mode loading visible beside those fields. Elapsed time is not a measure of human effort; different jobs do not establish a mode's superiority.
- Keep source files and settings unchanged during inspection. Save assessment only on its explicit save action, with existing context/idempotency fences.
- No installation/archive replacement or public deployment in this development verification.

## Task 1: Local entry

- [x] Make the public site's normal navigation lead to demo, installation and opening the local workbench in Codex. Preserve a migration path for already issued legacy links/results without promoting new public operation sessions.
- [x] Remove public pairing from the everyday local workbench; retain local lookup of a historical public operation ID.
- [x] Make the legacy `request_public_connection` tool return the verified local workbench entrance without issuing a pairing. Old completed operation receipts remain immutable.
- [x] Update the management Skill and entry/UX contracts. Verify no ordinary visitor/launch action connects, changes mode or registers sources.

## Task 2: Record a selected recent task

- [x] Add a read-only Codex adapter for one bounded `thread/list` metadata page, pinned to the registered home/project/version. Filter foreign projects, subagents, ephemeral tasks and malformed rows; never project previews or native paths.
- [x] Expose that reader through local CLI/HTTP/MCP without allowing callers to replace the selected context.
- [x] Add an explicit latest-completed selection to run review, retaining the old default and explicit `throughTurnId` behavior. Reject conflicting selectors and a task with no completed turn.
- [x] Build a recent-task picker and short result/note form. Keep UUIDs, cutoffs and detailed criteria under manual/advanced controls. Preserve drafts and reject late responses for another selection/context.
- [x] Test native request confinement, selected-record collection, latest completed versus running turns, unknown/partial measurements, and private response projections.

## Task 3: Reflect, compare, then optionally replay

- [x] Promote “記録・比較” to primary navigation. Show “仕事の記録” with named/date/mode/outcome rows and useful zero/one-record states.
- [x] Let a single record open without selecting a second. Compare two or three selected records with outcomes/notes above mode/model/time/token fields; put technical breakdowns and aggregate diagnostics in details.
- [x] Separate “同じお題で試す”; explain that recreating original work needs conditions saved before work. Preserve the existing replay records/actions and drafts.
- [x] Keep correction, output inspection, frozen-loadout save and recovery reachable from a record's details, without loading output automatically.
- [x] Validate type/CSP/build, affected source/comparison/entry tests and the built app in the in-app browser at normal and narrow widths. Verify the tasks: add → save → find again, inspect one, compare two, and return to mode controls after an error.
- [x] Update both READMEs and status with current source versus installed/published evidence, and check relative links and whitespace.

## Verification closeout — 2026-09-20

Completed inline. [Fresh verification](../../evidence/2026-09-20-local-work-record-ux.md) records automated checks, manual built-browser journeys, current metadata-only native qualification, and the unchanged installed/published boundary. Existing source state was preserved when opening the development workbench.
