# Mac plugin update, removal and independent recovery

Date: 2026-09-09. Platform: macOS arm64. Native Codex: 0.153.4. This qualification used the previously created owned profile, synthetic global guide/example Skill and required project guide. No personal source scope was registered or modified and no model task was started.

## Observed native sequence

1. Installed the new package through the native personal-marketplace CLI, using the official cachebuster helper. The original binding, Normal identity, one favorite and an earlier completed MCP operation receipt remained readable through a fresh native app-server/MCP connection. The native plugin data directory stayed the same.
2. Before opening or writing through packaged MCP, the product prepared a verified recovery copy outside native plugin data/cache. Repeated preparation reused the intact copy. A subsequent package version produced another copy and kept the previous one.
3. Prepared TRUEFORM through native MCP and removed only the owned Unharness plugin using `codex plugin remove`. Its installed cache directory disappeared. The detached workbench detected removal of its owning files and stopped itself. It did not kill another process by a recorded PID.
4. Opened the separate recovery package with only `/usr/bin:/bin:/usr/sbin:/sbin` on PATH. Both `node` and `codex` were confirmed unavailable on that PATH; the bundled Node still opened the local screen. The original data and favorite were present. The native host retained PLUGIN_DATA in this observed version, but the recovery path does not require it.
5. The native removal also deleted the retained plugin table in `config.toml`. The screen displayed an independent-edit conflict and suspended Normal restoration. Trying semantic reconciliation without the selected local Codex executable failed without applying a source change.
6. Reopened the recovery package with the selected local Codex executable available. The actual in-app browser reviewed the retained-only change and explicitly accepted it. No AI/model request was involved. The original Normal record stayed immutable; its active retained-settings version preserved the removed plugin.
7. Stopped that process, reopened again with no system Node/Codex available, then used the in-app browser to review and apply Normal. The registered source bytes and supported metadata matched the active Normal snapshot. Original guide, Skill, policy and project files matched the before-update capture. Parsed configuration retained all other settings and kept the plugin absent. Conflict and pending recovery were clear; the same favorite remained.
8. Opened the saved `.command` with macOS LaunchServices. It started the verified local recovery UI and the default Chrome tab displayed Normal. Opening it left source state unchanged. This is local, non-quarantined-file evidence; it is not downloaded-package/Gatekeeper qualification.
9. Reinstalled the same native plugin version. A fresh native MCP connection retained the original binding/Normal/favorite/old operation receipt. The newly re-added retained plugin setting was reviewed and accepted separately. The fixture ended at Normal, with no conflict or pending recovery. Test workbench processes and browser tabs were closed.

The native update/removal/reinstall package was `0.0.1+codex.20260909130939`, content identity `796363f63c27b27aca0ea173ab6c8681c06f8fa7a0d178742a1929caeab6d339`. It was assembled from base commit `0c2eb4b` plus the current recovery implementation and existing appearance work in progress. It is a development artifact, not a clean/reproducible public release. Small subsequent UI wording, Japanese change labels, footer spacing and explicit last-known-state display were checked in the final built-browser tests separately.

The final startup preflight was qualified in another assembled candidate, content identity `6e392325d3eaaf7ccf68fc93e1acef7dd2f80fb77731f1226e33dc1de79bb21b`. Its saved `.command` used macOS SHA256 checks for the bundled Node and the builtin-only verifier before execution, then verified the entire distribution before loading the recovery CLI. Running that command with no system Node/Codex opened the default browser and preserved the existing Normal state. Synthetic tests changed each of the four bootstrap files independently and confirmed refusal before a changed runtime could execute. This improves the stored-command integrity boundary; it is not publisher authentication or a guarantee against an attacker able to rewrite the trusted command itself.

## Bug found by native removal

The plugin table and generated selected-Skill table were adjacent. Removing the plugin independently and removing the Skill override to restore Normal overlapped on a separator line, so the previous line merge refused a semantically valid restoration. The fix permits a union only when both conflicting edits are deletions. Insertions/replacements remain conflicts. The existing native checks still prove unchanged selected state in the independent edit, unchanged retained state in the intended restore, and the exact selected/retained partitions of the merged result. The fallback also preserves current TOML comments.

The failing case was reproduced by the native profile and a focused synthetic-protocol test. The synthetic fixture uses an unquoted plugin table because that small fixture intentionally supports limited TOML syntax. The actual quoted native plugin identifier was verified separately by the successful native flow above.

## Focused checks

- Versioned copy integrity, preserved old/incomplete copies, tampered command/package refusal, physical binding changes, native data/cache removal, and no registration or source writes during preparation.
- Recovery-only authority: no release modes, arbitrary/foreign plans, source registration/enrollment or setup/appearance writes. Only plans reviewed by the current recovery controller can be applied.
- Strict JSON, exact fields, Host/origin/token checks, duplicate request IDs, stale plans, independent edits, retained-recording interruption and recovery.
- Worker lifetime on cache removal/replacement, with existing authenticated launcher concurrency, unknown-process and stop/restart regressions.
- Built UI at 1280×900 and 390×844: local requests only, Normal restore, preserved independent edit, explicit last-known state after a lost response, one apply request and successful readback. No unexpected page/console errors or horizontal overflow. Screenshots were inspected outside the repository. Native in-app and default-browser displays were also observed.
- TypeScript/Pixi CSP and production build passed. The final complete suite ran 813 tests: 812 passed, one existing platform case skipped, no failures. A separate copy of the exact staged change, excluding unfinished appearance work, passed type/CSP/build and 71 focused tests with no skips, including both built-browser recovery scenarios. The management Skill validator, 198 relative file links in nine changed documents and `git diff --check` also passed.

## Remaining boundaries

This slice establishes native package update/removal/reinstall and local recovery for the stated Mac/Codex version. It does not establish downloaded/quarantined launch, public-domain pairing, first-time natural-language onboarding, new desktop model-task loading, arbitrary retained-edit merging, Claude or Windows qualification. Native data retention is an observation, not an uninstall guarantee. A modified recovery copy fails closed; older copies remain available for explicit use.

See [recovery operations](../plugin-recovery.md), [package assembly](../plugin-package.md) and the [product finish plan](../superpowers/plans/2026-09-09-mac-product-experience.md).
