# Numerical comparison and quality

The maintainer requested numerical comparison of token efficiency and output quality alongside personal judgment. The ordinary-use slice now projects bounded Codex 0.153.4 desktop records, stores private immutable reviews and attributed retrospective assessments, and displays one to three saved records. The read-only inventory probe remains separate and does not collect these totals or grade outputs.

## The useful question

**How much work and how many tokens did this loadout need to reach the required quality on this task?**

Keep three kinds of evidence visible: measured resource use, checks against the task's requirements, and the user's preference. A short unsuccessful answer is not an efficiency improvement.

## One selected mode and later comparison

The maintainer clarified the default: choose one mode and use it. Record the observed result of that task without automatically sending the instruction to the other modes. Review accumulated results later. A task's mode and actual loaded-state evidence remain separate, and missing usage or acceptance evidence stays unknown.

Offer a closer comparison as an optional sequential replay: preserve the selected request, original starting files, and declared criteria; later run it in a fresh task under another mode. Do not use the first trial's modified files or answer as the next trial's starting point. Sequential execution still needs memory/tool-state handling; time, caches, and service changes may remain confounders.

Everyday work with different task difficulty, requests, or model settings is observational history. It can show task-scoped outcomes and personal notes, but its aggregate token differences do not by themselves justify a favorable/adverse mode classification or an original-form unlock. Require applicable comparable evidence under the predeclared rule for those claims. Keep human ratings identifiable as human assessments.

A future concurrent comparison would submit the instruction into separately isolated tasks. Creating multiple task IDs is not proof that configurations, files, memories, or hooks are isolated. Concurrent dispatch is neither implemented nor an initial requirement. The three-column comparison concept can show saved runs collected at different times; it does not imply three tasks were launched together.

## Initial measures

| Dimension | Measure | How to interpret it |
| --- | --- | --- |
| Usage | Reported total tokens, input/output breakdown, cache and reasoning fields where available | Record the source and collection coverage; missing values remain unknown |
| Time | Wall-clock duration and, when observable, active execution time | Record user-wait time separately when it can be distinguished |
| Completion | First-attempt acceptance, eventual acceptance within the fixed budget, attempts until acceptance | The quality conditions are specified before comparing modes |
| Requirements | Pass/fail per critical requirement and fulfillment count over a fixed checklist | Passing many trivial checks cannot compensate for a failed critical requirement |
| Functional correctness | Task-relevant executable checks, build/type checks when relevant, regression checks | Test count or coverage alone is not a universal quality score |
| Human effort | Corrections or interventions, with a short classification/note | A useful clarification is not automatically a defect |
| Subjective quality | User preference and a criterion-specific scorecard | Keep preference identifiable instead of folding it into an unexplained global score |

For a single task, “tokens to acceptance” sums all generation attempts and revisions up to the first accepted result. A task that exhausts its budget remains a failure with its spent tokens recorded; do not silently remove it from summaries.

For a fixed task set under the same stopping policy, one aggregate is:

```text
tokens per accepted task = tokens spent across all attempted tasks / number of accepted tasks
```

Show this with acceptance rate, task count, budget, and which cases passed. With zero accepted tasks, the ratio is unavailable. Also compare the same paired cases so different successful-task mixes do not hide failures. Keep the underlying per-run data accessible.

## Codex usage evidence

For registered-plugin v3 scopes, initial Skill input correspondence is saved
separately from complete plugin runtime state. The qualified 0.153.4 task
record contains no per-plugin MCP/hook/app/scheduled-task state. Per-run usage
and outcomes remain inspectable, but input matches alone do not grant a
matching mode association or qualified replay/performance aggregate. See the
[v3 evidence boundary](evidence/2026-09-11-source-states-v3-macos.md#task-record-evidence-and-its-limit).

The installed 0.153.4 protocol schema includes `ThreadTokenUsageUpdatedNotification` with `threadId`, `turnId`, and a `tokenUsage` object containing `last` and `total`. Its breakdown fields include `totalTokens`, `inputTokens`, `cachedInputTokens`, `cacheWriteInputTokens`, `outputTokens`, and `reasoningOutputTokens`. The implemented native adapter recognizes the corresponding persisted top-level `token_usage_record` stream for one explicit task UUID and selected turn prefix.

The [App Server documentation](https://learn.chatgpt.com/docs/app-server) also describes `thread/tokenUsage/updated`. Persisted root-response values are now collected with explicit availability and reason codes. This does not establish complete billing, child-task usage or live notification capture. Account/thread estimates from a different billing endpoint are not substituted for the persisted event source.

Collection must define whether each field is a cumulative snapshot or a delta before aggregation. Do not add every `total` update together. Keep reset/reconnect behavior, duplicate updates, missing final events, and parent/child task coverage explicit. Do not double-count subagent usage if an upstream total already includes it, and do not claim complete totals if child usage is not observable.

Retain reported breakdowns separately. Do not add cached input on top of input or reasoning output on top of output without confirming their inclusion semantics. Use the source's reported total rather than inventing a sum across potentially overlapping categories. Record cache conditions because they can affect time and billing independently of harness quality.

Treat monetary estimates separately from token counts. A subscription plan's usage cannot automatically be translated into an exact per-task price.

## Claude Code usage evidence

Claude Code 2.1.260 records usage per API request, and several `assistant`
records can belong to one request and repeat its `usage`. Usage is therefore
attributed once per `requestId`; a repeat with different numbers is a
`response-replay-conflict` that withholds every total rather than charging
twice. In a real 1,066-record recording this collapsed 371 assistant records to
191 charged requests.

The recorded usage carries `input_tokens`, `cache_read_input_tokens`,
`cache_creation_input_tokens`, `output_tokens` and
`output_tokens_details.thinking_tokens` — and **no total**. `totalTokens`
therefore stays null with `response-usage-missing-field`, and availability is
`partial`. Deriving a sum would publish this parser's arithmetic under a field
name that means a recorded value for the Codex parser, so the four component
counters compare exactly and the total stays unknown. A `user` record starts a
new turn only when it is a human prompt; tool results share the record type and
are not turn boundaries.

Each application parser declares the runtime versions it qualifies. A
measurement may not claim a version its own parser has not been checked
against, and adding an application never loosens another one's admission.

## Output quality

For coding tasks, start with explicit acceptance checks: requested behavior, relevant tests, retained behavior, and required constraints. Add a small review scorecard only for qualities the executable checks cannot capture.

For writing or design, define the criteria for that task: factual accuracy, completeness, clarity, audience fit, visual hierarchy, or other requested qualities. Scores need anchors and reasons. Do not treat length, changed-line count, or number of questions as a stand-in for quality.

Optional AI judging can later compare outputs labelled A/B without their mode names. The current ordinary-use UI records only explicitly attributed user/agent assessments supplied to the form; it starts no grader task. A later judge integration must use the same judge, criteria, reference material, and scoring version across the comparison, vary presentation order and check agreement against human assessments. Preserve disagreement and uncertainty. Store a concise justification tied to the criteria, not a hidden reasoning transcript.

This follows [OpenAI's evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices): use task-specific criteria, pairwise or pass/fail decisions when suitable, and calibrate automated ratings with human judgments. An AI-produced score is an assessment, not objective ground truth. Judge-generation usage is a separate evaluation cost and must not be hidden inside the candidate loadout's usage.

## Fair comparison

- Hold the app, model, reasoning settings, request, starting files, tools, execution permissions, and declared memory policy constant while changing the selected harness scope.
- Decide the acceptance criteria and stopping/retry budget before seeing which mode wins.
- Record run count and variability. Repeat paired cases when needed; one trial is not a general performance claim.
- Keep collection coverage and failed runs visible. Report a missing metric as unknown rather than zero.
- Save the exact loadout version, scoring version, comparison conditions, and supporting results with a favorite so a later rerun can be interpreted.

The [accepted harness scope](harness-scope.md) preserves existing memory and native task-continuity settings in every initial mode. The [personalization proposal](personalization.md#useful-memory-stays-separate) lets memories inform task and scorecard preparation, then freezes the declared criteria. Record observable memory conditions and input versions; unchanged settings do not prove unchanged memory contents. If earlier trials can feed later trials through background memory updates, record that limitation instead of claiming identical inputs. Memory is not an initial varied harness component. Appearance generation stays outside candidate tasks and its usage is separate overhead.

The product should let a user inspect tradeoffs such as similar quality with fewer tokens, better quality with more work, or no meaningful difference. It need not reduce every task to one “strength” number.

## Display in the pixel-art interface

The Comparison tab in the same hangar GUI shows selected saved results with accepted-version counts, token totals, tokens per accepted version, requirement checks, ratings and notes. Up to three record columns use compact historical loadout portraits; an unknown association stays unknown and does not borrow Normal art. The table is the accessible source of exact values. Horizontal token bars use the same zero baseline and common maximum, keep exact labels visible, render a real zero at zero width, and distinguish partial or missing values. Output is fetched only through an explicit plain-text action. The [sample-data visual concept](design.md#comparison-inside-the-same-gui) establishes the composition, but its values and winner treatment are not production data.

The implemented aggregate preserves the service meanings: `recordCount` counts selected saved versions, `distinctTaskCount` counts task UUIDs and `acceptedCount` counts versions that pass the derived acceptance rule. Failed and abandoned spending remains in a calculable numerator. Overlapping task versions, partial/unavailable totals and overflow make the total/ratio null with fixed reasons; zero accepted versions keep a known total but have no ratio. The UI never recomputes a more favorable denominator.

The 2026-09-09 appearance revision separates artwork from assessment. Supportive or resonating equipment can be freely chosen as a visual motif; it is not evidence that a configuration performs better.

Report favorable, adverse or unknown performance separately from the [appearance collection](personalization.md#collection-ownership-and-current-presentation). Keep the chosen image unchanged and retain all works. The assessment remains scoped to the app/model, loadout version, task criteria, baseline and evidence; selecting a skin does not change that assessment.

[Original creation and revision](personalization.md#creation-and-revisions) need no comparison qualification. Performance claims still require declared rules, exact comparison/loadout versions, required quality, enough observations and coverage of the claimed benefit; token reduction alone is insufficient. Preserve the earlier evidence resolver for such scoped analysis and historical records, while removing its use as a creative gate. Generation usage remains separate from benchmark usage.

## Delivery order

1. Implemented: preserve per-run recorded conditions, root-response usage/time, attributed retrospective checks/ratings/notes and private output in immutable comparison records.
2. Implemented: [freeze the request, working files, declared criteria and stopping budget](spec-starting-conditions.md) before use, through the registered-source CLI and Comparison form. This creates immutable inputs, not a task association or performance verdict.
3. Implemented: [sequential replay](spec-sequential-replay.md) from that frozen start, with distinct owned locations, retained-condition checks, exact request/task association, separate outcome snapshots and attributed frozen-criterion results. [Mac evidence](evidence/2026-09-09-replay-gui-macos.md) covers the CLI/GUI and four new desktop tasks. Overlapping recorded task timelines and incompatible conditions prevent aggregation; results remain neutral without an applicable performance rule.
4. Next: expose the same deterministic operations through AI/MCP. Optional blind pairwise judging and performance/creation rules remain separate work; any judge usage must be recorded separately.

No grader request or automatic multi-mode task was run for this ordinary-use slice. Its records are retrospective observations; they do not replace the predeclared replay needed for a performance verdict or original-form eligibility.
