# Registered user-source preparation on native macOS

Date: 2026-09-08. Core implementation and reviewed recovery follow-up: `4e36982` and `be1c6ae`.

This pass qualifies preparation and recovery of explicitly registered Codex sources in freshly owned profiles. It does not establish what a desktop task loaded, complete mode switching, or native Windows writes. The [source contract](../spec-user-sources.md) defines the selected global instruction and Skill scope.

## Environment and invocation

| Item | Observed value |
| --- | --- |
| OS / architecture | Darwin 25.6.0 / arm64 |
| Node.js | v24.20.0 |
| Native Codex runtime | 0.153.4 |
| Managed source data | Newly created owned home and project only |
| Model / desktop tasks started | None |

The reproducible native check requires an explicitly selected executable:

```sh
node test-support/native-user-sources-check.mjs /absolute/native/codex
```

The script creates and removes its own synthetic profiles. Private GUI qualification profiles and source fingerprints are retained outside Git; no personal configuration, source body or raw recording is included in this report.

## Core results

| Check | Result |
| --- | --- |
| Registration → UNSEAL → TRUEFORM → Normal | Original source bytes/absence returned; base/project instructions and protected configuration were retained |
| Supported metadata | uid/gid, mode 0640, `com.apple.provenance` and a custom extended attribute survived the native loop |
| Frozen favorite and checkpoint restoration | Saved contents returned; the saved preparation label remained distinct from the restoration operation |
| Native process abandonment | Recovery passed after the complete journal, owned directory creation, staging, both UNSEAL writes, before completion and after state publication |
| Other transaction paths | Synthetic checks cover every TRUEFORM managed write, concurrent and abandoned owners, stale plans, foreign stages, source edits and directory redirection |
| Foreign content in a created directory | Recovery preserved the foreign file and verified directory identity; subsequent UNSEAL and Normal plans/applications remained usable |
| Offline restoration | Resolution hooks denied Codex catalog/editor, Skill-policy and YAML imports while pending recovery and frozen Normal/favorite/checkpoint restoration and saving passed |
| Source scope | Native discovery found inherited host rows; only the generated example Skill was eligible within the owned profile |
| Unsupported metadata | ACLs and immutable flags were visible as unavailable before registration |
| Native numeric metadata | A rewrite that could round unselected Skill metadata was refused; an exact-byte no-op remained available |

The task's full pre-follow-up suite passed 232 tests. Final source/transform/RPC coverage passed 72 tests; the reviewed recovery/error correction passed 24 covering tests with one explicit non-macOS-platform skip. The native checker passed separately. The later GUI integration requires its own complete suite and browser evidence.

The independent task review found a retained-directory ownership defect after recovery and a facade error-format mismatch. Both were reproduced, corrected and approved in scoped re-review. A configuration rewrite also refuses comments it cannot preserve in place, numeric extra metadata whose original precision cannot be established, and unsupported YAML formats. Those refusals happen before managed publication.

## Evidence limits

- `runtimeStateVerified` and `modeSwitchingVerified` remain false; source coverage remains unknown. Prepared bytes require a fresh desktop task for runtime evidence.
- Native Windows source writes remain gated. Its metadata, recovery and desktop behavior need separate native qualification; a Mac conditional-test skip is not Windows evidence.
- Only the registered optional global AGENTS group and explicitly selected eligible Skills can be controlled. Project requirements, managed policy, memory, native continuity, execution permissions, hooks and unselected sources are retained.
- Provider-owned Skill caches are not rewritten to force manual invocation. An eligible, explicitly declared third-party addition may expose a configuration disable control while manual control is unavailable.
- The tested interruption points are complete operation boundaries. Power loss, interruption inside an individual filesystem/metadata command, partial lock initialization and hostile changes to every ancestor are not generalized guarantees. Ambiguous state is retained and refused.
- GUI operation, maintainer-profile setup and fresh desktop observation are separate evidence steps. The native core result alone does not claim them.
