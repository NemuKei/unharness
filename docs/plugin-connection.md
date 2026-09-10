# Local plugin connection

The development entry point binds a plugin to one explicitly selected Codex home and project. It can start before initial source registration, and later delegates to the same source controller and operations as the registered MCP endpoint. This completes the connection/bootstrap portion of the [plugin plan](spec-plugin-distribution.md); it is not a complete installer or native plugin qualification.

## Local configuration

The portable host supplies its exact `PLUGIN_DATA` directory. It does not reliably pass the active `CODEX_HOME` to an MCP child, and the plugin's working directory is its installed code. Neither is evidence of the user's intended source context. Select the real Codex profile and project locally, then configure one of these two forms:

```text
node bin/unharness.mjs plugin configure --data-directory "<native plugin data>" --workspace "<existing registered workspace>"
node bin/unharness.mjs plugin configure --data-directory "<native plugin data>" --codex-home "<selected Codex home>" --project "<selected project>" --codex "<selected executable>"
node bin/unharness.mjs plugin status --data-directory "<native plugin data>"
node bin/unharness.mjs plugin mcp --data-directory "<native plugin data>"
```

All directory arguments are existing canonical absolute paths. The executable defaults to `codex`; it is a native executable token/path, not a shell command. Configuration and status require only Node.js 24+; MCP uses the locked runtime dependencies. The command does not infer a context from environment variables or cwd, execute the selected app, discover Skills, register optional roles, save Normal or modify source files. It emits JSON on stdout, fixed safe failures on stderr, and exits 0 for completion, 1 for an operational failure, or 2 for invalid arguments. There are no prompts, force flags, network-origin options or browser-supplied configuration paths.

An exact repeated configuration is idempotent. A different existing binding, unsupported record version, corrupt record, symlink or replaced directory is refused. The first version supports one project context per selected Codex home. Changing that context requires a separately designed local reconfiguration flow; deleting source reservations is not that flow.

## Before and after Normal is saved

`installation_status` reports `configuration: required` with the native data directory until local configuration exists. `status` returns a connection UUID, null workspace and null source in that state. All source/launch operations refuse to act until configured. No MCP tool takes the home, project, executable or registration-role arguments.

Once configured, `open_workbench` opens the bundled [local screen](local-workbench.md), including before source registration. The local screen handles reviewed discovery and initial Normal saving. Until then, registered operations return `plugin-registration-required`. Calling `status` after registration accepts its source context; it also remains necessary after additive enrollment. Prepared settings and dated task-loading evidence keep their existing separate meanings.

The connection's authoritative context and first observed registration root are immutable records in `<selected Codex home>/.unharness-workbench`. Directory identities and source-root identity are rechecked on each operation. The native data directory contains only a private `unharness/connection.json` pointer. The host-owned parent need not be private, but must be canonical, owned and non-writable by other users; Unharness creates only its private child. Existing parent permissions are preserved.

New Mac context, scope and recovery-copy identities use a persistent volume UUID and inode; the current boot's device number is omitted from their saved hash. Existing records preserve their original identity format and idempotence. A missing UUID in an older record cannot prove its historical volume after a device-number change, so that case remains refused. See the [scoped verification](evidence/2026-09-11-persistent-mac-directory-identity.md).

Plugin operation receipts use the same conservative ledger implementation as registered MCP, rooted in `.unharness-workbench/ai-requests` with the immutable binding identity. They survive first registration, additive enrollment, plugin reconnect and recreation of a removed native data directory. Existing direct `mcp --workspace` receipts remain in their original namespace. An operation ID belongs to its originating connection/endpoint; recovery after reconnect uses that same entry point.

For an uncertain result, reuse its connection UUID, request UUID and exact arguments, or read `operation_status`. A completed open receipt is historical: inspect `workbench_status` for present liveness. Missing or damaged result records remain unconfirmed and never restart a mutation. No raw exception, saved launcher key or source body is returned in an error.

## Verification boundary

The [connection checks](evidence/2026-09-09-plugin-connection.md) cover CLI and official-client stdio, unconfigured startup, initial registration, immutable bindings, process reuse, operation identity and existing registered MCP regressions. Removing a synthetic native data directory tests preservation of authoritative records. The later [bundle qualification](evidence/2026-09-09-plugin-package-macos.md) and [native update/removal recovery](evidence/2026-09-09-plugin-recovery-macos.md) establish their separately stated scopes. Public-domain pairing and the complete first-time onboarding journey remain in progress.
