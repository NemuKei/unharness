# Contributing to Unharness

Unharness is being prepared for an open-source release. This repository currently contains product and design documentation. There is no application package to install or build yet.

## Work that is useful now

- Investigate actual Codex desktop loading and control behavior on macOS and Windows.
- Turn observed behavior into reproducible, sanitized compatibility evidence.
- Improve the save–try–compare–favorite–restore flow and its acceptance criteria.
- Refine documentation and the selected visual direction.

Read `AGENTS.md` for repository-wide rules. Use [the specification](docs/spec.md) for behavior, [compatibility](docs/compatibility.md) for evidence, and [delivery](docs/delivery.md) for phase boundaries. Claude Code reads the same rules through the one-line `CLAUDE.md` import.

## Keep changes reviewable

Use a focused development branch; the default branch-name prefix for new work is `codex/` unless the task specifies otherwise. Describe the concrete behavior, why it changes, the relevant validation, and any observed limits. Preserve the tested Codex baseline when adding Claude Code.

Documentation-only changes should preserve relative links and pass `git diff --check`. Update English and Japanese READMEs together when changing claims or availability. New runtime work must add its actual setup and test commands to the documentation rather than referring to commands that do not exist yet.

## Evidence and configuration data

Use synthetic configuration fixtures in automated tests. Record exact revisions, OSes, application/runtime versions, environment type, and observed outcomes for desktop tests. Keep personal backups, credentials, raw chats, and real user data out of Git. A test performed in a CLI or WSL environment must be identified as such.

## Release preparation

The license and public reporting channels have not been chosen yet. They must be established before inviting public use or accepting outside contributions under a specific license. Installation instructions, supported versions, and recovery procedures will be published after they are verified.
