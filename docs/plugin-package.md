# Mac plugin assembly

The development package combines the built local interface, deterministic core/MCP, management and setup Skills, locked production dependencies and an official Node runtime. It currently targets **macOS arm64**. It is a local distribution candidate; the end-user installer, public download, update/removal recovery and appearance-authoring Skill are still being completed under the [plugin contract](spec-plugin-distribution.md).

## Maintainer build

Use Node.js 24+, the checkout's locked development dependencies and an existing canonical output parent outside the checkout. Download the exact [official Node.js archive](https://nodejs.org/dist/v24.20.0/node-v24.20.0-darwin-arm64.tar.gz) and compare it with the [official SHA256 list](https://nodejs.org/dist/v24.20.0/SHASUMS256.txt). Assembly also checks the pinned archive hash before extraction.

```text
node scripts/build-plugin.mjs --output "<new absolute output directory>/unharness" --runtime-archive "<canonical Node archive path>"
```

The builder runs type/CSP and production-build checks, installs production dependencies from the existing lockfile with scripts disabled, and copies only named product directories. Its JSON result gives the bundle identity, version, platform, source revision, dirty-source flag and file count. It refuses an existing output instead of overlaying it. A failed assembly leaves that new candidate available for inspection. Exit status is 0 for success, 1 for assembly failure and 2 for invalid usage. Git/npm are maintainer prerequisites, not commands required from daily product users.

`packaging/unharness/plugin.json` is the portable manifest. `mcp.json` uses a contained executable and the host's `PLUGIN_ROOT` / `PLUGIN_DATA` expansion. The `.codex-plugin/plugin.json` compatibility file carries matching identity/presentation metadata; it does not duplicate a legacy MCP declaration whose expansion behavior differs. The assembled package has one `skills/` tree at its root. This layout has been read by Codex 0.153.4; it does not establish earlier-client or other-application support. See the [official portable layout](https://developers.openai.com/plugins/build/plugins).

`scripts/unharness` launches only the bundled `runtime/bin/node`; it fails clearly when the distribution is incomplete. There is no hard-coded Codex-internal executable path, API key, model call, hosted service or required system Node installation. `runtime/LICENSE`, each production package's own notices and `THIRD_PARTY_NOTICES.md` remain in the bundle alongside Unharness's MIT license.

## Integrity and local records

`distribution.json` indexes every shipped regular file, including runtime, UI, dependencies, Skills and licenses, by bytes, SHA256 and executable status. Reading the bundle checks its supported manifest/runtime version, matching plugin/package versions, required files, complete file list and all contents. Extra, missing, modified or symlinked files fail; selected private-data root names are refused during assembly. The manifest is an integrity record for a user-selected package, not independent proof of publisher authenticity. Source revision and dirty status remain visible; a dirty candidate is not a reproducible public release.

Native cache installation does not become the home of Normal, setup versions, favorites, comparisons or operation receipts. The [fixed local connection](plugin-connection.md) binds those records outside the cache. The real host's update/remove behavior and an independent recovery copy are separate remaining checks; copying files into an archive is not proof of recovery after uninstall.

## Verified so far

The [Mac package evidence](evidence/2026-09-09-plugin-package-macos.md) covers the official runtime hash/signature, package/Skill validators, native marketplace installation, MCP calls, initial saving in the Codex in-app browser, three-mode input catalog checks, exact Normal restoration and unchanged installed-package integrity. A complete natural-language onboarding journey, public-domain pairing, downloaded-package launch and uninstall recovery are not established by this slice.
