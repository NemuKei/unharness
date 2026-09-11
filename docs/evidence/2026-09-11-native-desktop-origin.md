# Native installed-plugin task and recorded Desktop origin

Date: 2026-09-11. Environment: macOS 26.6.2 arm64, Codex desktop
26.903.61454 (build 8378), embedded Codex 0.153.4.

## Observed native sequence

The revised 0.0.2 plugin was installed from a persistent local marketplace.
Native MCP discovery identified `unharness@deltahelmlab-unharness`, connected
62 tools and supplied the actual plugin data directory. The former direct
MCP registration was removed after its exact command/arguments were checked;
it had shadowed the installed plugin. A separately normalized empty argument
array was restored through the native version-checked configuration editor.
The resulting user configuration preserved all other semantic settings.

The installed launcher saved its workspace binding and created an independent
recovery copy. Creation/integrity readiness does not yet qualify execution of
that particular copy after plugin removal. The native MCP service accepted
the reviewed installation-only retained settings, preserving registered source
bytes, and ended at Normal revision 19 without conflict or pending recovery.
It opened the installed workbench in the actual Codex in-app browser.

The app's task-creation tool then created one fresh local task in the exact
registered project with the current Normal preparation handoff. The task
returned `READY` without tool use. App task readback corroborated its local
Codex kind and project. The unmodified native recording used this tuple:

```json
{
  "originator": "codex_work_desktop",
  "source": "vscode",
  "cli_version": "0.153.4",
  "thread_source": "agent_created_thread"
}
```

The installed 0.0.2 reader initially rejected only the unfamiliar origin;
the selected instruction and automatic Skill patterns already matched. The
updated reader recognizes the exact observed tuple. It preserves the existing
task identity, project, preparation time, no-fork and native request-envelope
checks. Re-reading the same recording produced `matched-record`, a matching
initial request and no metric-format issues. The raw recording hash stayed
unchanged. This is recorded-input evidence, not complete live-runtime coverage
or cryptographic origin attestation.

## Validation and remaining scope

All four affected test files pass: 108 tests, no failures or skips. Positive
cases cover each reader; negative cases retain rejection of other versions,
CLI sources, unobserved routes, forks and changed request envelopes. Legacy
`Codex Desktop` recordings retain their earlier interpretation.

The origin fix is verified in source but is not present in the installed
0.0.2 payload. A subsequent immutable package must qualify the rest of the
native model-task journey. The user has also revised the target controls to
ordinary Skill disabled/manual/automatic states and whole-plugin enablement;
this origin change implements none of that new control contract.
