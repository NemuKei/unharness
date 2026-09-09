# Owned workbench launcher — macOS evidence

Date: 2026-09-09. Environment: macOS 26.6.2 arm64, Node.js 24.20.0, installed Codex 0.153.4. All source writes in this check used freshly owned synthetic profiles. No personal source was registered, no model task ran, and no public deployment or connection was made.

## Checks

- The focused launcher/CLI/MCP tests cover concurrent reuse, stop/reopen, a worker crash, changed bundled assets, private stages, independent receipt edits, invalid/redirected receipts, another server taking the old port, and a recorded live process that cannot be authenticated. Source files and saved Normal stay intact.
- A fixed unregistered context opens its existing discovery/registration flow. Saving Normal then allows the registered workspace to reuse the same launch and URL. Source controllers pin the first registration and its physical workspace identity; later additive enrollment keeps the original root identity.
- The official MCP client opens the workbench, reads current launch status, retrieves the same completed operation after reconnect, and calls the same opening operation in all three prepared modes. Arbitrary workspace/origin arguments are rejected by the tool schema.
- The related six-file core run passed 46 tests with no failures or skips. After the final publication and source-session guard refinements, the seven-file run passed 49 tests, including 11 launcher/entry-point cases. Type/CSP checks and the production build passed.
- The exact staged source, excluding the separate appearance work in progress, passed type/CSP/build checks and all 14 launcher/entry-point/session tests. Seven existing Claude GUI/AI tests also passed; that is shared-controller regression evidence, not new native Claude qualification.
- In Codex's actual in-app browser, the launched production UI rendered, prepared UNSEAL, then restored Normal. The UI continued to distinguish file preparation from task loading. Local readback verified exact Normal files/metadata, no conflict and no pending recovery. Stopping and reopening produced a new launch identity; the same browser tab showed saved Normal at the new URL. The tab and synthetic processes were then closed.

## Plugin format preflight

A separate temporary Codex home installed an owned probe plugin through a temporary local marketplace. The legacy `.mcp.json` passed placeholder arguments literally and supplied no plugin-root variables. A portable root `plugin.json` plus `mcp.json` resolved `${PLUGIN_ROOT}` and `${PLUGIN_DATA}`, used the requested plugin-root working directory, and exposed the probe's tool through native `mcpServerStatus/list`. No model turn was submitted. The source and installed cache had distinct paths, while the native data directory was outside the versioned plugin cache.

This bounded check informs the [distribution format](../spec-plugin-distribution.md). It does not qualify the Unharness plugin package, initial profile binding, data retention after uninstall, downloaded Node bootstrap or a fresh desktop task using the management Skill. The behavior is version-specific; official [packaging guidance](https://developers.openai.com/plugins/build/plugins) describes portable component discovery but does not itself prove local runtime behavior.

## Remaining qualification

The public-origin field is still absent from the launch configuration and returned as null. Public HTTPS/loopback pairing, remote API permissions, WebMCP, installer/update/uninstall behavior, free layered artwork and the complete native product journey remain open. The browser check above used a synthetic native adapter for configuration changes; it did not establish a new native Codex task's loading, Windows behavior, or performance improvement.
