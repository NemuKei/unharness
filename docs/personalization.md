# Personal appearance and useful memory

Design proposal recorded on 2026-09-06. The maintainer supported connecting personal quests, equipment comparisons, and build cards, and suggested that each user's own AI generate an original appearance using their environment and preferences. The generation skill, memory bridge, and asset pipeline described here are not implemented. This does not change the Codex-first, macOS-and-Windows delivery order.

## Experience

“Create an Unharness appearance that fits me” should let the user's existing AI help design a recognizable entity and its equipment. Normal, UNSEAL, and TRUEFORM retain the same identity, with progressive release; useful equipment can also receive the supportive/resonating presentation described in [the visual direction](design.md).

For the current concept, the brief would include pixel art, a machine hangar, a non-human luminous entity, and a dramatic divine reveal. Another user can choose a different visual world without changing what a mode means. A build card can combine that personal artwork with the exact configuration and its recorded comparison evidence.

## Optional generation skill

Ship a focused, user-facing generation skill alongside Unharness's AI connection. This is a product capability, not a copy of the maintainer's development skills. It provides a workflow and an output contract; it does not provide an image model, credentials, or access to otherwise unavailable memories.

The intended flow is:

1. The user asks their AI to create or revise the appearance, or opens the corresponding GUI action.
2. The AI assembles an editable brief from the current request, the local appearance profile, and relevant memories it can already access within the user's selected scope. Unknown preferences remain unspecified; inferred preferences are suggestions.
3. The workflow checks available image-generation tools and uses the user's configured generator. If none is available, it can prepare the brief and use bundled/imported artwork until generation is available.
4. The generator returns candidate assets. Unharness checks file type, dimensions, size, and expected states, and shows a preview before replacing the active asset set. A failed or canceled generation retains the previous appearance.
5. The chosen asset set and its brief are saved with versions. The GUI uses them for local animation and build-card export.

The brief contains only useful design inputs: theme, palette, entity motif, equipment motif, effect preference, layout/rendering constraints, and explicit exclusions. OS, available tools, and display capabilities inform delivery; a platform or device does not imply a personality. Raw conversations, work documents, and full memory stores are not image prompts.

Start with consistent state portraits plus application-rendered effects. Separately layered sprites or frame sequences can follow once their generation and import are reliable. Request the same reference identity across states; do not assume independent image generations will preserve it exactly. Status text, measured numbers, and proportional charts are rendered by the application, not painted into generated images.

## Responsive generation and instant switching

Generate on initial setup or an explicit redesign and keep the result. A generation job can update the GUI as it progresses, while the current artwork remains usable. Reuse saved assets for immediate mode transitions; a mode switch does not need to wait for a new image or spend image-generation quota each time.

Animation and comparison state remain independent. “Generation complete” means an asset is available, not that a mode was applied. Regenerating artwork does not change a loadout or its measured results. Effects off and reduced motion apply equally to generated and bundled artwork.

## Where memory helps

| Use | Useful inputs | Result |
| --- | --- | --- |
| Personal appearance | Explicit visual preferences, selected references, motion/accessibility preferences | A reusable design brief and original appearance |
| Personal quests | Recurring task types, common corrections, previously accepted work requirements | Suggested tasks with explicit starting conditions and versioned acceptance criteria |
| Personal evaluation | Stated priorities such as correctness, readability, brevity, or acceptable human effort | A reviewable scorecard fixed before the comparison begins |
| Contextual favorites | Recorded outcomes, user ratings, app/model/configuration versions, task type | “This loadout worked for similar work” with evidence and a re-test suggestion when stale |
| Memory as equipment | A selected optional memory source or a prepared memory summary | A comparison of fixed, omitted, or deliberately varied memory under recorded conditions |

An AI recollection that a setup “worked well” is a lead, not a substitute for experiment evidence. Unharness owns the exact local configuration and comparison records. It can give the user's AI a short summary and record references for future recall when that client's memory capabilities and the user's settings permit it; do not promise automatic cross-app memory synchronization.

Store extracted preferences separately from observed results, with source, scope, version/date, and whether the user stated or the AI inferred them. Let users inspect, correct, remove, or stop using this local profile. A changed preference can create a new scoring version; it must not silently rescore or relabel an old winner. Appearance versions may be associated with favorites/cards, but do not participate in configuration identity or performance scoring.

## Keep personalization out of uncontrolled comparisons

Use memory to prepare the experience and the experiment. The experiment runner must then receive only its declared inputs. Do not silently inject the design brief, the conversation used to choose equipment, or the generation skill into candidate tasks.

For each comparison, record whether memory is fixed across candidates, omitted, or deliberately part of the varied equipment. Preserve the permitted input version when observable, and record read and future-write behavior. If a client cannot expose or control the relevant source, mark that part unknown and the comparison potentially confounded rather than claiming identical inputs or verified Zero.

Freeze task criteria and relevant memory inputs during the comparison. Avoid allowing the first trial's answers or ratings to enter a later trial through background memory updates. A fresh task alone does not prove memory isolation. Generation and optional judging usage belong to separate overhead records, not the candidate's task-token total.

The appearance skill is invoked only for setup/redesign, outside benchmark execution. In Codex, explicit-only invocation is available, but it does not by itself prove a skill is absent from discovery or already loaded context. Benchmark isolation must cover the selected source and fresh-task boundary. TRUEFORM must not regain disabled memories through a personalization helper. The minimal recovery/control connection remains separate from the optional appearance workflow.

## App capabilities and evidence

- The current Codex development session exposes an image-generation tool and produced the existing concept images. This is evidence for this session, not a guarantee for every Codex installation or account.
- [Codex skill documentation](https://learn.chatgpt.com/docs/build-skills) provides explicit-only invocation via `allow_implicit_invocation: false` and describes distributing skills with optional MCP connections as plugins. Product packaging and GUI-to-AI dispatch still require implementation and verification.
- [OpenAI memory documentation](https://learn.chatgpt.com/docs/customization/memories) distinguishes ChatGPT web memory from local Codex memory, and describes separate controls for using memories and contributing future inputs. Do not assume the appearance skill can read a user's ChatGPT web memory from Codex.
- [Claude's image capability documentation](https://support.claude.com/en/articles/9002504-can-claude-produce-images) says it does not natively generate photos or illustrations like an image-generation tool. The Claude Code workflow therefore needs an available external generation tool for that asset path, or bundled/imported assets; the skill alone cannot add that capability.

These are documented capabilities and design boundaries, not completed integration tests. Access to memory and generation must be checked on the actual app, OS, account, and session.

## Delivery boundary

Keep the base product useful with bundled artwork and no memory access. After the shared core and asset import exist, add the optional generation workflow and an editable local profile. Connect quest/scorecard suggestions to the comparison feature, then use accumulated evidence for contextual favorite suggestions. The detailed release scope remains open; no global skill installation, memory import, provider setup, or image generation was performed for this design proposal.
