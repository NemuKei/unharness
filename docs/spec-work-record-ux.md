# Work records, reflection and comparison

The maintainer requested a simpler comparison experience on 2026-09-14. The useful question is what suited a particular job; users should not need to learn storage versions, UUIDs or measurement internals before seeing a result. This changes the presentation and adds bounded task metadata discovery; the [measurement contract](comparison-metrics.md), immutable assessments and source-evidence boundaries remain in force.

## Everyday use

The 2026-09-20 simplification places **記録・比較** under **その他**; Mode and its saved contents are the everyday screen. The first screen is **仕事の記録**. Show saved job names, dates, initial mode evidence and a short attributed outcome. A record opens on its own. Selecting two jobs enables **並べて見る**; the existing upper limit of three remains. Zero records offer the recording path, not a requirement to manufacture a comparison partner. An unconfirmed history read is loading/unknown, not an empty history or missing registration.

**仕事を記録する** lists recent tasks by name/date for the registered project. Selecting an already recorded task opens its saved record. Selecting another task explicitly collects its completed work and pre-fills the title. Ask only whether its result was useful and for an optional note about edits/experience. Save is explicit. Detailed requirement checks, ratings, provenance changes and manual task/cutoff entry remain available in disclosures, preserving corrections and earlier versions.

The first inspection/comparison view shows outcome and notes, then initial mode/model, recorded duration and recorded usage. Keep **未確認**, **不明** and **一部のみ** beside the affected values. Time is not human effort. Different jobs/conditions produce a reference comparison; do not rank modes from token differences or assign a total quality score. Technical token breakdowns, aggregate diagnostics and source details belong in details. Answers are read only on an explicit **回答を開く** action.

Favorites and source recovery belong with modes/support; they do not appear as unrelated actions in the work-record list. A particular record's frozen loadout can still be saved from its details when its association is qualified.

## Recent task metadata

The Codex adapter uses `initialize` and `thread/list` only. For the metadata-qualified 0.153.4 and 0.155.0-alpha.9.2 schemas it sends the registered `cwd`, `limit: 20`, descending `updated_at`, non-archived interactive source kinds, and `useStateDbOnly: true`. That flag prevents rollout scans/metadata repair for discovery. Each response is bounded; project, task identity, source, parent/ephemeral status, empty turns and timestamps are checked before projection.

Return only task ID, title and created/updated timestamps plus the opaque next cursor. Omit native paths, previews, models, turns and message bodies. Callers cannot supply a profile, executable or project. Titles are data, never instructions. A missing title has an explicit unnamed fallback. Unknown runtime identity/version or malformed responses return a fixed error, not private native diagnostics. Unsupported applications retain explicit manual/AI-assisted alternatives; no broader platform support is inferred.

The local CLI/HTTP action is `recent-tasks`, with optional `taskCursor`; MCP exposes `list_recent_tasks`. They share the registered source controller and metadata/context checks. Merely opening a record page does not inspect every native task. Recent task listing starts when the user opens the recording picker.

## Completed work and assessment

`review-run` / `review_run` accepts optional `latestCompleted: true` as an alternative to `throughTurnId`. It reads the explicitly selected task once, selects the latest completed turn from the adapter's available-turn metadata and projects that prefix. A currently running turn is excluded. With no provable completed turn, stop with `comparison-no-completed-turn`. Omission retains the historical first-turn default; explicit cutoffs and old reviews are unchanged.

For a chat request to record this work, freeze the completed prefix before asking for assessment details. Keep that review ID throughout the recording conversation, so those extra turns do not inflate the original work's measurement. A copied request is labelled as a copy, with instructions about where to send it. It does not claim that a model or save operation started.

Native metadata reading is not source-loading proof. Review still runs the existing source association and privacy projection; unqualified or partial evidence stays that way. Saving/correction uses the existing `save-run` service, attribution, request identities and immutable records. Late responses cannot replace another selected task or registered context. A confirmed save remains visible if history refresh fails.

## Controlled replay

**同じお題で試す** is a separate purpose, retaining the existing starting-condition/replay controllers and drafts. Explain before its controls that the request, required result and original files must be saved before work. An ordinary historical record cannot be assumed to reconstruct the original project. Never dispatch multiple modes automatically or use the first trial's modified files as another trial's starting point.

## Validation

Verify: recent task list → select → short assessment → save → find/open the saved job; open one existing record without another; select two → compare → inspect a partial/unknown field; correct an assessment while retaining the original; read an answer only explicitly; return to mode/recovery after an error. Check context changes, native metadata confinement, completed versus running turns, unknown/partial values, normal/narrow layout and no console errors using synthetic profiles. Native metadata qualification remains separate from task measurement, desktop-loaded mode qualification and publication.
