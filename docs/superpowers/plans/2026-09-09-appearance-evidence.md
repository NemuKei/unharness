# Appearance evidence and original creation

Continue inline using the already accepted Mac goal and appearance contract. Claude owns its separate integration worktree; do not edit it. Shared transport/UI integration follows its return and review.

**Goal:** Let a user declare a task-specific comparison rule before replay, then resolve original-form eligibility from canonical saved attempts and create/adopt one persistent three-candidate set.

**Design:** An optional versioned rule is part of the immutable starting declaration. It names two exact snapshot IDs, a fixed number of attempts per snapshot, a minimum accepted count and a required percentage reduction in recorded root tokens per accepted task. No default rule or universal performance score is inferred. Ordinary records and old declarations without a rule stay neutral. Additional evidence cannot be selected by the caller: the resolver reads every attempt in that saved start for the two named versions, uses each latest assessment, and rejects incomplete or overfilled observation sets. Failed and abandoned work contributes its recorded usage.

The first supported rule is deliberately specific. A favorable verdict requires enough accepted work, no reduction in accepted count, and the declared token reduction. A confirmed quality regression or token increase of the same declared magnitude is adverse only when evidence is otherwise comparable and the baseline met its quality requirement. Missing evidence is neutral. Recorded root usage does not include unknown child/tool use, memory inputs or a proof of complete isolation.

The achievement ID binds the scope, exact configuration pair, semantic frozen task/rule/files and recorded app/model/runtime conditions. It excludes titles, result amendments and random seeds, so renaming or rereading evidence cannot produce another candidate set. Supporting latest result IDs and an evidence version remain inspectable. Creation rechecks current source state and applicable evidence under the existing operation lock; callers provide IDs, never eligibility, seeds or replacement state. Final adoption and collection reuse keep historical evidence and never change source settings.

## Work

- [x] Add strict rule validation and immutable declaration support, including validation that both snapshots belong to the registered scope.
- [x] Add the canonical resolver and tests for complete evidence, failed attempts, incomplete/extra attempts, amendments, runtime mismatch, missing usage, and title-independent achievement identity.
- [x] Connect original creation/adoption to the existing appearance journal; test retries, changed current configuration, stale state, evidence correction and exact candidate reuse after interruption.
- [x] Record focused verification and the remaining renderer, GUI/MCP, first-user and release work. This does not qualify Claude native integration or complete the Mac goal.
