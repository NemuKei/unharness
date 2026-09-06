# Read-only Codex probe

## Purpose and limit

Implement the first feasibility tool from `docs/status.md`: obtain a portable, sanitized inventory from the installed Codex runtime without changing the user's configuration or starting model work. This is one independently useful slice of `docs/spec.md`; it does not implement modes, favorites, recovery, UI, or desktop task creation.

Windows verification will be run by Codex on the maintainer's Windows machine using the same repository and commands. A macOS test cannot mark Windows as verified.

## Runtime and command

- Node.js 24 or later, ES modules, standard library only. No package installation or API key is needed for the probe.
- `node bin/unharness.mjs inspect --cwd <directory> --codex <executable> --output <file>`; all flags are optional. Defaults are the current directory, `codex`, and JSON on stdout without a saved file.
- `--timeout-ms` accepts an integer from 100 through 60000; default 10000. `--help` prints the supported usage without starting Codex.
- Spawn a native executable with structured arguments and `shell: false`. Do not enable a shell to run Windows `.cmd` / `.bat` wrappers. Report that a native `codex.exe` is needed when such a wrapper is selected.
- An explicit output file is created without overwriting an existing file. Create its parent directory as needed. Always print the same sanitized report to stdout when collection completes, including partial failure.
- Exit 0 when all read requests complete with valid shapes, 1 for collection failures or output-write failures, and 2 for invalid command usage. Successful inventory is not successful mode switching.

## Allowed operations

Run the selected executable with `--version`, then a fresh `app-server --stdio` process. Only the following JSON-RPC requests may be sent:

1. `initialize`, identifying the client as `unharness_probe`, version `0.0.1`, with experimental API capability enabled.
2. `config/read` with `{ cwd, includeLayers: true }`.
3. `skills/list` with `{ cwds: [cwd], forceReload: true }`.
4. `hooks/list` with `{ cwds: [cwd] }`.
5. `configRequirements/read` with `{}`.

Send the `initialized` notification once after successful initialization. Reject every other outbound request or notification. Never send `thread/start`, `turn/start`, configuration writes, login, daemon lifecycle, hook-execution, or external tool calls.

Reject server-initiated requests with JSON-RPC method-not-found and count them; do not supply credentials or grant permissions. Unsolicited notifications never become user report content. Close stdin after use, await termination briefly, and terminate only the child process created by this probe if it fails to exit.

Handle response framing, IDs, out-of-order responses, startup errors, timeout, early exit, malformed JSON, and a maximum 8 MiB response-line/buffer size. RPC errors expose only a finite numeric error code and a fixed local classification, not the remote error message or data.

## Report contract

Report `schemaVersion: 1`, `probeVersion: "0.0.1"`, a locally generated UTC `observedAt`, and a fixed `kind: "codex-read-only-inventory"`.

Include a validated CLI semantic version when it can be extracted from version output. Environment includes only OS platform, architecture, and the Node semantic version. Never include machine usernames, absolute filesystem paths, hostnames, account identity, environment variables, raw stderr, instructions, skill descriptions/names, hook commands, plugin names, memory text, or arbitrary config values.

Connection evidence must always state `surface: "standalone-app-server"`, `desktopSessionAttached: false`, `runtimeStateVerified: false`, and whether initialization succeeded. `sourceCoverage` is always `"unknown"`; the host desktop may inject capability roots that this process does not receive. `modeSwitchingVerified` is always false.

For each query, represent its status as `ok`, `error`, or `not-run`. An error uses a fixed local kind and an optional finite numeric RPC code. A failed or malformed query must not become a successful zero count.

Produce summaries only from explicitly recognized shapes:

- Config: `config` and `origins` objects are required. Summarize layers by the allowlisted source type (`packagedDefaults`, `mdm`, `system`, `enterpriseManaged`, `user`, `project`, `sessionFlags`, `legacyManagedConfigTomlFromFile`, `legacyManagedConfigTomlFromMdm`; otherwise `unknown`), whether the layer is disabled, and presence booleans for `skills`, `hooks`, `memories`, `plugins`, `mcp_servers`, `instructions`, `developer_instructions`, and `model_instructions_file`. Do not return layer names, paths, version strings, or values. Missing layers means unknown layer inventory, not an empty verified list.
- Skills: require `data` array, with each entry containing `skills` and `errors` arrays. Count total, enabled, disabled, unknown-enabled, errors, plugin-associated entries, and scopes `user`, `repo`, `system`, `admin`, `unknown`. Accept booleans only for enabled state. Count an association without returning the plugin ID.
- Hooks: require `data` array and each entry's `hooks`, `warnings`, and `errors` arrays. Return counts only.
- Requirements: `requirements: null` means none reported; an object means present. An absent property means unknown; invalid non-null primitives are an invalid response.

No report field may copy an unknown input key or free-form input string. Construct an allowlisted output object instead of recursively redacting arbitrary response data. Synthetic tests must put secret-like markers into nested config values, source metadata, names, paths, errors, and unexpected fields and verify none reach serialized reports.

## Acceptance

- The real macOS Codex 0.153.4 read requests can be summarized while keeping user configuration unchanged.
- Subprocess tests run a controlled synthetic server process, preserve real pipe/framing/timer behavior, and verify the allowlist, interleaving, failure, and cleanup contracts. No model or live configuration writes occur in tests.
- CLI tests exercise help, argument failure, JSON output, output-file collision, and a path containing spaces/Unicode. Use test-owned temporary directories and a Node fixture executable rather than platform-specific shell scripts.
- Public summaries retain useful counts and layer categories while omitting sensitive/free-form content.
- The Windows handoff includes exact commands, expected evidence limits, and how to point to a native Codex binary. Windows remains unverified until that run is returned.
