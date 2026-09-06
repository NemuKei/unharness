# Codex feasibility probe

This first development tool collects a read-only, sanitized inventory from the installed Codex runtime. It is intended to run with the same code on macOS and Windows. It does not switch modes, create model tasks, change configuration, or attach to the desktop app's active conversation.

## Prerequisites

- Node.js 24 or later. When running through Codex, its bundled workspace dependencies can provide Node; resolve the installed path on that machine rather than copying a path from another OS.
- The native Codex executable used by the desktop installation, or another explicitly identified native Codex executable available on PATH.
- A checkout of the exact Unharness revision being compared.

There are no package dependencies to install and no separate API key to configure for these local read requests.

## Run it

From the repository root, on either OS:

```text
node --version
node --test
node bin/unharness.mjs inspect --cwd . --output local-evidence/codex-probe.json
```

The output is a JSON inventory. An output path is optional; without it the report is printed to stdout only. Existing report files are not overwritten, so use a new filename for another run. The `local-evidence/` directory is ignored by Git.

If Codex is not found, specify its native executable:

```text
node bin/unharness.mjs inspect --cwd . --codex "absolute path to the Codex executable" --output local-evidence/codex-probe.json
```

On Windows, use the actual `codex.exe`. A `.cmd` or `.bat` launcher is not a native executable and the probe does not enable a shell to run it. In Windows Codex, locate the runtime belonging to the app or installed Codex package. Keep spaces and non-ASCII paths intact by quoting the executable path.

`--timeout-ms` changes the per-request timeout from its default 10000 ms; accepted values are 100–60000. `--help` lists the command without starting Codex.

## What the report establishes

The command reads the CLI version and starts a separate app-server process. It initializes a client, reads config layers, inventories skills and hooks, and asks for reported managed requirements. It summarizes known shapes and discards text and arbitrary values.

The report deliberately contains these evidence limits even when all requests succeed:

- `surface: "standalone-app-server"`
- `desktopSessionAttached: false`
- `runtimeStateVerified: false`
- `sourceCoverage: "unknown"`
- `modeSwitchingVerified: false`

The desktop host can supply different flags, selected capability roots, or already-loaded context. Successful inventory from this child process does not establish the full desktop harness or verify UNSEAL/TRUEFORM.

Exit 0 means the inventory requests completed with recognized shapes. Exit 1 means collection or report writing failed; useful partial results can still be present. Exit 2 means invalid command usage. None of these exit codes is a product support certification.

## Windows handoff to Codex

Open the same repository revision in Windows Codex. A suitable task prompt is:

> Read AGENTS.md and docs/codex-probe.md. Verify this read-only diagnostic on Windows. Resolve a Node.js 24+ runtime and the native Codex executable on this machine, then run the test suite and the inspect command. Do not modify my harness settings, restart the desktop app, or start model comparison tasks. Return the tested Git revision, Node/Codex/desktop versions, CPU architecture, whether execution was native Windows or WSL, the test result, and the sanitized probe JSON. If collection fails, report the fixed error classification and the relevant environment finding; do not paste raw settings, credentials, or raw doctor logs.

For a clearly named Windows result, run:

```text
git rev-parse HEAD
node --test
node bin/unharness.mjs inspect --cwd . --output local-evidence/windows-codex-probe.json
```

Use `--codex` if the PATH entry resolves to a launcher instead of the native binary. The Windows desktop version is recorded separately from the CLI version, because the probe itself does not establish a desktop attachment.

Return the safe JSON and test summary through the working conversation. Keep the local raw diagnostic/schema files out of commits. Real Windows evidence is still required even when all synthetic tests pass on macOS.

## Next validation after inventory

Use the result to identify the actual desktop loading and control boundary. Then test whether a new desktop task can preserve the intended comparison environment while changing only the registered harness scope. Configuration writes and recovery are a later implementation slice governed by [the product contract](spec.md).
