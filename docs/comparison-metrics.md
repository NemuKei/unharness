# Numerical comparison and quality

The maintainer requested numerical comparison of token efficiency and output quality alongside personal judgment. This is a requirement for the comparison feature. The current read-only inventory probe does not collect model-run usage or grade outputs.

## The useful question

**How much work and how many tokens did this loadout need to reach the required quality on this task?**

Keep three kinds of evidence visible: measured resource use, checks against the task's requirements, and the user's preference. A short unsuccessful answer is not an efficiency improvement.

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

The installed 0.153.4 protocol schema includes `ThreadTokenUsageUpdatedNotification` with `threadId`, `turnId`, and a `tokenUsage` object containing `last` and `total`. Its breakdown fields include `totalTokens`, `inputTokens`, `cachedInputTokens`, `cacheWriteInputTokens`, `outputTokens`, and `reasoningOutputTokens`.

The [App Server documentation](https://learn.chatgpt.com/docs/app-server) also describes `thread/tokenUsage/updated`. The field presence is verified; receiving complete usage for the intended desktop experiment still needs a live integration test. Account/thread estimates from a different billing endpoint must be labelled as estimates and not silently substituted for the event source.

Collection must define whether each field is a cumulative snapshot or a delta before aggregation. Do not add every `total` update together. Keep reset/reconnect behavior, duplicate updates, missing final events, and parent/child task coverage explicit. Do not double-count subagent usage if an upstream total already includes it, and do not claim complete totals if child usage is not observable.

Retain reported breakdowns separately. Do not add cached input on top of input or reasoning output on top of output without confirming their inclusion semantics. Use the source's reported total rather than inventing a sum across potentially overlapping categories. Record cache conditions because they can affect time and billing independently of harness quality.

Treat monetary estimates separately from token counts. A subscription plan's usage cannot automatically be translated into an exact per-task price.

## Output quality

For coding tasks, start with explicit acceptance checks: requested behavior, relevant tests, retained behavior, and required constraints. Add a small review scorecard only for qualities the executable checks cannot capture.

For writing or design, define the criteria for that task: factual accuracy, completeness, clarity, audience fit, visual hierarchy, or other requested qualities. Scores need anchors and reasons. Do not treat length, changed-line count, or number of questions as a stand-in for quality.

Optional AI judging can compare outputs labelled A/B without their mode names. Use the same judge, criteria, reference material, and scoring version across the comparison; vary presentation order and check agreement against human assessments. Preserve disagreement and uncertainty. Store a concise justification tied to the criteria, not a hidden reasoning transcript.

This follows [OpenAI's evaluation guidance](https://developers.openai.com/api/docs/guides/evaluation-best-practices): use task-specific criteria, pairwise or pass/fail decisions when suitable, and calibrate automated ratings with human judgments. An AI-produced score is an assessment, not objective ground truth. Judge-generation usage is a separate evaluation cost and must not be hidden inside the candidate loadout's usage.

## Fair comparison

- Hold the app, model, reasoning settings, request, starting files, tools, execution permissions, and declared memory policy constant while changing the selected harness scope.
- Decide the acceptance criteria and stopping/retry budget before seeing which mode wins.
- Record run count and variability. Repeat paired cases when needed; one trial is not a general performance claim.
- Keep collection coverage and failed runs visible. Report a missing metric as unknown rather than zero.
- Save the exact loadout version, scoring version, comparison conditions, and supporting results with a favorite so a later rerun can be interpreted.

The [personalization proposal](personalization.md#keep-personalization-out-of-uncontrolled-comparisons) lets memories inform task and scorecard preparation, then freezes those inputs. Memory can also be a deliberately varied harness component. Record its read/write policy and observable input version; prevent earlier trials from feeding later trials through memory updates. An unavailable control or observation remains a comparison limitation. Appearance generation stays outside candidate tasks and its usage is separate overhead.

The product should let a user inspect tradeoffs such as similar quality with fewer tokens, better quality with more work, or no meaningful difference. It need not reduce every task to one “strength” number.

## Display in the pixel-art interface

Use a Comparison tab in the same hangar GUI. Show the three loadout states together with accepted-task counts, token totals, tokens per accepted task, and the personal scorecard. Let the user inspect outputs and save the selected configuration from that screen. Display collection coverage, sample size, and the kind of each metric. The [sample-data visual concept](design.md#comparison-inside-the-same-gui) establishes this flow; the final charts must be rendered from the recorded values.

The maintainer also wants helpful harnesses to be expressible as supportive or resonating equipment. Derive such an optional visual assessment from the stated comparison and user priorities, retaining a neutral appearance for unmeasured or inconclusive setups. It is presentation metadata, not evidence on its own and not a configuration change.

A qualifying result can unlock an optional original-appearance creation action. Its [eligibility rule](personalization.md#original-creation-unlocked-by-comparison-evidence) must be fixed before inspecting candidate results and reference the exact comparison/loadout versions. Required quality, sufficient observations for the chosen rule, and coverage of the claimed benefit determine eligibility; token reduction alone does not. Thresholds and repeat counts remain task-specific design work. The same gate applies to GUI and AI requests, and generation usage remains separate from benchmark usage.

## Delivery order

1. Preserve per-run comparison conditions and human notes in the comparison record.
2. Add verified usage/time collection and task-specific acceptance checks once desktop task execution can be observed.
3. Add optional scorecards and blind pairwise judging, with separate judge usage.

No live benchmark or grader request was run while defining this document. These capabilities belong to the comparison implementation after the read-only feasibility slice.
