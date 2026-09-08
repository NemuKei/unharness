# Frozen starting conditions

This implementation step supplies the pre-use input required by [sequential comparison](comparison-metrics.md). It follows ordinary-run records and precedes the replay executor. Completing this step does not establish paired evidence, a performance verdict, original-form eligibility or Mac completion.

## User flow

In Comparison, open **実行前に条件を保存**. Enter the exact request, a small requirement checklist, any anchored rating criteria, and a stopping budget. Review the project-file inventory, then freeze the start. Saved starts are immutable and can be reopened without changing a mode or starting an AI task. A later replay explicitly selects one saved start and one current mode; it never reads the first trial's modified files as the next input.

The initial file default is the selected Git root's tracked and non-ignored untracked working files, including uncommitted contents and missing tracked files. Show the selection rule and excluded Git/ignored files. Root instruction files and project-local `.codex`/`.agents` trees are also included even when ignored: those are retained project inputs, not optional-source classifications. A user can explicitly add relative file paths from the same selected project. Do not scan outside that project or copy `.git` metadata. A non-Git directory uses a bounded regular-file inventory; a nested Git root or unsupported entry is reported instead of silently copied.

Saved files are working-file inputs, not a Git-history backup. Ignored dependencies and external services may need separate setup for a later trial. The replay planner must review those requirements and effective project loading before dispatch; capturing files alone cannot establish equivalent tools, permissions or memory inputs.

## Declaration and time

A declaration contains:

- Exact request, up to 16,384 characters with a 64 KiB UTF-8 bound; preserve line endings and whitespace.
- One to 24 requirements with unique stable IDs, labels and a `critical` boolean. At least one requirement is critical.
- Zero to eight rating criteria with unique IDs, labels, and distinct low/high anchors. Results, scores and outcome are absent before use.
- `maxAttempts` (1–20), `maxTurnsPerAttempt` (1–100), and an explicit nullable `maxRecordedTokens` positive safe integer. The last field is a stopping target in terms of available root-response records, not a promise of a runtime quota limit.
- Optional title, up to 120 characters. No inferred title, evaluation criterion or budget is silently accepted on the user's behalf.

Fixed declarations say memory/native continuity settings are retained; memory contents, live tools, caches and external state remain uncontrolled until observed. The capture layer never changes those settings. Later replay associations require a fresh task after the saved-start timestamp and exact request evidence; caller timestamps, caller mode labels and retrospective reviews cannot manufacture predeclared evidence.

## File capture and storage

Use the existing private content-addressed store. A starting-file manifest references immutable binary chunks rather than embedding all files in one record. Each chunk is at most 384 KiB before base64 encoding; each file is at most 8 MiB, the selection at most 2,048 paths and 64 MiB total. Bound individual relative paths to 1,024 UTF-8 bytes and directory depth to 32. A maximum is an explicit error, never truncation. Deduplicate chunks by content identity and verify size, encoding and SHA-256 on reads.

Capture bytes, absence, and supported file metadata (owner/group, mode, xattrs) without executing file contents. Reuse the existing native metadata checks; reject ACLs, file flags, unsupported ownership, special files, hard links and symlinks. Validate every ancestor and its binding before and after reading. The selected project's canonical path and filesystem identity remain bound throughout capture. Verify the inventory and captured files again before publishing the final saved start; replacement, edits, disappearance or newly included files invalidate the review.

No browser caller chooses a home, workspace or absolute path. The service supplies the registered project, scope and private store. Relative supplemental file paths have no `..`, empty components, absolute prefixes, backslashes, control characters, platform-reserved components or `.git` segment. No path can escape through a symlink. Files and raw request text are private; ordinary list summaries contain title, counts, timestamps, criteria/budget and availability, not bodies. Explicit detail reads return the request and a metadata-only file manifest. No file-content HTTP endpoint is part of this step.

Use separate immutable record roles for capture reviews, saved starts, manifests and binary chunks. Reviews, manifests and chunks use the optional `input` bucket; saved-start indexes use `experiment`. Ordinary source/comparison history never enumerates binary chunks. Existing stores read a missing optional bucket as empty without creating it; an explicit publication creates it privately. Required legacy buckets still fail closed when absent. A saved start references its exact review. Re-saving the same review returns the same identity and original date. The fixed-input timestamp is the immutable review's completed-capture time, not a later save-click time. A changed declaration needs a new review; old starts are never edited. Future attempts will reference a saved-start ID. Configuration favorites, ordinary comparison reviews and recovery state remain separate.

## Shared operations

The service exports `reviewUserStart({workspace, declaration, additionalPaths?})`, `saveUserStart({workspace, reviewId})`, `readUserStart({workspace, startId})`, and `listUserStarts({workspace, after?})`. A review captures the proposed declaration, file bytes, selection rule and source scope privately and returns a reviewable summary. Save reacquires the existing workspace lock, validates the original review and unchanged project inputs, and publishes the immutable start. Saving a start writes no harness state, source files or recovery journal.

The CLI and GUI expose `review-start`, `save-start`, `start`, and `starts` through those operations. Both write operations have an uncertain-publication boundary, strict JSON parsing and no automatic retry after an uncertain result. Reads do not load Codex, YAML, React or PixiJS. Errors in optional start records do not make Equipment, configuration status or recovery unavailable.

The form is scoped to the accepted GUI launch/context/workspace/scope. Switching Equipment/Comparison or changing a mode preserves its explicitly pre-use draft; changing the selected project or GUI launch clears the draft and rejects delayed responses. Edits after a review invalidate its save action. A confirmed save remains confirmed if refreshing the list fails. An explicit saved-start detail read can restore its declaration into a new draft but cannot alter its frozen record.

## Follow-on replay boundary

Replay is the next implementation step, consuming these frozen bytes and declarations. It must create a fresh owned work location for each explicitly requested attempt, preserve applicable project guidance, validate derived source mappings and effective retained conditions, and retain separate outcomes. It must not accept an arbitrary project/mode override into the ordinary observer. Moving a registered repo Skill requires a validated mapping; an old preparation timestamp is never fabricated.

On Mac, the installed Codex 0.153.4 `app` command and [official developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli) support opening a workspace path in the desktop app. The chosen handoff will explicitly copy the frozen request and open that owned location; opening is not task submission or runtime verification. Actual completed task recordings establish what ran. A separately launched app-server is not called a desktop task by changing its originator string.

## Verification

- Pure declaration validation rejects result fields, empty/duplicate criteria, unanchored ratings, invalid budgets and unsafe text without changing the request.
- Real filesystem/store tests preserve modified/untracked/missing files, binary and zero-byte contents, supported modes, deduplicated chunks and immutability. Corrupt/missing chunks and inconsistent manifests fail closed.
- Capture/save tests reject traversal, symlink and hard-link substitution, file changes, project replacement, inventory growth, oversize files/totals and non-reproducible metadata. Read-only collection never executes an instruction, hook or file body.
- Service tests use registered synthetic profiles and assert exact source/state/journal preservation, duplicate saves, cross-scope rejection, private list projections and paged reads.
- HTTP/GUI tests cover accepted context, duplicate IDs, strict JSON, uncertain writes, delayed responses, invalidated reviews and successful saves with failed auxiliary reads. Check/build/full suite and the production browser flow are required before integration.

All fixtures and committed evidence are synthetic or sanitized. No real project-file contents, personal request, memory or private capture is committed.
