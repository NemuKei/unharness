# Saved fixture versions in actual Mac desktop tasks, 2026-09-07

The registered-loadout service now has a complete observed path from a saved version through application, a fresh Codex desktop task, version-bound recording association and baseline restoration. The controlled scope is the existing synthetic fixture, not personal configuration or a complete product mode.

Tested checkout: `ac93836` (runtime introduced through `29c13e2`); no runtime source changes were needed for this check. Native macOS arm64, Node.js 24.20.0, installed desktop 26.901.41600/build 7982, actual task-recorded Codex runtime 0.153.4. The machine-readable evidence includes the OS version read during collection.

## Sequence and observed results

The existing desktop-registered fixture was intact at baseline. Its four generated sources were registered in the existing private local store under a separate scope from the earlier CLI-only smoke fixture. Baseline and manual-only configurations were saved under one name/family. Baseline was restored before applying the exact saved manual-only version, so this tested an actual configuration change, not only a no-op application.

The Codex app task-creation tool started one fresh local task in that saved project with the same short, marker-free READY prompt used in the earlier diagnostics. The core `loadouts observe` command consumed the exact local recording and saved an observation referring to the immutable application receipt and favorite version.

| Check | Result |
| --- | --- |
| Manual-only favorite application | Exact disk readback matched the saved configuration |
| Fresh task after application | Correct cwd and creation time; completed without tools |
| Initial manual-only input | Fixed and optional AGENTS markers present; Skill catalog/body markers absent from the record |
| Version association | `matched-record`; persisted observation → application → exact favorite references agree |
| Reuse an older task from the same project | `unqualified-record`; cwd matches but the task predates the preparation/application boundary |
| Restore the baseline favorite | Exact disk readback matched |
| Refresh and reissue baseline application receipt | Owned Skill mtime notification; new receipt captured the post-refresh preparation |
| Fresh baseline task and association | `matched-record`; fixed/optional AGENTS and Skill catalog markers present, body marker absent |
| Save baseline again after the loop | Reused the original immutable favorite version |

Two model tasks were started sequentially through the existing Codex desktop environment. Their application task APIs corroborated completion, and the persisted metadata IDs were correlated locally with those exact tasks. Recorded cwd, model, reasoning effort, approval policy, sandbox and permission-profile fields matched between the two tasks. Three selected personal configuration/instruction locations were unchanged across the sequence. No app restart was requested.

The test deliberately used an owned-file refresh before the baseline confirmation because the prior fixture experiment observed stale catalogs. Refresh changes preparation identity, so the baseline favorite was reapplied without source changes to obtain a fresh application receipt. The observed association uses that replacement receipt. This does not claim that refresh always works or that the earlier receipt remains current.

## What this establishes

The previously separate [loadout store/service check](2026-09-06-loadouts-macos.md) and [desktop fixture check](2026-09-06-desktop-fixture-macos.md) are now connected through real tasks. The core can retain an exact favorite version, prepare it, reject an old task, associate a fresh recording with that version and restore the baseline while preserving favorite identity.

`matched-record` establishes the scoped marker comparison in the selected recording. It does not establish exhaustive source coverage or a full Normal/UNSEAL/TRUEFORM implementation. `desktopSessionAttached`, `runtimeStateVerified` and `modeSwitchingVerified` remain false. Host-provided memory/hooks/plugins, personal-source classification and native Windows retain their previous unknown/unimplemented boundaries. This was not a performance comparison and publishes no token totals or quality scores.

The fixture is intact at baseline and retained for its saved desktop project. Private store paths, task/application/favorite IDs, marker nonces and raw recordings remain outside Git. [The reduced machine-readable evidence](2026-09-07-saved-loadout-desktop-macos.json) contains technical versions, booleans, fixed labels and the record-level results only.

## Next GUI slice

Connect a minimal local interface to the existing service for selecting/saving a version, applying it, showing the pending fresh-task requirement, associating a recording and restoring a favorite/checkpoint. Label the current source scope as synthetic. Show disk readback and recorded marker confirmation as different states; do not let an effect or refresh request advance verification. Windows verification can continue alongside this interface work. Real personal-source control and full product support remain separate acceptance gates.
