# Read-only personal-source inventory

This slice connects the existing [standalone inventory](codex-probe.md) to the local GUI and adds a bounded census of standard instruction-file candidates. It reads the selected real project context without registering or changing personal settings. A reported item is not a removable harness element: role classification and desktop control remain unverified.

## Run it

The CLI and GUI call the same `collectSourceInventory` operation. No model request, paid API or browser dependency is needed for the CLI:

```sh
node bin/unharness.mjs inspect-sources --cwd . --output local-evidence/source-inventory.json
```

`inspect-sources` accepts the same native-executable, cwd, timeout and exclusive-output options as `inspect`. The original `inspect` report remains unchanged. Exit 0 means the recognized RPC queries and bounded standard-file census completed; a partial or failed collection exits 1 with the available report. Neither result verifies full source coverage, an active task or a mode. Reports contain categories, counts, file status/size/hash and evidence limits, without instruction text, Skill names, hook commands or personal paths. Explicit output files are created without overwriting, with private permissions where the OS supports them.

For an existing GUI store, append `--inspect-cwd <selected-project>` and optionally `--codex <native-executable>` to its printed resume arguments. For a fresh diagnostic workspace:

```sh
npm run gui -- --inspect-cwd .
```

The **このPCのCodex設定** panel shows the selected project separately from the owned fixture. Click **Codex設定を読み取る** to collect. Opening or reloading the page only retrieves the most recent dated report in that server; it does not launch a collection. A GUI launched without `--inspect-cwd` cannot collect personal sources. The target and executable are selected by the local CLI, never by browser input. Use the actual native `codex.exe` on Windows; shell wrappers are rejected. Relative CLI contexts are normalized once so RPC and filesystem discovery refer to the same absolute project.

The [accepted release scope](harness-scope.md) focuses on self-authored and personally added instructions/Skills, with optional hooks secondary. The panel shows these source categories first and collapses retained memory, integrations and policy. A discovery count includes every item reported by that reader, including provider items; it is not the number eligible for removal. `user` scope and plugin association do not establish provenance or an optional role.

## What the report establishes

| Source | Observed information | Remaining decision or evidence |
| --- | --- | --- |
| Standard instruction candidates | Presence, empty/unreadable/linked/changed state, byte count and digest for `AGENTS.md` and `AGENTS.override.md` | Mandatory versus optional roles, actual selection/loading, custom fallback filenames and host-injected instructions |
| Skills | Discovered count, reported enabled/disabled/unknown states and collection errors | Complete desktop roots, managed selection and desktop loading |
| Hooks | Discovered count, warnings and errors; no command execution | Role, retained requirements and a verified stopping mechanism |
| Memories | Presence of the recognized configuration key in reported layers | Existing settings are preserved; actual input/use remains a comparison condition to observe |
| Plugins and MCP | Presence of recognized configuration keys | Actual connection state and provided source coverage |
| Managed requirements | Whether the runtime reports an object, null or unknown | Task requirements, managed policy and execution permissions remain protected |

The [official App Server guide](https://learn.chatgpt.com/docs/app-server) defines `config/read` as resolved disk configuration and permits scoped Skill/hook discovery. The existing five-request read allowlist remains unchanged. A standalone process does not establish the desktop app's injected roots or current input.

The file census follows only the standard candidate locations described in the [official instruction guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md): Codex home and the nearest Git-root-to-cwd directory chain, or cwd alone when no Git marker is found. It keeps both override and base candidates; it does not emulate selection or evaluate file contents. Configured fallback names, custom project-root rules and truncation are not resolved. These limits are always shown as unknown rather than inferred from file existence.

Bound the ancestor search to 64 directories and each file to 1 MiB. Read only regular files, reject final-path links, compare file identity and metadata around the read, and discard source bytes after producing the status/size/hash. Unreadable, oversized, linked, changed or unknown-boundary cases remain partial. This is an inventory, not protection against an adversarial filesystem changing all ancestors during a read. The GUI also rejects replacement of its selected directory before starting a collection.

## HTTP and lifecycle

The existing Host/origin/client-header/token boundary covers both routes:

- `GET /api/inventory` returns `{ launchId, enabled, cwd, report }`. `launchId` is a per-launch UUID without authentication privileges. The explicitly selected cwd is local handoff information; report source paths remain omitted.
- `POST /api/inspect` accepts only `{ requestId }` and returns the same result envelope as other GUI operations. A browser cannot supply paths, executables, source contents or a different scope.

The GUI collection uses a 3-second timeout per existing RPC/version request. Concurrent reads share a collection, and repeated operation IDs retain the same response. Collection runs separately from the fixture mutation queue, so saving and recovery remain available. Reports stay in server memory; a server restart clears them. A new explicit read replaces the previous snapshot, while a transport failure leaves the previous dated result visibly unchanged. No report or read operation becomes a favorite, checkpoint, application receipt or successful mode switch.

Each explicit read first refreshes authentication and fetches current metadata. The client compares that metadata with the launch identity and cwd of the state already accepted by the UI. A new launch, changed target or disabled reader is displayed without starting collection. A following explicit click can read the accepted context. If metadata retrieval fails after authentication succeeds, the previous UI identity remains authoritative for this comparison, so a retry cannot bypass the new-context check. The disabled state keeps a metadata-refresh action so it can discover a newly enabled launch.

This implementation does not classify mixed instruction content as optional, enable personal-setting writes, attach to a desktop task, or supply a generic restart/refresh guarantee. The [compatibility matrix](compatibility.md) still governs platform and desktop support claims.
