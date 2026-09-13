# 0.0.9 workbench and distribution

Date: 2026-09-14 (Japan). Scope: Apple Silicon Mac / Codex Desktop.

## Changes and retained boundaries

The introduction explains trying a selected harness before rewriting it and
shows screen/chat entrances for setup, settings review, mode switching and
original artwork. The workbench groups ordinary actions into mode, settings and
appearance pages. Mode selection, review, confirmation and actionable blocking
reasons remain adjacent. AI handoffs carry the displayed registered scope;
inspection remains available during a conflict without enabling source writes.

The [workbench contract](../spec-workbench-ux.md) describes the accepted behavior.
The [0.0.6 Mac qualification](2026-09-13-mac-codex-completion.md) retains the
mode/control/recovery baseline; [0.0.8](2026-09-13-awakening-motion.md) retains
native twelve-frame authoring and public artwork evidence. This release does
not add new model trials or qualify another platform or remote-plugin control.

## Immutable package

The [0.0.9 prerelease](https://github.com/NemuKei/unharness/releases/tag/v0.0.9)
contains 7,526 indexed files from clean source
`45a9a4c721ff03a002ab3e09dac451b7aa3923d4`.

- ZIP: `unharness-0.0.9-macos-arm64.zip`, 106,190,548 bytes.
- SHA-256: `d0e57db8b420e1c9e6891c9273f9137a0c330764200bae318f6c325be15dfdbd`.
- Distribution ID: `4c5fe814d629a869df5ccdd30cdeff0680f5fa6d2dc4eb57b452203ad2c8b89b`.

Assembly ran type/CSP and local production-build checks with the existing
lockfile. All 14 distribution, plugin-entry and recovery tests passed. An
independent macOS `ditto` extraction preserved every indexed byte and executable
flag; bundled Node passed `codesign --verify --deep --strict`.
The ZIP contains only the plugin, Japanese guide and marketplace wrapper, with
unique contained paths and no AppleDouble/resource metadata. Archive creation
uses `DITTONORSRC=1 ditto -c -k --keepParent --norsrc --noextattr --noacl --noqtn`;
the initial candidate containing `__MACOSX` metadata was rejected before upload.

Codex 0.153.4 installed the wrapper into a new isolated native home. The installed
distribution matched the same identity and all 7,526 files. Its bundled launcher
and Node enumerated 65 MCP tools and returned the expected unconfigured initial
state. This checks native installation and packaged MCP startup, not a new
model-driven onboarding or personal-profile update. The maintainer's personal
installation and saved settings were not changed by this distribution task.

The published asset digest, anonymously downloaded ZIP, checksum sidecar and
tag source all matched the values above. Earlier published versions remain
available as separate immutable releases.
