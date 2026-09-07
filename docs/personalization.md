# Random appearances and useful memory

Agreed direction updated on 2026-09-06. The maintainer approved random discovery, performance-gated original creation, three candidates followed by one final choice, and optional build-card/X sharing. Unharness must be free with no recurring operator service expense; the user's own AI costs are separate. Prepared patterns and procedural drawing support the whole appearance flow locally, with AI-assisted authoring optional. The default must actually use random selection, rather than disguise preference profiling as randomness. The appearance system, optional creation skill, and memory bridge are not implemented. This does not change the Codex-first, macOS-and-Windows delivery order.

## Experience

An entity appears, the user discovers what is inside its equipment, and they can keep or name it. Setup does not require a taste questionnaire or memory access. Normal, UNSEAL, and TRUEFORM retain the same identity, with progressive release; useful equipment can also receive the supportive/resonating presentation described in [the visual direction](design.md).

The initial art direction remains pixel art, a machine hangar, a non-human luminous entity, and a dramatic divine reveal. Variation within this world comes from prepared forms, palettes, equipment, and effects. A build card can combine the discovered appearance with the exact configuration and recorded comparison evidence.

Original creation unlocks only when performance-based appearance-change conditions are met. Ordinary use retains the prepared/randomized appearance. A qualifying comparison makes a voluntary “Create this loadout's original form” action available; it never starts generation automatically.

## Default: prepared art and probabilistic assembly

Start with a small set of complete, reviewed entities and compatible variations. Each entity has a common anchor, pixel grid, palette roles, equipment attachment points, and the required release states. A local selector can choose a full set or assemble compatible body, shell, halo, and palette parts using weighted probabilities. Build a coherent library first; independent random pixels are not a substitute for art direction.

Sample an appearance on first creation or an explicit request for another one, then retain it. Reloading the app, switching modes, or changing models does not reroll the entity. The user can keep an appearance and optionally associate it with favorites/cards independently of configuration identity. Adopted original forms enter the reusable collection described below; reuse does not require generating them again.

Draw the seed locally, independently of personal memory, usernames, work content, and hidden preference inferences. Keep the seed, selection/renderer version, art-pack version, and resolved part IDs/parameters; a seed alone is insufficient after the library or algorithm changes. Preserve the selected assets when exact later reproduction requires them. Probability weights and compatibility rules belong to versioned content. Neither uncommon appearances nor random effects imply better measured performance.

This default runs locally without a model call or image-generation service. OS, display, and reduced-motion settings affect rendering and animation, not a hidden inference about which entity suits the user. Exact art counts, weights, and collection mechanics remain open design choices.

## Pixel art does not require an image model

| Method | How it works | Role in Unharness |
| --- | --- | --- |
| Prepared sprites and parts | PixiJS displays bundled PNG layers and animation frames according to a saved JSON recipe | Selected default asset route: predictable art quality and immediate local playback |
| Procedural drawing | Validated pixel grids or local shape/palette/seed rules produce textures and graphics for PixiJS | Local variation, particles, geometric cores, and new code-authored art without an image model |
| Optional image generation | An available image tool creates assets to a documented layout/state contract | An additional way to make custom artwork, not a runtime requirement |

Claude Code can author pixel data, a component recipe, or drawing code in its coding environment. A conventional renderer produces the pixels; no image model is needed for that path. A code-produced result still needs visual review, particularly for recognizable silhouettes and consistent animation. The optional skill should therefore describe a creation contract with multiple routes, not require a raster-generation provider for every user.

The maintainer selected [PixiJS for the GUI](design.md#selected-rendering-stack), accepting its additional dependencies. Use reviewed PNG sprites together with versioned JSON assembly/pixel data; detailed entities do not have to be authored entirely as text arrays. These are adopted implementation choices, not a completed appearance runtime. Aseprite or another pixel editor is optional for authoring bundled sprites and is not required by app users.

## Original creation unlocked by comparison evidence

The proposed flow is: compare loadouts → meet a declared performance condition → reveal the creation action → create and preview a candidate → keep the appearance with its evidence references. The visual can evolve the existing entity and its equipment, preserving its recognizable identity and random creative variation without taste profiling. Working labels such as “この装備の姿を作る” or “オリジナル形態を生成” are provisional.

The standard three-candidate route uses local composition/drawing rules and a saved seed. It must not require an AI call, new provider account, or image-generation charge. More elaborate authoring through the user's existing AI is optional and uses that user's own allowance. An original form means a locally created variant in this art system; it is not a promise of unlimited art variety or global uniqueness.

Eligibility belongs to the exact loadout version and comparison conditions. Normal, UNSEAL, TRUEFORM, and custom favorites can all qualify. Define the condition before evaluating results, using the [measurement contract](comparison-metrics.md):

- The candidate meets the task's required quality conditions.
- Comparable runs meet the predeclared observation/repetition requirements, and the fields needed for the claimed benefit are available. Missing or inconclusive evidence remains ineligible rather than becoming a win.
- The candidate meets a task-specific improvement rule, for example maintaining the required quality while reducing tokens per accepted task, or improving quality within the stated resource budget. Lower token use on failed work cannot qualify as an efficiency improvement.

Exact thresholds and repeat counts remain to be designed for the task types; do not invent a universal strength score or imply that unlocking art proves general model superiority. An eligibility record references the loadout, baseline, task/scorecard/rule versions, app/model conditions, and supporting run IDs. The UI explains the achieved condition beside the action. Before eligibility it can show a quiet progress/reason line; it does not offer the active original-creation button.

The shared local core checks the same eligibility when called by the GUI, CLI, or AI connection. An AI request to create an original form receives the same status and reason as the GUI. Recheck eligibility at invocation; creating from a changed configuration requires an applicable new result. This gate concerns bespoke creation, not selecting or rerolling prepared appearances.

Keep capability separate from achievement. After eligibility, offer the creation routes actually available in the user's environment, including a recipe/pixel-code route where supported. If no route is available, retain the achievement and explain how creation can become available. A click or explicit AI request starts creation; completing another comparison or enabling effects never does. A pending/failed job retains the previous appearance, and a repeat click must not start duplicate work.

Save generated artwork as a visual record associated with the exact tested configuration and its historical evidence. Later model/configuration changes do not erase that artwork or its history. They do require fresh evidence for a new performance claim or a new original creation under those changed conditions. Reuse obeys the current presentation-state filter below; ownership alone does not authorize a GOOD image during a confirmed BAD state. A benchmark correction can invalidate the evidence without deleting the art.

## Choosing a form and limiting remakes

The adopted rule is a single set of three candidates for one qualifying achievement, with one final adopted form. Preserve a candidate set across app restarts and resume partial completion rather than drawing a fresh set. Preview the candidates' required states, let the user defer the decision, then clearly indicate that adoption finalizes this achievement's selection. Candidate variety comes from random creative choices around the same recognizable entity, not inferred personal taste. No deadline or automatic selection is needed.

Technical failures and broken output may be retried or repaired without consuming a creative choice, using bounded retries and recording actual generation usage. Keep already valid candidates; technical repair should preserve their intended design. A technically valid but disliked result is a creative choice, not a transport failure. The candidate set has a declared output budget, and no call is made merely because a new result or eligibility notification arrived.

Once adopted, this achievement does not offer another creative draw or switch to an unselected candidate from that set. A later, distinct qualifying achievement may create another form while retaining the earlier form and its evidence. Selecting a different form already in the collection is allowed and does not reopen an earlier candidate set. Replaying the same result, renaming a favorite, or refreshing the UI does not create a new entitlement; the core owns achievement identity, creation state, and final selection across GUI and AI requests. This is a local product interaction rule, not a claim of unforgeable scarcity in an OSS application.

The adopted form leads into [build-card export and optional X sharing](build-cards.md). Neither posting nor connecting an X account is required to keep or use the form.

## Collection ownership and current presentation

The maintainer wants acquired original equipment to remain in a collection and be reusable, with the currently selectable images constrained by performance. The example was UNSEAL: when applicable evidence shows worse performance, only BAD images can be equipped for that state.

Keep three responsibilities distinct: the selected harness mode/configuration, the owned visual item, and the assessment that determines its allowed presentation. Selecting an appearance does not load the harness favorite that originally earned it. A collected item can be reused with compatible modes and presentation states while retaining its acquisition history.

| Applicable assessment | Active appearance policy |
| --- | --- |
| Favorable evidence | Allow compatible supportive/GOOD variants and ordinary neutral presentation |
| Confirmed adverse evidence | Allow BAD variants only; GOOD versions remain owned but unavailable for active display |
| Missing, inconclusive, stale, or incomparable evidence | Use neutral/unverified presentation; do not infer BAD or GOOD |

The preferred asset design gives each item neutral, GOOD, and BAD visual treatments, derived locally from the same identity wherever practical. The user can then select a collected body/equipment design and use its BAD treatment during adverse performance. If an imported/older item lacks the required treatment, show it as unavailable for that active state and use prepared artwork matching the assessment, including a BAD fallback for an adverse state. New model generation is not required just to express an adverse state.

Bind the assessment to the relevant app/model, selected loadout version, task/criteria scope, comparison basis, and evidence version. A bad UNSEAL result for one work context does not condemn every UNSEAL task or future model. Higher token use on a different or harder task is not enough to establish a regression. [Everyday observations and controlled replay](comparison-metrics.md#one-selected-mode-and-later-comparison) have different evidentiary strength.

The collection remains browsable, including historical GOOD artwork, while the active equipment selector applies the state restriction and explains why a variant cannot be used. The core evaluates that restriction for both GUI and AI requests. A changed assessment updates allowed presentation without deleting the item, changing the harness, reopening the three-candidate choice, or granting a new creation. Returning to a compatible state allows an existing item to be selected again.

BAD treatment must still show the actual release mode: visual degradation cannot make an applied UNSEAL configuration appear to be Normal. Keep the assessment text visible when effects are off. Collection previews and historical card exports identify their evidence context so displaying a past GOOD image does not claim current favorable performance.

## Optional creation skill

Ship a focused, user-facing creation skill alongside Unharness's AI connection when that workflow is implemented. This is a product capability, not a copy of the maintainer's development skills. It does not grant tools, credentials, or memory access.

1. The user selects the unlocked original-creation action or explicitly requests it through their AI. The shared core verifies eligibility and the active candidate/remake policy before dispatch. Existing jobs and candidate slots are resumed; finalized achievements do not silently start a new draw.
2. The AI uses an explicit brief or random creative choices and checks available tools. It does not automatically consult personal memories to guess taste. An explicit request to use specified preferences can opt into that separately.
3. It produces a validated recipe/pixel-data asset using the supported local renderer, or calls an available image tool and returns image assets. Standalone drawing code can be an authoring aid; imported appearances do not execute arbitrary generated scripts in the product.
4. Unharness checks the recipe schema or image format, dimensions, size, and expected states, and shows the allowed candidate previews before replacement. A failed or canceled creation retains the previous appearance and any completed candidate slots.
5. Save the chosen asset set, recipe/brief, versions, and final selection. Reuse them for animation and build-card export, applying the chosen remake policy to any later request.

Keep the same reference identity across states. Start with consistent state portraits and application-rendered effects; add separately layered sprites or frame sequences as their import becomes reliable. Status text, measured numbers, and proportional charts are always application-rendered. Raw conversations, work documents, and full memory stores are not creative inputs by default.

## Responsive generation and instant switching

Default assembly is local and immediate. An optional AI creation job can update the GUI as it progresses, while the current artwork remains usable. Reuse saved assets for mode transitions; a mode switch does not need to wait for a new image or spend image-generation quota each time.

Animation and comparison state remain independent. “Generation complete” means an asset is available, not that a mode was applied. Regenerating artwork does not change a loadout or its measured results. Effects off and reduced motion apply equally to generated and bundled artwork.

## Where memory helps

| Use | Useful inputs | Result |
| --- | --- | --- |
| Appearance continuity | The selected entity, its name, saved appearance recipe, and motion settings | The same recognizable companion returns; ordinary local state is sufficient |
| Personal quests | Recurring task types, common corrections, previously accepted work requirements | Suggested tasks with explicit starting conditions and versioned acceptance criteria |
| Personal evaluation | Stated priorities such as correctness, readability, brevity, or acceptable human effort | A reviewable scorecard fixed before the comparison begins |
| Contextual favorites | Recorded outcomes, user ratings, app/model/configuration versions, task type | “This loadout worked for similar work” with evidence and a re-test suggestion when stale |
| Memory as equipment | A selected optional memory source or a prepared memory summary | A comparison of fixed, omitted, or deliberately varied memory under recorded conditions |

An AI recollection that a setup “worked well” is a lead, not a substitute for experiment evidence. Unharness owns the exact local configuration and comparison records. It can give the user's AI a short summary and record references for future recall when that client's memory capabilities and the user's settings permit it; do not promise automatic cross-app memory synchronization.

Default artwork selection does not consume this work-memory profile. Store task/evaluation preferences separately from observed results, with source, scope, version/date, and whether the user stated or the AI inferred them. Let users inspect, correct, remove, or stop using the profile. A changed preference can create a new scoring version; it must not silently rescore or relabel an old winner. Appearance versions may be associated with favorites/cards, but do not participate in configuration identity or performance scoring.

## Keep personalization out of uncontrolled comparisons

Use memory to prepare the experience and the experiment. The experiment runner must then receive only its declared inputs. Do not silently inject the design brief, the conversation used to choose equipment, or the generation skill into candidate tasks.

For each comparison, record whether memory is fixed across candidates, omitted, or deliberately part of the varied equipment. Preserve the permitted input version when observable, and record read and future-write behavior. If a client cannot expose or control the relevant source, mark that part unknown and the comparison potentially confounded rather than claiming identical inputs or verified Zero.

Freeze task criteria and relevant memory inputs during the comparison. Avoid allowing the first trial's answers or ratings to enter a later trial through background memory updates. A fresh task alone does not prove memory isolation. Generation and optional judging usage belong to separate overhead records, not the candidate's task-token total.

The appearance skill is invoked only for a requested, eligible creation/revision, outside benchmark execution. In Codex, explicit-only invocation is available, but it does not by itself prove a skill is absent from discovery or already loaded context. Benchmark isolation must cover the selected source and fresh-task boundary. TRUEFORM must not regain disabled memories through a personalization helper. The minimal recovery/control connection remains separate from the optional appearance workflow.

## App capabilities and evidence

- The current Codex development session exposes an image-generation tool and produced the existing concept images. This is evidence for this session, not a guarantee for every Codex installation or account.
- [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills) provides explicit-only invocation via `allow_implicit_invocation: false` and describes distributing skills with optional MCP connections as plugins. Product packaging and GUI-to-AI dispatch still require implementation and verification.
- [OpenAI memory documentation](https://learn.chatgpt.com/docs/customization/memories) distinguishes ChatGPT web memory from local Codex memory, and describes separate controls for using memories and contributing future inputs. Do not assume the appearance skill can read a user's ChatGPT web memory from Codex.
- [Claude's image capability documentation](https://support.claude.com/en/articles/9002504-can-claude-produce-images) distinguishes image-model generation from visuals built with code. An external image tool is required only for the optional image-model route; prepared art, recipes, and procedural pixel drawing remain available without it.
- [OpenAI's pet documentation](https://learn.chatgpt.com/ja-JP/docs/pets) describes built-in and custom companions, a skill-assisted creation flow, activity states, and reduced motion. The installed desktop bundle also contains prebuilt sprite sheets. This is a useful interaction/rendering reference, not evidence that pets randomly assemble themselves or share Unharness's future asset format. Unharness's entity will visualize the selected harness and its observed state; pet-format interoperability is not currently planned or verified.

These are documented capabilities and design boundaries, not completed integration tests. Access to memory and generation must be checked on the actual app, OS, account, and session.

## Delivery boundary

Build the default around prepared artwork, weighted local selection, persisted identity, and mode-aware animation. Add procedural variety as supported asset paths mature, and unlock optional original creation once the comparison evidence and eligibility mechanism exist. Keep work-memory features focused on quest/scorecard suggestions and evidence-backed favorite recommendations. The detailed release scope remains open; no appearance runtime, global skill installation, memory import, provider setup, or image generation was added for this design proposal.
