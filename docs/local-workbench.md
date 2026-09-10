# Local workbench startup

The development server also contains the [restricted public connection backend](domain-connection.md). Its local approval screen, MCP handoff and real HTTPS browser connection are still being built. Ordinary startup continues to return the bundled local origin; it does not grant public authorization.

The owned launcher starts or reuses the bundled loopback workbench for one locally selected context. Opening the UI does not prepare a mode, save a new Normal, or establish task loading. Plugin onboarding and the public-origin bridge are separate parts of the [Mac product plan](superpowers/plans/2026-09-09-mac-product-experience.md).

For an existing registration, use Node.js 24+ and this checkout's locked dependencies and production build:

```text
node bin/unharness.mjs workbench open --workspace "<canonical registered workspace>"
node bin/unharness.mjs workbench status --workspace "<canonical registered workspace>"
node bin/unharness.mjs workbench stop --workspace "<canonical registered workspace>"
```

The commands produce one JSON result on stdout, or a safe error kind on stderr. Exit codes are 0 for a completed command, 1 for an operational failure, and 2 for invalid arguments. `status` never starts a process. `stop` closes only a process that proves possession of the saved launcher key; it drains accepted source operations and retains every saved configuration. The caller opens the returned `loopbackOrigin` using its available browser. No command takes a public origin, network host, arbitrary command, token or source path.

The registered MCP tools `open_workbench` and `workbench_status` call this same implementation. Opening uses the existing connection/request UUID receipt contract. After reconnect, an earlier completed open result remains historical: use `workbench_status` to check that its launch is still running. If a confirmed completed launch has since stopped, a new explicit open is a new logical request. Never invent a new request ID for an unconfirmed earlier operation.

The internal launcher also accepts one fixed application context before registration. Its browser can only use the existing reviewed discovery/registration operations for that context. The launcher keeps its process identity across the initial Normal save, and the resulting registered workspace reuses the same process. This internal capability is not yet a complete end-user installation flow.

## Process ownership and recovery

Private launch receipts live in `.unharness-workbench` under the selected application's home, outside both the plugin cache and `.unharness-user-sources`. Their presence does not create or reserve a source registration. The receipt names the fixed context, launch, runtime, loopback port and process, and holds a private key. Public command/tool results omit that key.

An exact Host check and a fresh HMAC challenge verify process identity before reuse. The key is never sent to a possibly reused port. Browser origins, fetch metadata, ordinary GUI tokens and unauthenticated requests cannot stop the process. A PID by itself never authorizes termination. When a recorded live PID is unresponsive, the launcher reports unknown and refuses duplicate startup. A dead worker can be reopened. A changed bundled runtime/UI closes the authenticated owned process before starting its replacement.

A private lock serializes concurrent opens and stops. Interrupted receipt stages have unique names and are never treated as process authority. A parent that exits before publishing a running receipt leaves its child to shut down; a complete receipt lets the detached local UI outlive the requesting AI. Publication checks the prior receipt and retains independent edits. Corrupt receipts, redirected directories and ambiguous ownership fail closed.

If the launcher itself is unavailable, the original [direct local GUI command](user-source-gui.md) and the registered [Node-only recovery command](ai-commands.md#lost-responses-and-recovery) remain available. Do not delete source reservations, Normal records or configuration files to repair a launch receipt. The source core keeps its own locks, conflict checks and recovery journals.

The [Mac evidence](evidence/2026-09-09-workbench-launch-macos.md) covers owned process behavior, MCP/CLI reuse and an actual Codex in-app browser check. It does not qualify the later public HTTPS origin, pairing, complete plugin installer or Windows desktop behavior.
