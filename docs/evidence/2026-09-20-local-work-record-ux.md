# Local entry and work-record UX verification

Date: 2026-09-20. Development checkout only; no archive replacement, installed-plugin update, public deployment or new desktop mode qualification.

## Result

Daily navigation uses the bundled local workbench. The public page offers information, demos, installation/update guidance and a draft/copy action for opening the local screen. New `request_public_connection` calls return a verified local entrance with `publicConnection: retired`; previously issued operation receipts and bounded transport retain their contracts.

Work records use task names/dates, an explicit selection and a short outcome/note form. One saved record opens independently; two or three can be compared. Outcomes/notes precede measurements, partial/unknown values stay beside the affected fields, and controlled replay has a separate entrance. A successful save clears that completed draft so adding another record starts with task selection. Detailed criteria, cutoffs, correction, explicit answer reading and historical-loadout saving remain available.

## Native metadata boundary

The installed Codex CLI reports **0.155.0-alpha.9.2**. Its generated experimental `ThreadListParams` schema retains exact `cwd` filtering, descending update ordering, bounded pages, interactive source filtering and `useStateDbOnly`. Initialization confirmed the selected home. A fixed-project native metadata call returned four interactive tasks, empty turns, no ephemeral tasks and no foreign working directories. The service projection returned only `taskId`, `title`, `createdAt` and `updatedAt`. Configuration bytes were unchanged; no real transcript was collected or real assessment saved.

The metadata adapter admits the exact previously inspected 0.153.4 and this exact prerelease. Tests reject other prereleases and the uninspected stable 0.155.0. This qualifies metadata discovery only. Source writes, measurement-format coverage, prepared modes and desktop-loaded evidence retain their existing independent version boundaries.

## Automated checks

Locked dependencies were installed with `npm ci --ignore-scripts`. `npm run check`, `npm run build` and `npm run build:site` passed. The local build retains its existing chunk-size warning.

The main affected suite passed **150 tests**, with **31 optional browser tests skipped**, no failures:

```text
node --test --test-concurrency=2 test/recent-tasks.test.mjs test/comparison-records.test.mjs test/web-comparisons.test.mjs test/claude-comparisons.test.mjs test/ai-public-connection.test.mjs test/gui-sources.test.mjs test/web-retained-settings.test.mjs test/mode-blocker.test.mjs test/web-entry.test.mjs test/web-local-connection.test.mjs test/web-ai-updates.test.mjs test/retained-mode-switch.test.mjs test/web-connection.test.mjs test/web-connection-lifecycle.test.mjs test/setup-source-state-v3.test.mjs test/web-replays.test.mjs test/web-starting-conditions.test.mjs test/web-setup-inheritance.test.mjs test/web-enrollment.test.mjs
```

MCP/catalog/privacy and legacy-connection checks passed **26 tests**, no skips or failures:

```text
node --test --test-concurrency=2 test/ai-server.test.mjs test/ai-session.test.mjs test/ai-requests.test.mjs test/ai-public-connection.test.mjs test/web-local-connection-contract.test.mjs
```

After the final form/copy changes, comparison/replay/starting-condition checks passed **14 tests**, with **13 optional browser tests skipped**, no failures. These overlap the main suite and are not an additional unique test count.

This Mac's system Git/Python shims currently stop at an Xcode-license prompt. Verification used the Codex-bundled Git in the command environment and bundled Python where needed; no license was accepted or global tool configuration changed. One follow-up suite initially omitted that Git environment and failed starting-condition inventory; rerunning with the same bundled Git used by the main suite passed. The development GUI was launched with that process-local Git path.

## Built browser checks

The Codex in-app browser exercised owned synthetic profiles:

- Named task list → select an unsaved job → choose a result and note → save → open its detail → return to the list.
- Add another record after saving: task selection appears, with no previous saved assessment reopened.
- Select two records → compare outcomes/notes/time/usage; partial usage and unknown mode remain explicit.
- Default viewport and 390 × 844 comparison: document width equals viewport width; no horizontal overflow. The viewport override was reset.
- Open the separate replay journey; no replay or model task starts from opening it.
- An unavailable manually selected task shows an error; mode controls and recovery remain reachable.
- Public development page → local launch guidance, Japanese/English copy and draft links; no ordinary pairing approval UI.
- No console errors or warnings during the normal record/comparison and public-entry flows. The deliberate missing-task request returned its expected error.

Optional standalone Playwright tests were not executed; the manual in-app checks are separate evidence, not counted as passing those skipped tests.

## Existing saved workspace

The fixed installed connection was read again before launch. The new development GUI opened that existing registration and its record page. Personal configuration and saved source-state digests were identical before/after launch. No mode was applied, Normal recaptured, personal record saved or source role changed. This running checkout does not update the installed plugin bundle; opening the old bundle later still selects that bundle's UI.
