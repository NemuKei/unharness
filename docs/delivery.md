# Delivery and AI handoff

## Agreed sequence

| Phase | Implementation and validation owner | Target | Completion evidence |
| --- | --- | --- | --- |
| 1 | Codex | Codex desktop on macOS and Windows | The shared core experience meets the specification on both OSes |
| 2 | Claude Code | Claude Code desktop on macOS and Windows | Its adapter meets the same contract and preserves the Codex baseline |
| 3 | Codex | Integration review and final finish | All four combinations, recovery behavior, UX, and documentation are reconciled |

The maintainer has both operating systems and Claude Code desktop available for verification. Actual machine access, app versions, and test results are established at execution time. The handoff is future planned work; no Claude Code implementation task has been dispatched yet.

## Phase 1: establish the Codex baseline

Start with a read-only probe of desktop configuration sources, supported controls, application scope, and evidence available after a fresh task. Keep the user's real setup unchanged during inventory.

Then implement the smallest complete save → switch → fresh comparison → favorite → restore loop, including UNSEAL and TRUEFORM. Build macOS and Windows handling into the filesystem and process boundary from the start. Verify the web and AI entry points and effects off against the same core outcomes.

Codex is ready to hand off only after the Phase 1 acceptance criteria in [the specification](spec.md) pass on both OSes and the tested revision, evidence, known limitations, and relevant data contracts are recorded. If a required desktop control is unavailable, revisit the integration approach instead of renaming a partial result as completed Zero support.

## What Claude Code receives

The same repository and a concrete tested source revision, plus:

- Product and mode contracts, accepted names, and the selected visual assets.
- The application-adapter boundary, favorite schema version, operation-state meaning, and recovery contract.
- A small synthetic fixture set and shared acceptance scenarios.
- Exact build/test instructions that exist by then, Codex desktop evidence from both OSes, and known limitations.
- The bounded task: implement and verify the Claude Code desktop adapter on both OSes while preserving the shared behavior and existing Codex support.

Claude Code should inspect its own desktop environment and current primary documentation. It must identify all instruction, skill, hook, memory, and MCP sources that affect the chosen scope. A needed shared-contract change should be documented with its Codex impact and checked against the baseline.

Use a separate development branch for the handoff and keep the source revision explicit. The final integration mechanism can be selected when the repository has a remote; there is no need to require a public repository for development handoff.

## What returns to Codex

- The completed change revision and a concise account of behavior changed.
- macOS and Windows Claude Code desktop evidence using the common record format.
- Shared-contract or migration changes, if any, with their motivation.
- Codex regression results, unsupported cases, and remaining review questions.
- Updated usage, compatibility, recovery, and AI-command documentation.

## Final review and finish

Codex reviews the actual changes and evidence, verifies that the common core remains coherent, and runs the relevant regression checks. Reconcile the four OS × app combinations rather than treating one application's successful run as proof for the other.

Review the first-user journey through save, trial, comparison, favorite, and recovery; ensure effects and state labels remain honest. Reconcile English and Japanese README content and the actual install and recovery instructions. Confirm the license, reporting channels, and packaged assets before a public release.

Implementation, verification, and review are authorized work within the dedicated repository. Repository creation, code completion, and public release are distinct milestones; a local bootstrap is not a published release.
