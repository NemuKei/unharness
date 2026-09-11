# Source states v3 — Mac qualification in progress

Date: 2026-09-11. This development change implements the adopted
[ordinary Skill states and whole-plugin control contract](../spec-mode-inheritance.md).
The next immutable package is **0.0.3**. The published 0.0.1 archive and the
previous 0.0.2 installation remain separate artifacts. Real v3 installation,
personal plugin preparation and the remaining model-led journey are pending.

The final development regression reports **1,314 tests: 1,244 passed,
zero failed and 70 explicit environment-dependent skips**. All nine selected
built Chrome cases pass with no skips, including old enrollment/inheritance,
v3 paired editing, plugin registration, lost replies and input/runtime
observation display. Type/CSP checks, local/public builds, relative Markdown
links and both vendored dependency byte checks pass. These checks precede
the new real-profile installation.

## Verified native read-only boundary

The actual Mac environment reports macOS 26.6.2 arm64, desktop app
26.903.61454 build 8378 and embedded Codex 0.153.4. The native read-only
collector qualified the installed `superpowers@openai-curated-remote` 6.3.0:

- Native installation, CLI local installation and global directory identity
  agree on the exact plugin/remote ID and version.
- All 14 remote Skill Markdown bodies match the corresponding local hashes.
- The local package fingerprint includes 73 regular files. Two stable captures
  retain canonical location, persistent directory identity and content hashes.
- The selected enabled value comes only from the base user configuration.
  Profile, project, managed, required and unsupported sources are refused.
- Feature metadata reports 14 Skills, zero MCP servers, hooks, apps and app
  templates. Scheduled tasks are `null`, retained as unknown.
- The original selected configuration bytes and metadata did not change.

This binds the provider's listing to this installation and local content. The
local fingerprint is not an upstream package authenticity signature. Ordinary
switching uses the frozen evidence and a local dependency recheck; it does not
perform another directory lookup. Updated, missing or replaced contents require
a new review. Provider packages never enter the writable snapshot paths.

The separate native editor changes only selected `plugins.<id>.enabled=false`
in a newly owned temporary profile. Seven actual 0.153.4 profile cases cover
true and absent flags, absent plugin/root tables, CRLF, final-newline absence,
and retained numeric/date values. Synthetic tests cover unsafe integers,
unexpected versions, comments, unrelated fields and refused writes. These
editor checks do not establish real plugin stopping.

## Save, restore and interrupted publication

Plugin enrollment is a record-only successor scope using
`registration-controls-v3`. It preserves prior Normal, prepared files,
favorites, observations and artwork. The v3 writer fence is published before
state; cancelling its journal restores state before the manifest. The actual
preceding writer is tested for refusal. Ordinary Skill enrollment and legacy
directory reattestation preserve the v3 contract.

Owned-profile checks combine ordinary disabled/manual/automatic states with
plugin whole-OFF/Normal, including Normal-disabled and absent enabled flags.
Older favorites retain their historical selected scope; later plugins use
their registered Normal. Typed offline composition preserves current retained
settings. Normal/favorite/checkpoint recovery succeeds after both the native
executable and plugin package are removed.

Forward release preparation rechecks native installation and package identity
after its durable journal, after staging and before completion, and rechecks
package bytes before individual publication. Package changes at journal,
staging, first-write and before-completion boundaries stop completion.
Independent Node-only recovery restores configuration and reports changed
read-only plugin dependencies without replacing their new contents.

## Task-record evidence and its limit

The actual previously completed native Normal task contains the 14 Superpowers
entries in `world_state.host_skills`. It has no per-plugin enabled/MCP/hook/app
or scheduled-task runtime state. Boolean plugin/app instruction fields do not
prove those states.

New plugin scopes therefore use observation schema 3. Each plugin records
whether the initial Skill catalog was available, its matching count, identity
conflicts and input status. Whole-plugin runtime status remains unknown. A
disabled plugin whose Skill appears is a mismatch. Matching Skill inputs do
not produce a complete mode match, a matching ordinary-run association or a
qualified replay/performance aggregate. Legacy observations retain their
original schema and meaning.

The local GUI, ordinary-run review and replay review display the input coverage
separately from unobserved runtime components. This is a limit of the qualified
0.153.4 recording surface, not evidence that the whole plugin stopped.

## Shared entry points

Local CLI, MCP and HTTP call the same enrollment/setup/plan services. Strict
inputs accept selected IDs and confirmed optional roles; callers cannot supply
package paths, config keys, origin evidence or control capability. The local
GUI separates ordinary Skills from plugin effects, reviews both definitions,
saves them and then prepares the selected mode separately. Lost enrollment
responses retain their receipt and do not cause an automatic second write.

The public HTTPS bridge still exposes only its existing enumerated mode and
artwork operations. It cannot enroll sources, modify setup scope or read
private dependency/configuration bodies. Public protocol v2 is separate from
the v3 source-state record format.
