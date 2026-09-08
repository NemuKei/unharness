# Contributing to Unharness

Unharness is being prepared for an open-source release. This repository contains product/design documentation, a read-only Codex inventory CLI, a diagnostic that changes only its own temporary source fixture, and a desktop-record observer with a persistent synthetic fixture. A shared fixture-only loadout store/service also supports registration, immutable favorites, checkpoints and recording association. The full application and live personal mode switching are still under development. Use Node.js 24+ and install the locked dependencies with `npm ci --ignore-scripts` before the full `node --test` suite. The standalone diagnostics have no external package dependencies; user-source Skill policy transformations use pinned YAML. See [the inventory guide](docs/codex-probe.md) and [source-control guide](docs/source-controls.md) for real-environment checks. The [desktop observation guide](docs/desktop-observation.md) covers fresh tasks and fixture-only recovery; [the loadout guide](docs/loadouts.md) covers the shared save/restore service. The [registered user-source contract](docs/spec-user-sources.md) defines the separate preparation and recovery boundary.

## Presentation dependencies

The local fixture GUI uses React, TypeScript and Vite with PixiJS artwork/effects and HTML/CSS controls. Exact versions and transitive dependencies are recorded in `package.json` and `package-lock.json`. Build and start it with:

```text
npm ci --ignore-scripts
npm run check
npm run build
npm run gui
```

Open the printed loopback URL. `gui --demo` creates a fresh owned fixture/store; use the printed store/scope or structured resumeArgv to keep working with that environment. Existing diagnostics remain independent of frontend imports; the full test suite includes the locked YAML transform checks. Keep PixiJS imports in the browser presentation layer and commit lockfile changes when updating dependencies. See [GUI usage](docs/gui.md) and [the rendering decision](docs/design.md#selected-rendering-stack). `npm run check` covers TypeScript and Pixi's static shader/geometry helpers with dynamic code generation disabled. For GUI changes, run this check, the production build and real browser interaction checks in addition to affected Node tests; keep screenshots containing private paths/IDs outside Git.

After building on macOS, an optional browser regression checks repeated task-UUID handoffs through the actual workbench. Point it at an existing Playwright installation; no browser dependency is added to the application:

```sh
UNHARNESS_PLAYWRIGHT_MODULE="/absolute/path/to/playwright/index.mjs" \
UNHARNESS_BROWSER_EXECUTABLE="/absolute/path/to/browser-executable" \
node --test test/web-comparisons.test.mjs
```

The executable override is optional when Playwright already has a browser installed. Without the module path, this browser case is explicitly skipped while the HTTP/controller tests still run. It uses a temporary synthetic source profile and local GUI server.

## Work that is useful now

- Investigate actual Codex desktop loading and control behavior on macOS and Windows.
- Turn observed behavior into reproducible, sanitized compatibility evidence.
- Improve the save–try–compare–favorite–restore flow and its acceptance criteria.
- Refine documentation and the selected visual direction.

Read `AGENTS.md` for repository-wide rules. Use [the specification](docs/spec.md) for behavior, [compatibility](docs/compatibility.md) for evidence, and [delivery](docs/delivery.md) for phase boundaries. Claude Code reads the same rules through the one-line `CLAUDE.md` import.

## Keep changes reviewable

Use a focused development branch; the default branch-name prefix for new work is `codex/` unless the task specifies otherwise. Describe the concrete behavior, why it changes, the relevant validation, and any observed limits. Preserve the tested Codex baseline when adding Claude Code.

Documentation-only changes should preserve relative links and pass `git diff --check`. Update English and Japanese READMEs together when changing claims or availability. New runtime work must add its actual setup and test commands to the documentation rather than referring to commands that do not exist yet.

The current native Windows baseline uses shared bounded startup allowances in subprocess tests: five seconds for ordinary responses and three seconds for readiness-dependent timeout/oversize cleanup scenarios. Keep the 100 ms RPC timeout assertion and cleanup checks intact. The existing POSIX-FIFO case is skipped on Windows; that skip does not test Windows named pipes.

## Evidence and configuration data

Use synthetic configuration fixtures in automated tests. Record exact revisions, OSes, application/runtime versions, environment type, and observed outcomes for desktop tests. Keep personal backups, credentials, raw chats, and real user data out of Git. A test performed in a CLI or WSL environment must be identified as such.

## Release preparation

The license and public reporting channels have not been chosen yet. They must be established before inviting public use or accepting outside contributions under a specific license. Installation instructions, supported versions, and recovery procedures will be published after they are verified.
