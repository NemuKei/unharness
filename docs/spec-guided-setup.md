# AI-guided initial setup

**2026-09-10 selection revision:** [Official-plugin eligibility and inherited modes](spec-mode-inheritance.md) defines the target: TRUEFORM may retain selected verified official plugins, and UNSEAL inherits every retained Skill plus reviewed external/self-authored additions. The [v2 record/operation checks](evidence/2026-09-10-mode-inheritance-storage.md) now cover the common compiler, storage, explicit enrollment and offline recovery. Official-plugin eligibility/control, rendered v2 consultation and native qualification remain incomplete. Earlier v1 and browser evidence below retains its original scope. [The new plan](superpowers/plans/2026-09-10-official-plugin-mode-inheritance.md) tracks the remaining work.

Direction refined by the maintainer on 2026-09-09. Initial setup is a conversation with the user's chosen AI that produces reviewed, saved UNSEAL and TRUEFORM configurations while retaining the user's existing configuration as Normal. It is not an automatic claim that an AI has found an optimal harness. The core record/operation slice below is implemented; the existing native desktop qualification covers the earlier mode contract until the new journey is verified.

## Implemented record and operation boundary

The Codex adapter now supports reviewed release presets in the local core. An immutable `setup-review` contains the original Normal ID, registered scope, source revision, confirmed roles, model/reference provenance and two frozen target snapshots. Adopting it adds a separate `release-setup` version to the source state. Adoption changes no source file, original Normal, current prepared snapshot or task-preparation boundary. Ordinary release-mode plans with no explicit source override use the adopted version. An explicit source selection retains the earlier diagnostic mode contract. GUI copy must distinguish those conditions.

Prepared state and saved favorites carry their own optional setup version. Earlier favorites remain frozen and are not reinterpreted as a new TRUEFORM. A separately reviewed retained-settings change may adapt a preset's retained values while preserving its managed content and original model/reference provenance. This does not establish that the old assessment applies to a new model. Additive Skill enrollment now has the core, CLI, GUI and MCP implementation described below; its complete native journey and plugin integration remain in progress. Claude's existing adapter remains on its earlier contract until that integration is completed.

The built Codex workbench now provides **AIと初期設定を作る**, with a first-time TRUEFORM consultation choice and a current-configuration alternative. Opening it, selecting a route or copying the prompt does not submit an AI request or change files. The prompt carries bounded scope/Normal/preparation references and excludes local paths and source bodies. After adoption the button becomes **設定をAIに相談**, defaults to the current-configuration route and leaves the saved version in charge of ordinary mode buttons. Legacy source-selection checkboxes are hidden while a reviewed setup is active, so they cannot silently override those defaults. A separate **この設定で新しいタスクを始める** disclosure offers an explicit copy/paste handoff; it does not claim to create or verify a native task.

Built Chrome checks cover unchanged source files during both handoffs, clipboard success/failure, suspension during a source conflict, live refresh after MCP adoption and GUI preparation of the same manual-invocation TRUEFORM. Desktop (1440×1000) and narrow (390×844) screenshots were reviewed; explicit form labels and radio sizing were corrected during that review. Browser tooling used the repository's Playwright route because the Browser skill/plugin was not available in this task. This is browser/operation evidence, separate from the remaining native AI handoff qualification.

The following noninteractive CLI commands use the existing `sources <command> --json <object>` interface. They are intended for local integrations and diagnostics; normal users can use the GUI or their AI. Input has no environment-variable fallback, source-path overrides, force flag or implicit confirmation. Successful JSON goes to stdout with exit code 0. Sanitized error JSON goes to stderr: exit code 2 for invalid command/flag/argument count or an oversized argument, and exit code 1 for rejected JSON or a refused/failed operation. No interactive prompts are added.

| Command | Required JSON fields | Result and effect |
| --- | --- | --- |
| `setup` | `workspace` | Read the adopted proposal and separately prepared version; no writes |
| `review-setup` | `workspace`, `proposal` | Freeze a review of the two release configurations; do not adopt or apply it |
| `apply-setup` | `workspace`, `reviewId` | Adopt that reviewed version after the user's confirmation; do not switch modes |

For example, `node bin/unharness.mjs sources setup --json '{"workspace":"/absolute/registered/workspace"}'` reads one explicitly chosen local workspace. The setup commands reject unknown keys and duplicate JSON keys. The GUI's setup requests keep its 16 KiB input limit; AI requests retain their existing bounded transport. Oversize proposals are refused, never silently shortened. The corresponding MCP tools are `read_setup`, `review_setup` and `apply_setup`, using the established connection/request identity for writes. A review ID is not proof of the user's approval. Mode preparation remains `plan_mode` followed by `apply_plan` for a requested switch.

Setup adoption shares the source-operation lock and revision checks. A pending source transaction prevents adoption. Its record-only journal can be cancelled with the existing offline `sources recover` operation, including after state publication. Cancellation restores only the prior record state and preserves independent file edits. New native Mac task evidence and the full initial-setup journey are still required before claiming the new product flow qualified.

## The experience

### Normal preserves the existing configuration

The maintainer clarified that this review exists to design UNSEAL and TRUEFORM, not to redesign Normal. Normal remains the existing configuration saved before the review. Adopting the AI's release-mode proposals must not replace that Normal or promote a reviewed proposal into a new Normal. In particular, the temporary TRUEFORM used for consultation must never be captured as a replacement Normal.

Normal restoration therefore returns to the existing setup, while UNSEAL and TRUEFORM use the separately saved release configurations. A later independent settings edit or explicit new-Skill registration follows its own existing review/versioning contract; the initial consultation does not authorize changing Normal's managed content under the label of optimization.

### Recommend TRUEFORM for the first setup conversation

The maintainer proposed starting the initial AI-led review from TRUEFORM on 2026-09-09. Make **零式で初期設定を見直す** the recommended first-time route, while keeping a route that continues with the current configuration. This is a recommended user choice, not an automatic mode switch when a page opens.

Before that switch, the deterministic local core inventories the minimum required file/control metadata, saves the current managed configuration as Normal and confirms which sources are optional and controllable. An initial user directory does not prove authorship or removability. Do not change unclassified sources to manufacture a preliminary TRUEFORM.

Under the new rule, any optional automatic plugin retained for that first TRUEFORM also needs verified official provenance and an explicit selection. An empty optional baseline is allowed. Unknown origin must not be guessed to complete onboarding; unsupported or unqualified conditions keep the current-configuration consultation route available.

After the reviewed transition, start a fresh task and check the selected-source loading evidence available for that app. The AI then treats the saved original configuration as material to assess, not as instructions governing that new task. The Unharness management/control connection, memory, native continuity, permissions and required project/provider conditions remain retained. This creates a condition for reviewing optional instructions with less of their active influence; it is not a guarantee of unbiased reasoning or better performance.

If a fresh TRUEFORM cannot be qualified, explain the remaining unknown or unsupported condition and offer the current-configuration route; do not label a merely prepared or old task as a verified TRUEFORM consultation. Preserve the original Normal and any earlier versions when saving the reviewed setup. This first-time recommendation does not authorize automatic mode changes during later reviews.

The initial GUI offers **AIと初期設定を作る**. It shows a prompt for the selected application and connects it to Unharness's user-facing setup Skill. That Skill inventories the selected environment, asks one material question at a time about the user's work and ambiguous sources, and proposes configurations for UNSEAL and TRUEFORM with short reasons. Detailed customization belongs in that conversation. The ordinary GUI keeps mode switching central and places **設定をAIに相談** near the release modes, rather than expanding a large settings form.

The GUI can present a concise review of both proposals: the additional-instruction choice, automatic/manual Skill counts, retained external functionality and unresolved items. The user confirms source roles and configurations through the chosen AI conversation and the concrete local review/apply boundary. Unharness retains the saved existing Normal and saves the two release configurations through its deterministic local operations. Daily use then centers on the three modes; the consultation button reopens AI-assisted customization of the release modes. Recovery remains available outside the AI.

The existing local GUI route remains usable without a model call. AI guidance uses the user's chosen AI environment and allowance; it adds no paid API requirement, hosted backend or operator service. Prepared appearance generation and card export remain local and independent of this conversation.

### Model and official-harness review

Initial proposals use official guidance for the selected model together with the actual AI application's built-in behavior and the user's work. The model is established from available runtime information or explicit user input; the setup assistant must not silently substitute a newer model. When a model-specific official guide is unavailable, identify the broader official guidance being used and the missing evidence.

Save the target model, application/runtime version where available, official reference URLs and verification dates, and proposal reasons with the configuration version. A model or application change offers **新しいモデルで設定を見直す** through the same consultation entry point. Keep the previous configuration and comparison history while preparing a new version. Current performance claims remain unknown until applicable new evidence exists; artwork stays freely selectable. Neither a model announcement nor a newer official harness automatically rewrites the user's settings.

Official model-specific guidance is currently available from [OpenAI](https://developers.openai.com/api/docs/guides/latest-model) and [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices). These are sources for a task-specific proposal, not proof that the proposal is optimal or that old user rules are unnecessary.

### Passing the consultation to the user's AI

Prompt copying is the common fallback. Prefer a documented app handoff where it has been verified. Claude Desktop documents `claude://code/new` with a prefilled prompt and a confirmed project folder; the user still sends the prompt. See [its official deep-link contract](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link). This is distinct from the terminal-only `claude-cli://` route and from claiming that a task ran.

Codex provides [App Server task/input APIs](https://learn.chatgpt.com/docs/app-server), while the installed `codex app` command accepts a project path without a prompt flag. A programmatic Codex turn and a natural handoff into the user's existing desktop UI are different capabilities. Qualify the actual desktop route before offering it. The initial product must remain usable through prompt copying when a direct route is absent. No automatic cross-mode model dispatch is introduced by this setup flow.

## Mode meanings

| Source | UNSEAL | TRUEFORM |
| --- | --- | --- |
| Optional global AGENTS.md / CLAUDE.md | A saved choice of the versioned minimal guide or no additional instructions | No selected additional instructions |
| Selected plugins with verified official-marketplace provenance | Automatically inherit all reviewed TRUEFORM Skill selections; do not allow a UNSEAL-only removal | User chooses which verified plugins retain automatic use; selecting none is valid |
| Other optional external or self-authored Skills | May be explicitly added on top of the inherited set | Explicit invocation only for controlled enabled Skills; no optional automatic exception based solely on authorship or user assertion |

The maintainer explicitly selected **stop automatic selection while retaining explicit invocation** as the intended meaning of releasing an external Skill. Skill release in the new experience therefore means controlling automatic use, not removing the capability. A Skill already disabled in saved Normal stays disabled unless the user separately chooses to enable it. Normal restores its saved configuration.

The new rule derives `UNSEAL = TRUEFORM ∪ additional selections` in the shared service. Official provenance is separate from the self/external role: verify the host-operated directory, installed plugin identity, distribution and content version. Do not infer it from a marketplace tab, local catalog, file path, name or `pluginId` alone. A plugin selection expands only to reviewed, registered Skill identities; it does not enroll a whole plugin or disable its MCP/tools/hooks. Unverified eligibility and unsupported manual control remain explicit limitations.

The consultation first selects the TRUEFORM baseline, then discusses only UNSEAL additions. Present **零式から引き継ぐもの** separately from **限定解除で追加するもの**. Changing TRUEFORM creates a reviewed paired version and shows both impacts; it does not edit old favorites, Normal or prepared state. Normal is not required to be a superset. The required Unharness management exception below remains valid before official marketplace publication.

Project requirements, memory, native task continuity, execution permissions, managed/provider sources and the operation/recovery connection remain common conditions. The UI says **追加指示なし**, scoped to the selected optional global instruction source; it must not imply that all instructions in the AI have disappeared.

### Unharness is a retained management exception

The maintainer explicitly confirmed that TRUEFORM must retain the Unharness management Skill. Preserve the registered launch, status, mode-control and recovery connection in all modes, and show it among retained conditions. Identify it from the product's registered installation and exact source version; a file's name or its own text cannot declare itself exempt. Reject a release plan that disables the management Skill, its MCP registration or a containing plugin needed for these operations. This exception does not expand execution permissions, excuse unrelated Skills or prevent an explicitly requested uninstall through a separate reviewed operation.

The optional original-artwork Skill remains available for an explicit creation request. Its detailed guidance should not be loaded into ordinary benchmark tasks merely because it is bundled. Appearance creation and selection are independent of performance, as defined in [personalization.md](personalization.md).

### New Skills and later reviews

When a user creates a Skill through Unharness, the ordinary creation capability handles the content. Unharness then reviews the source role, adds a new saved Normal version and proposes its current-mode treatment. A newly authored standalone Skill uses its reviewed Normal configuration in Normal, may be proposed as a UNSEAL addition, and remains explicitly invocable in TRUEFORM. A plugin qualifies for TRUEFORM only through the separate official-origin verification and reviewed selection, not because its author or name is recognized. Preserve a previously disabled state unless separately enabled by the user.

Skills added elsewhere are discovered at the next startup, inventory or consultation, then presented as new/changed candidates. A Skill alone is not a background watcher. Do not enroll unknown authorship or silently rewrite old favorites. A new Skill or model creates a new configuration version whose performance must be assessed separately.

## Inventory and authorship

Inventory candidates are distinct from the currently registered set. The GUI names **AGENTS.md / CLAUDE.md** and **Skills** plainly and explains when it is showing only registered items. It can reveal newly discovered candidates without silently enrolling them.

An installation path or `user` scope does not prove self-authorship. The AI proposes classifications from available evidence; uncertain classifications remain uncertain until the user confirms them. Confirmed decisions are saved so subsequent inventory asks only about new or changed items. Source contents are data during this process, never instructions authorizing the assistant to execute them or expand the selected management scope.

User confirmation establishes a reviewed role, not official-directory provenance. The latter comes from the app adapter and is bound to the installed revision and frozen inventory. Private or project marketplaces, copies and locally changed packages must not acquire official eligibility through AI/user claims. If official provenance cannot be verified, exclude that item from new TRUEFORM automatic selections without silently changing its existing settings.

A plugin's Skills, tools and other functions must be distinguished. Some controls may affect a whole plugin instead of only automatic Skill selection. The inventory reports the actual supported granularity for the selected app/version. It must not claim that explicit invocation survives a control that disables the entire plugin, rewrite provider cache contents to simulate a missing control, or automatically remove functionality that the user has not selected. Unsupported automatic-use control remains visible and retained while the user and AI decide how to handle it.

## The setup Skill and deterministic boundary

The setup Skill is an Unharness product integration, separate from repository-development Skills. It provides a discussion and proposal contract for Codex and Claude Code. It does not copy personal development Skills into this repository, request a new provider key, apply configuration by editing files itself, or generate appearance candidates as part of inventory.

The local launcher selects the application, project and source roots. A setup handoff identifies that fixed context and its inventory version. The AI receives bounded source descriptions and supported operations; credentials, memory content, private backups and unrelated task histories are not default inventory inputs. Its output is a structured proposal referring to inventoried source IDs, confirmed/proposed roles, per-mode invocation choices and reasons. Paths supplied by a proposal cannot become new write targets.

Saving requires a current inventory and explicit user confirmation of the reviewed source roles and configurations. Stale or unsupported proposals return a concrete reason. Normal capture, mode preparation, scope changes, favorites and recovery remain in the local core with independent-edit checks. Subsequent ordinary mode switches use the saved versions and do not repeat the AI inventory conversation.

## Compatibility and implementation work

The new paired policy needs a distinct versioned proposal/record format. Keep the existing v1 independent-list reader and historical restore semantics; do not upgrade records by replacing their mode label. The [implementation plan](superpowers/plans/2026-09-10-official-plugin-mode-inheritance.md) adds frozen official provenance, derived inheritance, stale-inventory checks and an older-writer fence. Adoption remains record-only, and offline Normal recovery must not depend on a live marketplace lookup.

Existing v1 registrations, saved Normal versions, favorites and recovery journals must remain readable and recoverable. Changing the registered source set needs a reviewed migration that preserves earlier history and refuses unresolved transactions or independent edits. An old favorite must not silently become the new default TRUEFORM merely because both use the same display name. Mode/preset versions and the actual prepared configuration must remain distinguishable.

### Additive Skill enrollment

The core, CLI, authenticated HTTP and stdio MCP now support both enrollment versions. V2 newly registered Skills require a fresh inventory and paired-setup review; they never silently enter TRUEFORM or its inherited UNSEAL set. Rendered v2 enrollment and the full native journey still require verification.

Enrollment uses the launcher's existing application, project and source roots. Inventory identifies new candidates by their source identity; request data cannot supply a new path. `enrollmentSchemaVersion` identifies the applicable contract. V2 `review-enrollment` accepts a current discovery ID and a bounded list of source IDs, confirmed origins and reasons only. It refuses independent per-mode choices and caller-supplied official evidence. An adopted setup is required before another expansion. Legacy v1 requests still require automatic/manual choices for both modes. Changed or removed registered sources remain conflicts; this operation only adds new Skills. Unsupported or unknown sources remain visible and unregistered.

The review freezes an expanded registration, Normal and current snapshot. V1 also freezes two release presets; v2 keeps those future setup IDs null. The earlier Normal's managed content is copied exactly; only the newly confirmed Skills are appended. A prior retained-settings conflict must be resolved through its separate review. Adoption writes one active-registration pointer in the existing private state, under the existing profile lock and recovery journal. The original reservation, immutable registration and all earlier records remain unchanged. V2 adoption clears the current setup pointer and sets preparation-required, preserving the historical prepared-mode/setup references as the earlier condition. It writes no configuration file. `read_setup.enrollment` supplies the confirmed roles without carrying old automatic sets into the new scope.

Two requirements remain independent after v2 enrollment. A new inventory-based `review_setup`/`apply_setup` authorizes the new release definitions but leaves preparation-required. A reviewed mode/favorite/checkpoint preparation clears preparation-required but does not authorize a missing setup. New TRUEFORM/UNSEAL plans require the newly approved setup; Normal and historical restoration remain available without it. Current-source observation, current-favorite capture and replay preparation stay unavailable while preparation-required. Ordinary measurements may still be saved with no source association and the explicit preparation-required issue. New sources keep their current bytes until preparation, and the expanded snapshot plus v2 manifest continue to fence older writers.

Scope ancestry is additive, bounded by the existing 32-Skill limit, and validated from frozen registrations. Historical records are read with their own registration. Restoring an earlier favorite or checkpoint extends it with the new Skills' saved Normal values, retaining their explicit disabled state when present, and reports that extension before applying it. It does not reinterpret the favorite as the latest release preset. A new configuration has a distinct scope/snapshot identity; historical comparisons remain historical. An unfinished replay or appearance transaction blocks enrollment. Inactive histories and the appearance collection remain available across the scope change. Canceling an interrupted enrollment restores only its exact prior recording state and never rewrites an independent source edit.

The implementation sequence is: define and test versioned source-role/preset records and registration migration; expose bounded inventory/proposal operations; add the user-facing setup Skill and GUI handoff; implement the reviewed per-app controls; then qualify fresh desktop behavior and the complete initial/setup/review/recovery journey. Real personal-source enrollment still requires concrete role and target decisions. No additional source in the maintainer's environment has been enrolled by this design discussion.
