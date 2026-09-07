# Registered user-source preparation on native macOS

Date: 2026-09-08. Core implementation and reviewed recovery follow-up: `4e36982` and `be1c6ae`. Workbench implementation and reviewed visual corrections: `5c24a97` and `05b2f09`. Final ownership and portable-admission corrections: `1db892a` and `ec5f3cc`; the final integrated runtime checks used `ec5f3cc`.

This pass qualifies preparation and recovery of explicitly registered Codex sources in freshly owned profiles. It does not establish what a desktop task loaded, complete mode switching, or native Windows writes. The [source contract](../spec-user-sources.md) defines the selected global instruction and Skill scope.

## Environment and invocation

| Item | Observed value |
| --- | --- |
| OS / architecture | Darwin 25.6.0 / arm64 |
| Node.js | v24.20.0 |
| Native Codex runtime | 0.153.4 |
| Bundle supplying the native executable | ChatGPT 26.901.51231, build 8109 |
| Browser | Codex in-app browser; 1280×720 and 390×844 viewports |
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

The task's full pre-follow-up suite passed 232 tests. Final source/transform/RPC coverage passed 72 tests; the reviewed recovery/error correction passed 24 covering tests with one explicit non-macOS-platform skip. The native checker passed separately. The integrated workbench suite passed 245 tests with that one platform skip; the final UI correction passed 14 relevant HTTP/client tests, type/CSP checks and the production build. These are complementary runs, not an invented sum of unique tests.

After the final ownership/portability corrections, `node --test` passed **264 tests, 0 failures, 1 explicit platform skip** (265 total, 37.992 seconds). The native checker was repeated successfully against `ec5f3cc` on the same Mac/Codex version. Both outputs were free of warnings/failure output, with empty native stderr. Frontend bytes and type/CSP/build inputs remain the qualified `05b2f09` version.

The independent task review found a retained-directory ownership defect after recovery and a facade error-format mismatch. Both were reproduced, corrected and approved in scoped re-review. A configuration rewrite also refuses comments it cannot preserve in place, numeric extra metadata whose original precision cannot be established, and unsupported YAML formats. Those refusals happen before managed publication.

The whole-feature review also found that an unsupported file owner/group could be admitted before a later staging failure. On macOS, writable controls now require the executing effective UID and an effective/supplementary group that can be reproduced. This is checked before reservation/planning and again before checkpoint/journal/stage publication; needed recovery changes have the same guard. Foreign-owned read-only dependencies remain readable. Config, policy and override capabilities stay distinct, including disabled-Skill no-op behavior. Existing records do not bypass these checks, and unfamiliar stages are never discarded as a workaround.

Ownership regressions use UID/GID observations and process identity mocks confined to owned test profiles, without privileged or foreign-owned writes. A follow-up separates portable read/plan admission from qualified publication: simulated missing POSIX identity APIs preserve Windows discovery/registration/nonempty plans while application, recovery and the low-level writer remain blocked. macOS missing-API admission stays strict. These are synthetic routing checks, not native Windows evidence. Both review findings and the follow-up regression were corrected and scoped re-reviewed successfully.

## Built-browser results

All preparation, saving and recovery operations used a newly created owned profile. A second owned profile stayed unregistered for the changed-context and source-review checks.

| Browser path | Observed result |
| --- | --- |
| Discover → select optional generated sources → save Normal | All declarations initially unchecked; registration saved Normal without changing the seven captured file/absence/metadata entries |
| UNSEAL preview → reviewed prepare | Preview left original files unchanged; preparation wrote the exact fixed guide and manual invocation policy while retaining the other five entries |
| TRUEFORM → Normal | Native discovery reported the generated Skill disabled, the inert override was present, and original policy absence returned; Normal then restored every original file/absence/metadata entry |
| Save UNSEAL while previewing TRUEFORM | The saved version and acknowledgement identified the actual prepared UNSEAL condition; the favorite appeared immediately |
| Saved favorite → latest checkpoint | Exact saved UNSEAL bytes/metadata returned; the checkpoint returned to Normal and the preview followed the saved mode label |
| Abandon a child after `write-1` → GUI recovery | The corrected UI led with interrupted/unconfirmed state, preserved recovery access, and returned to exact original Normal contents |
| Independent Skill-body edit → refresh/restore request | The GUI displayed a conflict and blocked restoration; the independent edit remained intact. Only the deliberately introduced owned edit was repaired for further qualification |
| Failed metadata read → another profile at the same port | The old screen displayed the new context and stopped its dependent recovery action. Both profiles' source maps were unchanged and the new profile stayed unregistered |
| Restart the original profile | The original scope and Normal identities were retained; no recapture occurred |
| Source review and keyboard return | Selected text appeared inline, received focus and remained escaped; both Escape and the close button returned focus to the requesting button |
| 390px layout, keyboard and effects | Controls and source text fit without page-wide horizontal overflow; keyboard navigation opened recovery details; effects-off and reduced motion showed the selected static condition |
| Existing fixture launch | The new build displayed its original fixture controls and separate read-only inventory panel, with the fixture scope label intact; no fixture mutation was submitted |

Page content and screenshots showed the accepted renderer without a framework error overlay. Relevant console errors/warnings were empty. Temporary viewport/media overrides were reset and effects were returned to their original enabled preference. The final owned profile is Normal with no conflict or pending recovery, and its original Normal identity is unchanged.

The first browser pass found a misleading page title, an incorrect Normal change count, a source review below the visible flow, indistinct save feedback and a pending-operation message that incorrectly led with external change. The correction was reviewed and each affected path was repeated successfully in the built browser. The [workbench runbook](../user-source-gui.md) contains launch/resume and recovery commands.

## Maintainer profile preflight

A separate read-only discovery of the maintainer's selected native Codex home/project found no existing source registration. It returned an eligible global override group and 60 Skill rows, of which 30 met the technical control/capture conditions; 30 provider/outside rows were excluded. No global dependency was reported unavailable. These counts do not classify a source as user-authored or optional.

The actual workbench was then opened for that same home/project and read the candidate list, and was restarted/re-read with the final backend. Its setup displayed 61 rows including the global instruction group, with every target/declaration unchecked. No role declaration, source registration or preparation was submitted for that profile. After final GUI discovery, the content/existence and recorded ownership/permissions of the three selected personal configuration/instruction files matched their preflight fingerprints. The project config remained absent; the repository's intentional AGENTS documentation update was accounted for separately. The real setup is left unregistered for the maintainer's selection.

## Evidence limits

- `runtimeStateVerified` and `modeSwitchingVerified` remain false; source coverage remains unknown. Prepared bytes require a fresh desktop task for runtime evidence.
- Native Windows source writes remain gated. Its metadata, recovery and desktop behavior need separate native qualification; a Mac conditional-test skip is not Windows evidence.
- Only the registered optional global AGENTS group and explicitly selected eligible Skills can be controlled. Project requirements, managed policy, memory, native continuity, execution permissions, hooks and unselected sources are retained.
- Provider-owned Skill caches are not rewritten to force manual invocation. An eligible, explicitly declared third-party addition may expose a configuration disable control while manual control is unavailable.
- The tested interruption points are complete operation boundaries. Power loss, interruption inside an individual filesystem/metadata command, partial lock initialization and hostile changes to every ancestor are not generalized guarantees. Ambiguous state is retained and refused.
- Built-browser operation and the read-only maintainer setup are covered above. No real personal-source preparation or fresh desktop observation is claimed by this pass.
