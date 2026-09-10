# Integrated Mac distribution candidate

Date: 2026-09-11 (JST). Source revision: `258c674a4984e9d9c9cdda9e9dba16999fcbe834`, with no source changes at assembly. This integrates the public artwork v2 client/server, persistent Mac directory identities, renderer and bundled dependency notices. Only newly created owned synthetic profiles were used. This is a **private candidate**, not a published release or a completed model-driven product journey.

## Package and archive

| Item | Verified value |
| --- | --- |
| Plugin | Unharness 0.0.1, macOS arm64 |
| Distribution ID | `dcacd38531d8a07e38da2488713966668548b09b585e47f6b7eac865674a28e3` |
| Indexed payload | 7,403 files, plus `distribution.json` |
| Bundled runtime | Official Node.js 24.20.0, darwin-arm64 |
| Runtime archive SHA-256 | `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8` |
| Installable archive | `unharness-0.0.1-macos-arm64.zip`, 92,341,137 bytes |
| Installable ZIP SHA-256 | `f66424e318cec7db034c651f5773d3a98f4aa4802234858fa1fcd5e7da3c3cf5` |

Assembly ran the type/CSP and local production build checks. The package validator and all three Skill validators passed. Full content validation and `codesign --verify --deep --strict` for the bundled Node passed before and after macOS `ditto` extraction.

The [installable wrapper](../mac-installation.md) contains the immutable plugin under `plugins/unharness`, the local marketplace manifest and the Japanese AI-guided installation instructions. All 7,406 files and their executable bits matched after ZIP extraction. Native installation used the pre-ZIP wrapper whose bytes and permissions matched that extraction. A separate pure-plugin ZIP was also checked during assembly; it is not the user-facing installation archive. Neither archive was uploaded.

## Native installation and saved configuration

Environment: macOS 26.6.2, Apple Silicon, Codex Desktop 26.903.61454 and its installed Codex executable 0.153.4. The executable path was selected for this machine; the product does not embed that path. No authentication file was copied and no model turn was submitted.

1. A freshly marked owned profile had one synthetic optional global guide, one optional Skill and a required project guide. Native `plugin marketplace add` and `plugin add unharness@deltahelmlab-unharness` succeeded with `CODEX_HOME` scoped to that child process. Installed-cache content validation matched the distribution above.
2. Native app-server started the installed MCP with **62 tools**. Initial status correctly required configuration. Configuring through the installed launcher with only macOS system directories in `PATH` used the bundled Node and created a separate recovery copy. Existing source bytes/metadata and all retained configuration semantics matched; only the native marketplace/plugin registration was added.
3. The actual Codex in-app browser registered only the synthetic global guide and Skill after explicit role selection, then saved the initial Normal. All six parent-directory identities used volume UUID plus inode; no device-number identity was introduced. The original Normal was saved as a favorite.
4. Native MCP saved an empty-official v2 pair without changing source files, prepared TRUEFORM, and saved a second pair while TRUEFORM remained prepared. That second pair retained no optional official plugins in TRUEFORM and added the owned Skill plus the fixed minimal guide in UNSEAL. UNSEAL preparation succeeded. The setup basis explicitly stated that no model consultation or nonempty official-plugin qualification occurred.
5. The in-app browser restored the initial Normal favorite. All seven checked source locations returned to their original bytes/absence and supported metadata. The favorite identity/snapshot and later v2 setup remained stored. The scope ended that sequence at Normal revision 5.
6. A v2 public-connection request exposed the current scope, root collection and thirteen operations. The local screen showed the artwork permission, and the test chose **decline**. No public-domain permission or HTTPS behavior is inferred from this local check.

## Native artwork and independent recovery

The installed MCP issued and re-read a marked authoring place, reviewed two deterministic 724px synthetic PNG parts and saved their exact reviewed version. The in-app browser displayed the saved name and rendered a card containing Normal, UNSEAL and TRUEFORM. No card or post was sent externally. Source preparation remained Normal revision 5 and all source files were unchanged. This checks authoring operations and rendering; it does not claim image generation by a model.

The native MCP then prepared TRUEFORM revision 6. Native plugin removal deleted its cache and removed the plugin registration from the owned configuration. Other source files were unchanged. The independent recovery copy of the **same distribution ID** started successfully on its first attempted launch under a process sandbox denying external networking and allowing loopback only. A separate control under that restriction received `EPERM` for `192.0.2.1:443`, while the recovery HTML returned HTTP 200 over loopback. System networking and the browser were not sandboxed.

In the actual in-app browser, recovery detected the removal-related configuration edit and withheld restoration. Its retained-only review used the selected native Codex executable under the same network restriction, confirmed no managed-source changes, and accepted the reviewed retained settings. The UI then showed the two Normal-restoration changes and completed the explicit restore.

A separate readback using only the recovery copy and bundled Node under the same restriction verified:

- **Normal revision 8**, no conflict and no pending recovery.
- All seven source locations matched the saved Normal bytes/absence and supported metadata, with the explicitly accepted plugin-removal configuration retained.
- The two-entry collection (standard appearance and authored version), selected item and saved artwork state were unchanged. The read-time assessment timestamp and current preparation revision changed as expected; they are not saved artwork content.
- The original favorite identity and snapshot remained unchanged. Its adaptation flag correctly became true because the retained configuration now excludes the removed plugin. The v2 setup identity remained stored.
- The native plugin cache was still absent.

The first readback assertion compared the entire live artwork view and rejected its changed read timestamp/preparation revision. The check was narrowed to the stored artwork and all other view fields; no product change was needed. The earlier independent-copy launch issue remains recorded in [its own evidence](2026-09-11-network-isolated-recovery-macos.md); this successful candidate launch does not explain that earlier result.

## Remaining boundaries

The [integrated regression](2026-09-11-public-artwork-client.md) covers the exact source tree: 1,067 passed, no failures and 64 optional/platform skips, plus fourteen explicitly enabled built-Chrome cases. No product code changed during this candidate check.

Internet download/quarantine launch, Finder double-click, reboot/remount, real public DNS/TLS and HTTPS-to-loopback permission, native Codex WebMCP, fresh Desktop model tasks and AI-guided setup/creation remain unqualified. Automatic-only control of nonempty installed official plugins remains unknown. The maintainer's existing legacy registration was not migrated or restored by these synthetic-profile checks. Public source/history/release and site publication require their concrete approved scope.
