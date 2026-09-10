# Mac plugin assembly

The development package combines the built local interface, deterministic core/MCP, management, setup and original-authoring Skills, locked production dependencies and an official Node runtime. It currently targets **macOS arm64**. Native update/removal/reinstall and [independent recovery](plugin-recovery.md) have scoped evidence. The [v2/artwork package checkpoint](evidence/2026-09-10-native-package-v2.md) adds actual in-app saving and version selection. The end-user installer, public download and complete model-driven journey remain in progress under the [plugin contract](spec-plugin-distribution.md).

## Maintainer build

Use Node.js 24+, the checkout's locked development dependencies and an existing canonical output parent outside the checkout. Download the exact [official Node.js archive](https://nodejs.org/dist/v24.20.0/node-v24.20.0-darwin-arm64.tar.gz) and compare it with the [official SHA256 list](https://nodejs.org/dist/v24.20.0/SHASUMS256.txt). Assembly also checks the pinned archive hash before extraction.

```text
node scripts/build-plugin.mjs --output "<new absolute output directory>/unharness" --runtime-archive "<canonical Node archive path>"
```

The builder runs type/CSP and production-build checks, installs production dependencies from the existing lockfile with scripts disabled, and copies only named product directories. Its JSON result gives the bundle identity, version, platform, source revision, dirty-source flag and file count. It refuses an existing output instead of overlaying it. A failed assembly leaves that new candidate available for inspection. Exit status is 0 for success, 1 for assembly failure and 2 for invalid usage. Git/npm are maintainer prerequisites, not commands required from daily product users.

`packaging/unharness/plugin.json` is the portable manifest. `mcp.json` uses a contained executable and the host's `PLUGIN_ROOT` / `PLUGIN_DATA` expansion. The `.codex-plugin/plugin.json` compatibility file carries matching identity/presentation metadata; it does not duplicate a legacy MCP declaration whose expansion behavior differs. The assembled package has one `skills/` tree at its root. This layout has been read by Codex 0.153.4; it does not establish earlier-client or other-application support. See the [official portable layout](https://developers.openai.com/plugins/build/plugins).

`scripts/unharness` launches only the bundled `runtime/bin/node`; it fails clearly when the distribution is incomplete. There is no hard-coded Codex-internal executable path, API key, model call, hosted service or required system Node installation. `runtime/LICENSE`, each production package's own notices and `THIRD_PARTY_NOTICES.md` remain in the bundle alongside Unharness's MIT license.

Both browser builds also emit the complete dependency notices in `THIRD_PARTY_NOTICES.txt`. The build checks installed production versions against the lockfile and refuses missing or empty notices. The locked colord package omits its license file; a [reviewed copy from its exact upstream version](dependency-notices.md) supplies it during assembly. This step needs no network access.

## Integrity and local records

`distribution.json` indexes every shipped regular file, including runtime, UI, dependencies, Skills and licenses, by bytes, SHA256 and executable status. Reading the bundle checks its supported manifest/runtime version, matching plugin/package versions, required files, complete file list and all contents. Extra, missing, modified or symlinked files fail; selected private-data root names are refused during assembly. The manifest is an integrity record for a user-selected package, not independent proof of publisher authenticity. Source revision and dirty status remain visible; a dirty candidate is not a reproducible public release.

Native cache installation does not become the home of Normal, setup versions, favorites, comparisons or operation receipts. The [fixed local connection](plugin-connection.md) binds those records outside the cache. Packaged configuration and MCP writes verify a separate recovery copy first. [Native removal evidence](evidence/2026-09-09-plugin-recovery-macos.md) confirms cache deletion, worker shutdown, recovery through that copy and preserved records after reinstall. The native host retained its data directory in that test, but independent recovery also works when that directory is absent.

## Verified so far

The [Mac package evidence](evidence/2026-09-09-plugin-package-macos.md) covers the official runtime hash/signature, package/Skill validators, native marketplace installation, MCP calls, initial saving in the Codex in-app browser, three-mode input catalog checks, exact Normal restoration and unchanged installed-package integrity. [Update and recovery evidence](evidence/2026-09-09-plugin-recovery-macos.md) covers the subsequent native lifecycle. A complete natural-language onboarding journey, public-domain pairing and downloaded-package launch remain unverified.

The [subsequent v2/artwork check](evidence/2026-09-10-native-package-v2.md) covers all three bundled Skills, native MCP authoring operations, in-app file selection and three-mode previews, saved setup and collection preservation through an update, old Normal favorite restoration, and recovery after native removal. The official-plugin selection was empty and no model turn was submitted.

The [archive checkpoint](evidence/2026-09-10-distribution-archive.md) additionally verifies ZIP extraction, complete identity preservation, launch permissions and supplemental dependency notices. It remains a private candidate; downloaded-file launch and the final public client are not qualified by that check.
