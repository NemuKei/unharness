# Contributing to Unharness

Unharness is being prepared for an open-source release. This repository contains product/design documentation, a read-only Codex inventory CLI, a diagnostic that changes only its own temporary source fixture, and a desktop-record observer with a persistent synthetic fixture. A shared fixture-only loadout store/service also supports registration, immutable favorites, checkpoints and recording association. The full application and live personal mode switching are still under development. Use Node.js 24+ and `node --test`; the diagnostics have no external package dependencies. See [the inventory guide](docs/codex-probe.md) and [source-control guide](docs/source-controls.md) for real-environment checks. The [desktop observation guide](docs/desktop-observation.md) covers fresh tasks and fixture-only recovery; [the loadout guide](docs/loadouts.md) covers the shared save/restore service.

## Presentation dependencies

PixiJS is selected for the planned GUI's artwork and effects, with HTML/CSS handling controls and readable state. Its exact version and transitive dependencies are recorded in `package.json` and `package-lock.json`. Install that dependency set for GUI development:

```text
npm ci --ignore-scripts
```

The GUI, bundler and browser entry point are not implemented yet, so there is no GUI start command. Existing diagnostics and `node --test` still run without this install. Keep PixiJS imports in the future browser presentation layer, and commit lockfile changes when updating dependencies. See [the rendering decision](docs/design.md#selected-rendering-stack).

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
