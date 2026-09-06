# Registered loadout core on macOS, 2026-09-06

The native local CLI completed registration, immutable favorite saving, exact-version restoration and pre-change checkpoint recovery against a newly generated fixture. This is local filesystem/service evidence, not a new desktop model task or production mode test.

Environment: Node.js 24.20.0, native macOS arm64. The base before this feature was `ef95074`. The immutable store was introduced in `03b4632` and its reviewed byte/key fixes in `e48e962`; the final integration revision is pinned below.

## Observed local loop

A fresh store and fixture were created under ignored local evidence. Four generated sources were registered with their known fixed/optional roles. No personal configuration was registered or copied.

| Check | Result |
| --- | --- |
| Save baseline | Immutable favorite version created |
| Save again after metadata-only refresh | Same favorite version reused |
| Change to manual-only and save under the same name | New version in the same family |
| Inspect plan and restore the baseline version | Exact configuration readback matched |
| Restore the saved pre-change checkpoint | Manual-only configuration reproduced |
| Restore baseline again | Exact saved baseline reproduced |
| Simulate an independent AGENTS edit, then request restore | Conflict returned; edited bytes retained |
| Inspect earlier favorite record after all operations | Unchanged |

The deliberately introduced test edit was removed only after confirming its exact bytes; the newly generated fixture is intact at baseline. The previously retained desktop-test project was not modified by this smoke run. Private paths, version/family IDs, file bodies and marker nonces stay in ignored local handoff data.

## Verification and review

`node --test` passed **126/126** tests. Coverage includes canonical immutable publication, concurrent deduplication, corrupted raw UTF-8 and unsupported array properties, exact saved payloads, stale plans, independent edits, interrupted restore/checkpoint recovery, family/version identity across refresh and away-and-back changes, output collisions and safe CLI errors.

Observation association was tested with synthetic session records: it names an exact favorite version/application receipt, checks current preparation and a new application time boundary, rejects old/forked/wrong preparations, and retains `runtimeStateVerified: false` and `modeSwitchingVerified: false`. No actual desktop task was associated with the new favorite store during this smoke run.

The store and integration each received scoped specification/quality review. Findings about corrupt byte acceptance, noncanonical array keys and capture-dependent favorite identity were corrected and re-reviewed. The broader final review found that successful accumulation beyond 1,000 records disabled checkpoint discovery. Bounded pagination and CLI continuation corrected this, including existing-family validation beyond the first page. The scoped final re-review found no remaining issue. The pinned revision is recorded below.

## Remaining boundaries

The only source adapter here is the generated Codex fixture. Real mixed-source classification, personal configuration writing, full UNSEAL/TRUEFORM, GUI/MCP endpoints, native Windows and cross-machine store migration remain unverified or unimplemented. Store and fixture recovery do not claim comprehensive power-loss durability or protection against adversarial filesystem races. The [runbook](../loadouts.md) specifies explicit versions, checkpoints and observation boundaries.

[The reduced machine-readable result](2026-09-06-loadouts-macos.json) records booleans and technical environment data only. It deliberately does not export raw private store records.

## Final tested revision

The complete tested runtime is `29c13e225b8f381e201d50b46ef27470b6a31bd9`. Source/test bytes match the final **126/126 passing suite** and the approved final re-review. The final fix preserves access to histories above 1,000 records through bounded pages; it does not delete history or impose a new save cap. Existing native smoke favorites remained readable with the new paginated command. There are no unresolved review findings in this fixture-only slice.
