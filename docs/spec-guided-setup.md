# AI-guided initial setup

**Current Mac scope (2026-09-11 onward):** v3 uses confirmed ordinary Skill
disabled/manual/automatic states and retains official plugins at Normal.
Individual remote-plugin OFF is deferred. The qualified path is recorded in
[the Mac completion evidence](evidence/2026-09-13-mac-codex-completion.md);
the earlier target and v1/v2 observations below retain their historical scope.

**Historical v2 revision (2026-09-10):** the [old v2 contract](spec-mode-inheritance-v2.md), [record checks](evidence/2026-09-10-mode-inheritance-storage.md) and [browser checks](evidence/2026-09-10-mode-inheritance-gui.md) retain their dated evidence. New Mac proposals use the [current v3 contract](spec-mode-inheritance.md), not the former optional-plugin selection baseline.

Direction refined by the maintainer on 2026-09-09. Initial setup is a conversation with the user's chosen AI that produces reviewed, saved UNSEAL and TRUEFORM configurations while retaining the user's existing configuration as Normal. It is not an automatic claim that an AI has found an optimal harness. The record/operation implementation and the [model-led saved-pair journey](evidence/2026-09-11-mac-codex-0.0.4.md) are qualified within their stated Mac scope; subsequent package updates do not retroactively change those model observations.

## Implemented record and operation boundary

The Codex adapter now supports reviewed release presets in the local core. An immutable `setup-review` contains the original Normal ID, registered scope, source revision, confirmed roles, model/reference provenance and two frozen target snapshots. Adopting it adds a separate `release-setup` version to the source state. Adoption changes no source file, original Normal, current prepared snapshot or task-preparation boundary. Ordinary release-mode plans with no explicit source override use the adopted version. An explicit source selection retains the earlier diagnostic mode contract. GUI copy must distinguish those conditions.

Prepared state and saved favorites carry their own optional setup version. Earlier favorites remain frozen and are not reinterpreted as a new TRUEFORM. A separately reviewed retained-settings change may adapt a preset's retained values while preserving its managed content and original model/reference provenance. This does not establish that the old assessment applies to a new model. Additive Skill and plugin enrollment use their versioned core, CLI, GUI and MCP contracts. Their dated evidence is linked below and in current status. Claude's existing adapter remains on its earlier contract pending its deferred native qualification.

The Codex workbench provides **初期設定をAIに頼む** after confirming that registration is absent, and **設定をAIと見直す** for a registered scope. The main action copies a bounded prompt without sending it or changing files. **保存した構成・相談方法を確認** retains the recommended first-time TRUEFORM consultation route and a current-configuration alternative; an existing saved setup defaults to the latter. The prompt carries bounded scope/Normal/preparation references and excludes local paths and source bodies. Conflicts and unknown state offer **状態の確認をAIに頼む** with a read-only inspection request, while writes remain blocked. Legacy source-selection checkboxes remain hidden while a reviewed setup is active. A separate **この設定で新しいタスクを始める** disclosure offers an explicit copy/paste handoff, not task creation or native verification. See [the function-focused workbench](spec-workbench-ux.md).

Built Chrome checks cover unchanged source files during both handoffs, clipboard success/failure, suspension during a source conflict, live refresh after MCP adoption and GUI preparation of the same manual-invocation TRUEFORM. Desktop (1440×1000) and narrow (390×844) screenshots were reviewed; explicit form labels and radio sizing were corrected during that review. Browser tooling used the repository's Playwright route because the Browser skill/plugin was not available in this task. Those are browser/operation observations; the later native AI handoff is recorded separately in the Mac qualification above.

The following noninteractive CLI commands use the existing `sources <command> --json <object>` interface. They are intended for local integrations and diagnostics; normal users can use the GUI or their AI. Input has no environment-variable fallback, source-path overrides, force flag or implicit confirmation. Successful JSON goes to stdout with exit code 0. Sanitized error JSON goes to stderr: exit code 2 for invalid command/flag/argument count or an oversized argument, and exit code 1 for rejected JSON or a refused/failed operation. No interactive prompts are added.

| Command | Required JSON fields | Result and effect |
| --- | --- | --- |
| `setup` | `workspace` | Read the adopted proposal and separately prepared version; no writes |
| `review-setup` | `workspace`, `proposal` | Freeze a review of the two release configurations; do not adopt or apply it |
| `apply-setup` | `workspace`, `reviewId` | Adopt that reviewed version after the user's confirmation; do not switch modes |

For example, `node bin/unharness.mjs sources setup --json '{"workspace":"/absolute/registered/workspace"}'` reads one explicitly chosen local workspace. The setup commands reject unknown keys and duplicate JSON keys. The GUI's setup requests keep its 16 KiB input limit; AI requests retain their existing bounded transport. Oversize proposals are refused, never silently shortened. The corresponding MCP tools are `read_setup`, `review_setup` and `apply_setup`, using the established connection/request identity for writes. A review ID is not proof of the user's approval. Mode preparation remains `plan_mode` followed by `apply_plan` for a requested switch.

Setup adoption shares the source-operation lock and revision checks. A pending source transaction prevents adoption. Its record-only journal can be cancelled with the existing offline `sources recover` operation, including after state publication. Cancellation restores only the prior record state and preserves independent file edits. Use the dated Mac qualification above for actual task and initial-setup evidence; this storage contract alone does not qualify another host or application version.

## The experience

### Normal preserves the existing configuration

The maintainer clarified that this review exists to design UNSEAL and TRUEFORM, not to redesign Normal. Normal remains the existing configuration saved before the review. Adopting the AI's release-mode proposals must not replace that Normal or promote a reviewed proposal into a new Normal. In particular, the temporary TRUEFORM used for consultation must never be captured as a replacement Normal.

Normal restoration therefore returns to the existing setup, while UNSEAL and TRUEFORM use the separately saved release configurations. A later independent settings edit or explicit new-Skill registration follows its own existing review/versioning contract; the initial consultation does not authorize changing Normal's managed content under the label of optimization.

### Recommend TRUEFORM for the first setup conversation

The maintainer proposed starting the initial AI-led review from TRUEFORM on 2026-09-09. Make **零式で初期設定を見直す** the recommended first-time route, while keeping a route that continues with the current configuration. This is a recommended user choice, not an automatic mode switch when a page opens.

Before that switch, the deterministic local core inventories the minimum required file/control metadata, saves the current managed configuration as Normal and confirms which sources are optional and controllable. An initial user directory does not prove authorship or removability. Do not change unclassified sources to manufacture a preliminary TRUEFORM.

Under the current Mac rule, the first TRUEFORM explicitly assigns each confirmed ordinary Skill disabled or manual and keeps every registered plugin at Normal. It does not require selecting an optional automatic-plugin subset. Unknown roles or unavailable controls keep the current-configuration consultation route available; they are not guessed to complete onboarding.

With no saved setup or enrollment context, review an explicit temporary v3 pair: the chosen disabled/manual ordinary Skill states, all registered plugins retained at Normal, and identical inherited UNSEAL with no upward additions or additional instructions. Explain that the two definitions initially have identical contents. Adopt the reviewed pair through ordinary setup operations, then prepare TRUEFORM separately. This is an ordinary saved version even if consultation stops; do not recapture Normal. An existing setup is inspected and retained instead of overwritten by this temporary pair. V1/v2 are identified as older rules and need a separately reviewed current v3 pair before claiming the new Mac policy; their original records remain intact. `setupId=null` plus enrollment context means an expanded-scope review, not initial setup. Current proposal roles supersede the earlier roles in enrollment history.

After the reviewed transition, start a fresh task and let its first short response finish. The current Codex observer requires the first recorded turn's completion, so that initial response cannot qualify itself. From the GUI or original management task, observe that task's actual ID and verify its scope/snapshot/preparation boundary. Continue consultation in the same task's next turn; another task cannot reuse that evidence. The AI then treats the saved original configuration as material to assess, not as instructions governing that new task. The Unharness management/control connection, memory, native continuity, permissions and required project/provider conditions remain retained. This creates a condition for reviewing optional instructions with less of their active influence; it is not a guarantee of unbiased reasoning or better performance.

If a fresh TRUEFORM cannot be qualified, explain the remaining unknown or unsupported condition and offer the current-configuration route; do not label a merely prepared or old task as a verified TRUEFORM consultation. Preserve the original Normal and any earlier versions when saving the reviewed setup. This first-time recommendation does not authorize automatic mode changes during later reviews.

The initial GUI offers **初期設定をAIに頼む** in Settings after confirming that registration is missing. It copies the selected application's prompt and connects it to Unharness's setup Skill. That Skill inventories the selected environment, asks material questions about work and ambiguous sources, and proposes UNSEAL and TRUEFORM with short reasons. Registered scopes use **設定をAIと見直す**. Detailed customization remains in that conversation or the explicit local editor; daily mode selection, change summary and confirmation stay together. A blocked mode has a nearby route to settings or state/recovery inspection.

The GUI can present a concise review of both proposals: the additional-instruction choice, disabled/manual/automatic ordinary Skill counts, retained plugin functionality and unresolved items. The user confirms source roles and configurations through the chosen AI conversation and the concrete local review/apply boundary. Unharness retains the saved existing Normal and saves the two release configurations through its deterministic local operations. Daily use then centers on the three modes; the consultation button reopens AI-assisted customization of the release modes. Recovery remains available outside the AI.

The existing local GUI route remains usable without a model call. AI guidance uses the user's chosen AI environment and allowance; it adds no paid API requirement, hosted backend or operator service. Prepared appearance generation and card export remain local and independent of this conversation.

### Model and official-harness review

Initial proposals use official guidance for the selected model together with the actual AI application's built-in behavior and the user's work. The model is established from available runtime information or explicit user input; the setup assistant must not silently substitute a newer model. When a model-specific official guide is unavailable, identify the broader official guidance being used and the missing evidence.

Save the target model, application/runtime version where available, official reference URLs and verification dates, and proposal reasons with the configuration version. A model or application change offers **新しいモデルで設定を見直す** through the same consultation entry point. Keep the previous configuration and comparison history while preparing a new version. Current performance claims remain unknown until applicable new evidence exists; artwork stays freely selectable. Neither a model announcement nor a newer official harness automatically rewrites the user's settings.

Official model-specific guidance is currently available from [OpenAI](https://developers.openai.com/api/docs/guides/latest-model) and [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices). These are sources for a task-specific proposal, not proof that the proposal is optimal or that old user rules are unnecessary.

For GPT-6 Astra, the setup Skill also points to the official
[skills and prompting article dated 2026-09-11](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra).
The setup AI retrieves the relevant sources during consultation and stores its
actual reference basis. This is not a background feed or an automatic optimizer.
Use the [model-reference procedure](../skills/unharness-setup/references/model-guidance.md)
to keep model-specific advice, source-control authority and measured outcomes separate.

### Passing the consultation to the user's AI

Prompt copying is the common fallback. Prefer a documented app handoff where it has been verified. Claude Desktop documents `claude://code/new` with a prefilled prompt and a confirmed project folder; the user still sends the prompt. See [its official deep-link contract](https://support.claude.com/en/articles/14729294-open-claude-desktop-with-a-link). This is distinct from the terminal-only `claude-cli://` route and from claiming that a task ran.

Codex provides [App Server task/input APIs](https://learn.chatgpt.com/docs/app-server), while the installed `codex app` command accepts a project path without a prompt flag. A programmatic Codex turn and a natural handoff into the user's existing desktop UI are different capabilities. Qualify the actual desktop route before offering it. The initial product must remain usable through prompt copying when a direct route is absent. No automatic cross-mode model dispatch is introduced by this setup flow.

## Mode meanings

| Source | UNSEAL | TRUEFORM |
| --- | --- | --- |
| Optional global AGENTS.md / CLAUDE.md | A saved choice of the versioned minimal guide or no additional instructions | No selected additional instructions |
| Registered plugins | Inherit the retained Normal state; no UNSEAL-only plugin activation | Retain all registered plugins at Normal; individual remote OFF is unavailable in this Mac scope |
| Registered optional ordinary Skills | Inherit TRUEFORM and elevate selected states to manual or automatic | Explicitly assign disabled or manual to every registered Skill |

The current v3 rule distinguishes disabling host selection from retaining explicit invocation. Neither deletes the Skill file or changes filesystem permissions. A Skill disabled in saved Normal is enabled only through an explicit reviewed state choice. Normal restores its saved configuration.

The shared service derives UNSEAL from TRUEFORM using the ordered ordinary Skill states `disabled < manual < automatic`. Plugin identity, official provenance, optional role and change capability are separate facts. The current Mac release retains plugin behavior at Normal; an individual Skill's manual setting must not be described as disabling its containing plugin. Unverified roles and unsupported controls remain visible.

The consultation first selects the TRUEFORM baseline, then discusses only UNSEAL additions. Present **零式から引き継ぐもの** separately from **限定解除で追加するもの**. Changing TRUEFORM creates a reviewed paired version and shows both impacts; it does not edit old favorites, Normal or prepared state. Normal is not required to be a superset. The required Unharness management exception below remains valid before official marketplace publication.

Project requirements, memory, native task continuity, execution permissions, managed/provider sources and the operation/recovery connection remain common conditions. The UI says **追加指示なし**, scoped to the selected optional global instruction source; it must not imply that all instructions in the AI have disappeared.

### Unharness is a retained management exception

The maintainer explicitly confirmed that TRUEFORM must retain the Unharness management Skill. Preserve the registered launch, status, mode-control and recovery connection in all modes, and show it among retained conditions. Identify it from the product's registered installation and exact source version; a file's name or its own text cannot declare itself exempt. Reject a release plan that disables the management Skill, its MCP registration or a containing plugin needed for these operations. This exception does not expand execution permissions, excuse unrelated Skills or prevent an explicitly requested uninstall through a separate reviewed operation.

The optional original-artwork Skill remains available for an explicit creation request. Its detailed guidance should not be loaded into ordinary benchmark tasks merely because it is bundled. Appearance creation and selection are independent of performance, as defined in [personalization.md](personalization.md).

### New Skills and later reviews

When a user creates a Skill through Unharness, the ordinary creation capability handles the content. Unharness then reviews the source role, adds a new saved Normal version and proposes its current-mode treatment. A newly authored standalone Skill keeps its reviewed Normal configuration in Normal, receives an explicit disabled/manual TRUEFORM state, and may be elevated in UNSEAL. A newly registered plugin retains Normal in both release modes; its role, origin and control capability still require separate checks. Preserve a previously disabled state unless separately enabled by the user.

Skills added elsewhere are discovered at the next startup, inventory or consultation, then presented as new/changed candidates. A Skill alone is not a background watcher. Do not enroll unknown authorship or silently rewrite old favorites. A new Skill or model creates a new configuration version whose performance must be assessed separately.

## Inventory and authorship

Inventory candidates are distinct from the currently registered set. The GUI names **AGENTS.md / CLAUDE.md** and **Skills** plainly and explains when it is showing only registered items. It can reveal newly discovered candidates without silently enrolling them.

An installation path or `user` scope does not prove self-authorship. The AI proposes classifications from available evidence; uncertain classifications remain uncertain until the user confirms them. Confirmed decisions are saved so subsequent inventory asks only about new or changed items. Source contents are data during this process, never instructions authorizing the assistant to execute them or expand the selected management scope.

User confirmation establishes a reviewed role, not official-directory provenance. The latter comes from the app adapter and is bound to the installed revision and frozen inventory. Private or project marketplaces, copies and locally changed packages must not acquire official eligibility through AI/user claims. Unverified provenance is not permission to enroll or alter that item. Retain existing settings and follow the current registration contract.

A plugin's Skills, tools and other functions must be distinguished. Some controls may affect a whole plugin instead of only automatic Skill selection. The inventory reports the actual supported granularity for the selected app/version. It must not claim that explicit invocation survives a control that disables the entire plugin, rewrite provider cache contents to simulate a missing control, or automatically remove functionality that the user has not selected. Unsupported automatic-use control remains visible and retained while the user and AI decide how to handle it.

## The setup Skill and deterministic boundary

The setup Skill is an Unharness product integration, separate from repository-development Skills. It provides a discussion and proposal contract for Codex and Claude Code. It does not copy personal development Skills into this repository, request a new provider key, apply configuration by editing files itself, or generate appearance candidates as part of inventory.

The local launcher selects the application, project and source roots. A setup handoff identifies that fixed context and its inventory version. The AI receives bounded source descriptions and supported operations; credentials, memory content, private backups and unrelated task histories are not default inventory inputs. Its output is a structured proposal referring to inventoried source IDs, confirmed/proposed roles, per-mode invocation choices and reasons. Paths supplied by a proposal cannot become new write targets.

Saving requires a current inventory and explicit user confirmation of the reviewed source roles and configurations. Stale or unsupported proposals return a concrete reason. Normal capture, mode preparation, scope changes, favorites and recovery remain in the local core with independent-edit checks. Subsequent ordinary mode switches use the saved versions and do not repeat the AI inventory conversation.

## Compatibility and implementation work

The paired policy has versioned v1/v2/v3 proposal and record formats. Keep historical readers and restore semantics; do not upgrade records by replacing their mode label. The [v3 contract](spec-mode-inheritance.md) defines the current compiler, provenance, stale-inventory checks and older-writer fence; the September 10 plan remains earlier implementation history. Adoption remains record-only, and offline Normal recovery must not depend on a live marketplace lookup.

Existing v1 registrations, saved Normal versions, favorites and recovery journals must remain readable and recoverable. Changing the registered source set needs a reviewed migration that preserves earlier history and refuses unresolved transactions or independent edits. An old favorite must not silently become the new default TRUEFORM merely because both use the same display name. Mode/preset versions and the actual prepared configuration must remain distinguishable.

### Additive Skill enrollment

The core, CLI, authenticated HTTP, stdio MCP and built local workbench now support both enrollment versions. V2 newly registered Skills require a fresh inventory and paired-setup review; they never silently enter TRUEFORM or its inherited UNSEAL set. Rendered checks use owned synthetic profiles. Native/model evidence applies only to the dated flows in the Mac qualification, not every possible future enrollment.

Enrollment uses the launcher's existing application, project and source roots. Inventory identifies new candidates by their source identity; request data cannot supply a new path. `enrollmentSchemaVersion` identifies the applicable contract. V2 `review-enrollment` accepts a current discovery ID and a bounded list of source IDs, confirmed origins and reasons only. It refuses independent per-mode choices and caller-supplied official evidence. An adopted setup is required before another expansion. Legacy v1 requests still require automatic/manual choices for both modes. Changed or removed registered sources remain conflicts; this operation only adds new Skills. Unsupported or unknown sources remain visible and unregistered.

The review freezes an expanded registration, Normal and current snapshot. V1 also freezes two release presets; v2 keeps those future setup IDs null. The earlier Normal's managed content is copied exactly; only the newly confirmed Skills are appended. A prior retained-settings conflict must be resolved through its separate review. Adoption writes one active-registration pointer in the existing private state, under the existing profile lock and recovery journal. The original reservation, immutable registration and all earlier records remain unchanged. V2 adoption clears the current setup pointer and sets preparation-required, preserving the historical prepared-mode/setup references as the earlier condition. It writes no configuration file. `read_setup.enrollment` supplies the confirmed roles without carrying old automatic sets into the new scope.

Two requirements remain independent after v2 enrollment. A new inventory-based `review_setup`/`apply_setup` authorizes the new release definitions but leaves preparation-required. A reviewed mode/favorite/checkpoint preparation clears preparation-required but does not authorize a missing setup. New TRUEFORM/UNSEAL plans require the newly approved setup; Normal and historical restoration remain available without it. Current-source observation, current-favorite capture and replay preparation stay unavailable while preparation-required. Ordinary measurements may still be saved with no source association and the explicit preparation-required issue. New sources keep their current bytes until preparation, and the expanded snapshot plus v2 manifest continue to fence older writers.

Scope ancestry is additive, bounded by the existing 32-Skill limit, and validated from frozen registrations. Historical records are read with their own registration. Restoring an earlier favorite or checkpoint extends it with the new Skills' saved Normal values, retaining their explicit disabled state when present, and reports that extension before applying it. It does not reinterpret the favorite as the latest release preset. A new configuration has a distinct scope/snapshot identity; historical comparisons remain historical. An unfinished replay or appearance transaction blocks enrollment. Inactive histories and the appearance collection remain available across the scope change. Canceling an interrupted enrollment restores only its exact prior recording state and never rewrites an independent source edit.

The implementation and evidence are linked from current status. Further personal-source enrollment still requires concrete role and target decisions; reading this document does not authorize adding sources or changing the registered scope.
