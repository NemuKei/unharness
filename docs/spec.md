# Product contract

The requirements below are agreed product targets. A separate [read-only probe slice](spec-probe.md) is being delivered first; the full product implementation is not yet present. See [status](status.md).

## Target and delivery order

| OS | Codex desktop | Claude Code desktop |
| --- | --- | --- |
| macOS | Phase 1 | Phase 2 |
| Windows | Phase 1 | Phase 2 |

Complete Phase 1 on both OSes before handing Claude Code its integration work. Codex performs the final review and finish across all four combinations. The target is the desktop experience using local work, not an assumption that a successful CLI run covers it. Windows native and WSL execution must be identified separately in evidence.

## One useful loop

Save the current configuration → try a different mode in a fresh task → compare work from recorded starting conditions → adjust the combination → save a favorite → restore or reuse a saved configuration.

The useful outcome can be adopting the new combination, retaining the previous one, or learning that the comparison was inconclusive.

## Cost boundary

Unharness is free to use and requires no paid API, hosted backend, or recurring operator service expense. The maintainer explicitly excluded the user's existing AI subscription and usage from this requirement. Comparisons and optional AI-assisted authoring can use that separately chosen environment; do not describe those model calls as consuming no quota.

The local web UI, deterministic configuration operations, local records, prepared/procedural artwork, three-candidate original forms, card rendering, and sharing preparation must work without an Unharness-funded model or server. Do not make a free-tier cloud quota, new paid provider account, or paid X integration a dependency of this base flow. User-owned optional AI authoring adds a creation route; the same feature must have a local route.

The [feasibility boundaries](feasibility.md) identify what is established, what needs desktop verification, and which guarantees the product cannot make.

## Modes

| Stable meaning | Display label | Managed behavior |
| --- | --- | --- |
| Normal | 通常装備 | Use the saved loadout. |
| Limited release | 限定解除 — UNSEAL | Make selected skills manual-only, retaining the other configured guidance. |
| Zero | 零式 — TRUEFORM | Stop automatic loading of the selected managed extra skills, procedures, steering hooks, and memory. |

The same policy names express the same user intent in both applications. Each integration must declare which controls implement that intent. Unsupported controls are not silently approximated by a weaker mode.

Task requirements, managed configuration, and execution permissions remain consistent. Show remaining elements, including the minimal connection used to manage modes. Written instructions and enforced execution controls are different kinds of conditions.

Existing files can mix task requirements and optional procedures. Initial registration identifies their roles. A changed source invalidates classifications that depend on its previous content.

## Save and favorites

- “今の設定をお気に入りに登録して” and the star button call the same save operation.
- A name can be omitted and assigned later. Saving does not require an extra naming interaction.
- Save the relevant configuration content or content-addressed payload, item states, provenance, and version. A favorite must not drift when its source files change.
- Preserve earlier favorite versions. A comparison record keeps referring to the exact version it used.
- Distinguish an automatic pre-change recovery snapshot from a user favorite and from an experiment result.
- Identify which configuration was saved when current runtime state differs from next-task settings. Do not guess the state of an unobservable running task.
- Loading identifies missing, changed, or incompatible items. Cross-OS path mapping and cross-app compatibility are explicit; an app-specific configuration is not silently translated into another app's behavior.
- Favorites remain local unless a separate explicit sharing operation is introduced. Sharing is outside the initial core scope.

## Switching and recovery

1. Inspect sources, selected scope, and what the integration can verify.
2. Generate a reviewable change set and a recovery point for the affected managed state.
3. Check that the inputs still match before applying the change.
4. Apply deterministic changes with a record sufficient to recover after interruption.
5. Read back the configuration and verify runtime state where observable.
6. Report the outcome, effective scope, and any restart or fresh-task requirement.

Serialize overlapping changes and handle repeated requests without applying them twice. A user request for a registered mode within its established scope should not trigger repetitive confirmation. New scope or materially different effects must be surfaced before the change.

Recovery preserves independent user edits and identifies conflicts. The recovery path remains usable when optional skills are stopped or the AI connection is lost. Recovery restores harness configuration, not the user's experiment outputs or source-code work.

## State is evidence, not animation

The UI and AI response distinguish:

- requested mode;
- changes planned or settings prepared;
- configuration readback result;
- runtime state verified for an identified task;
- pending restart or new task;
- partial failure, conflict, unsupported behavior, or unknown state.

Readback of a settings file does not prove that a running task loaded it. Effects follow actual state transitions. Their completion does not advance application state.

## Comparison

The initial comparison is between loadouts within the same application and model. Record the app and OS version, model and reasoning settings, request, starting files including relevant uncommitted work, available tools, permissions, and memory conditions.

Create separate work locations from the same starting state when the task changes files. Prevent shared memory or other local state from silently carrying information between runs. Record external conditions that cannot be frozen. Starting another worktree alone is not proof of complete isolation.

Compare outputs, diffs, elapsed time, available usage data, and the user's evaluation notes. Do not invent missing costs or infer a universal ranking from one run. Automated cross-application model benchmarking is not required for initial support of both apps.

Include numerical comparison alongside personal preference. Measure usage and effort to reach task-defined acceptance, retain failed attempts and retries, and keep objective checks separate from human or AI scorecards. The collection and scoring rules are in [comparison-metrics.md](comparison-metrics.md). Protocol field availability alone does not establish that complete desktop usage has been collected.

## Entry points and visuals

The local web interface and the AI connection use the same core. An AI request can update an already open web screen; the screen need not remain open for core operations to work.

Retain the chosen pixel-art hangar, progressively opening outer equipment, and the AI entity emerging in Zero. Use the divine reveal as a brief switching effect, then return to a readable idle view. Support effects off and reduced motion. Display preferences are separate from favorite content.

Equipment is neutral before evaluation and can be represented as supportive/resonating when the recorded comparison shows that it fits the user's task and priorities. Keep this visual assessment distinct from the three mode policies and the underlying measured results.

The adopted appearance flow is: qualifying comparison → voluntary original-creation action → three candidates → one final choice → local save → optional build-card/X handoff. Preserve the selected entity across modes and restarts. Technical retries do not consume a creative choice or replace valid candidates; after adoption, the same achievement does not allow another creative draw. A distinct later achievement can yield a new form while preserving the old one. See [appearance rules](personalization.md) and [sharing](build-cards.md). These are agreed product targets that depend on the comparison feature, not claims of implemented runtime behavior.

The primary sharing action copies the card PNG to the clipboard and opens X's composer with editable template text and the public OSS repository link. The author pastes the image and posts. Keep the image in the clipboard while passing text through the composer URL; provide image-save and separate open-X fallbacks. Verify the combined gesture in the supported browsers on macOS and Windows before claiming one-click preparation support. The actual public repository URL must be established before adding it to a working template.

## Acceptance for each supported OS × app combination

- A user can save a setup, run Normal → UNSEAL → TRUEFORM → Normal, and observe the managed changes and retained conditions.
- The same loop works through the web interface and natural-language requests, including recovery from Zero.
- A custom favorite can be loaded after another mode is applied, reproducing its saved managed state or reporting a concrete incompatibility.
- A comparison starts from recorded conditions and preserves separate outcomes.
- Interruption, external edits, duplicate requests, and a lost AI connection have verified recovery or conflict behavior.
- Effects off produces the same configuration and operation outcome.
- Evidence identifies OS, desktop and runtime versions, execution environment, and exact tested revision. A machine being available does not count as a passing test.

## Not part of the initial core

Public favorite marketplaces, cloud synchronization, worldwide rankings, automatic “best harness” selection, Linux support, and unverified equivalence between native Windows and WSL are not initial commitments.
