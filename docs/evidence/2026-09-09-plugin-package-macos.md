# Native Mac plugin package checks — 2026-09-09

Environment: macOS arm64, Codex CLI/app-server 0.153.4, bundled Node.js 24.20.0, and the actual Codex in-app browser. One newly created owned Codex home/project and a separate temporary personal marketplace were used. The user's normal profile, existing marketplace and other workspaces were preserved. Native checks did not submit a model turn.

## Artifact and loading

The candidate's product/plugin version was `0.0.1`, its base revision was `96c3a2ca48d13a0f0627db1d0cac75ca3672a8ef`, and `sourceDirty` was **true**. Its indexed identity was `b2198038938b2a35fd78d593f2fc246307cdf755aaa3cc9a392a33ac9f4467a1`, covering 5,271 files. This is identified development evidence, not the final public artifact.

- The official `node-v24.20.0-darwin-arm64.tar.gz` archive was 52,813,331 bytes and matched SHA256 `40e5607e5ecb3db9192723776da2d75d966260fc74a7a9e731c1bd67dda96bc8` from the [Node release checksums](https://nodejs.org/dist/v24.20.0/SHASUMS256.txt). The extracted runtime reported `v24.20.0`.
- The runtime's embedded Developer ID signature named Node.js Foundation and passed local `codesign --verify --strict`. `spctl --type execute` reported valid code that is not an app; this does not qualify a browser-downloaded archive or an app distribution. No Gatekeeper or quarantine setting was changed.
- The official plugin validator and both Skill validators passed. Validation used an isolated Python environment with PyYAML; no maintainer environment or validator code was modified.
- The native CLI installed the candidate from the owned temporary personal marketplace into its versioned cache. A fresh app-server listed the management/setup Skills with the expected plugin ID and installed paths, and exposed the local MCP server/tools.
- Native `mcpServer/tool/call` read an unconfigured `installation_status`. The exact returned native data directory was locally configured using the installed wrapper with a PATH containing only macOS system directories. It did not depend on a user-installed Node executable.

## Initial saving, modes and recovery boundaries

The native MCP `open_workbench` started the installed bundle and returned a verified loopback URL. That URL opened in the actual Codex in-app browser. The UI showed unregistered state, allowed reviewed selection of only the owned global guide and `example` Skill, and saved initial Normal. Other discovered sources were left unselected. The management Skill was explicitly ineligible with `unharness-management-retained`.

A fresh native MCP connection retrieved the same pre-registration operation receipt. It saved one Normal favorite, prepared each selected mode and reused the same authenticated process/URL. Fresh native `debug prompt-input` results were projected in memory, expanding the runtime's Skill-root aliases to exact source paths; raw prompts were not retained.

| Prepared mode | Management Skill in input catalog | Setup Skill automatically included | Owned example Skill in catalog | Required project instructions |
| --- | --- | --- | --- | --- |
| Normal | Yes | No | Yes | Preserved |
| TRUEFORM | Yes | No | No | Preserved |
| UNSEAL | Yes | No | No | Preserved |
| Restored Normal | Yes | No | Yes | Preserved |

Final captured source bytes/metadata matched the starting Normal, conflict was null and recovery was not pending. The open in-app browser refreshed the saved favorite and Normal state after MCP operations. Rechecking every installed bundle file returned the original distribution identity, so these mode operations did not alter the cached product, runtime or Skills.

The affected distribution, binding, CLI/MCP, protected-control, request and launcher checks passed all 32 tests with no skips, both in the working tree and an isolated copy of the staged code. The staged type/CSP checks, production build, all 179 relative file links in the changed documents/Skills and whitespace checks also passed. The in-app tab and owned worker were then closed; the synthetic profile/cache remain available for the later update/remove checks.

These are actual native loader/input-preparation/MCP checks and an actual in-app browser check. They do not establish a model's natural-language Skill selection, a completed fresh Desktop model task, complete runtime-source coverage, a public HTTPS connection or performance improvement. Native update/remove, independent offline recovery, downloaded-package launch, Intel/Windows/Claude and the final product journey remain separate qualification work.
