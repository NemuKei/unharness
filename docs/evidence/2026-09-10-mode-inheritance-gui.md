# Paired setup and enrollment in the built Mac workbench

Date: 2026-09-10. This follows the v2 [storage/enrollment slice](2026-09-10-mode-inheritance-storage.md). The fixtures use an owned temporary Codex profile, its synthetic native server and the built local GUI in headless installed Chrome. No personal configuration, native model task, production plugin provenance or public website was used. The Browser skill/plugin was unavailable; the repository's configured Playwright route was used.

## Verified behavior

- The saved pair is read through the existing authenticated setup operation. V2 shows **零式から引き継ぐもの** and **限定解除で追加するもの**, instruction choice, and saved automatic/manual/disabled counts. Lists are read-only, and unknown/currently ineligible plugins cannot be selected there. V1 is explicitly an older rule. Current candidate checks are separate from the saved counts.
- V2 registration accepts confirmed source ID, origin and reason only. Both legacy per-mode selectors are absent. Adoption saves the larger scope/Normal without writing source files; the UI then distinguishes setup-required from preparation-required, retains the historical prepared label and disables new release plans. Normal and historical restores remain available.
- MCP can review/adopt the expanded pair and update the open GUI. Saving still leaves preparation-required. An explicit GUI TRUEFORM preparation makes the added Skill manual; an older Normal favorite restores original files and the added Skill's saved Normal values.
- Copying handoff prompts preserves files and does not dispatch a task. Paths and source bodies are excluded. Clipboard failure leaves selectable text; conflicts suspend the handoff. Initial setup, expanded-scope review and old-rule setup have separate guidance.
- The first response in a fresh Codex task must complete before observation. This follows the existing `task_complete` requirement in the adapter; it is now explicit in the prompt and bundled setup Skill. Observation is performed from the GUI/original management task before continuing the same new task. This sequence has not yet been run as a native v2 consultation.
- Desktop 1440×1100 and narrow 390×844 screenshots were visually inspected. Lists wrap without horizontal overflow. The read action works from the keyboard and preserves focus after its response.

The nonempty inherited list / unknown current plugin / disabled-count presentation scenario replaces only a read response in the browser. It is a rendering fixture, not a service-accepted official record or a native eligibility proof. The end-to-end service scenario uses a valid empty TRUEFORM automatic set and an explicitly added owned Skill in UNSEAL.

## Validation

The two new browser cases first failed against the earlier build because the saved-pair read action was absent. The final focused command covers seven scenarios with zero failures or skips:

```text
node --test test/web-setup.test.mjs test/web-enrollment.test.mjs test/web-setup-inheritance.test.mjs
```

It was run with the configured Playwright module and installed Chrome executable. TypeScript/CSP checks and `npm run build` pass. The setup Skill passes `skill-creator`'s frontmatter/scaffold validator using an isolated Python environment; no global Skill installation was changed.

The related core/API checks have 145 cases: 144 pass, zero failures, one intentional non-Mac-platform guard skip on macOS:

```text
node --test test/setup-preset.test.mjs test/setup-migration.test.mjs test/setup-inheritance-preset.test.mjs test/setup-inheritance-migration.test.mjs test/setup-inheritance-enrollment.test.mjs test/setup-inheritance-entrypoints.test.mjs test/setup-entrypoints.test.mjs test/enrollment-entrypoints.test.mjs test/source-enrollment.test.mjs test/gui-sources.test.mjs test/user-sources.test.mjs
```

Enrollment coverage now also includes two successive scope expansions followed by a root favorite/checkpoint restore in a Node-only process, and a newly automatic or already manual Skill explicitly omitted from UNSEAL additions. A prior test expected caller order instead of the resolver's canonical sorted IDs; that expectation is corrected. Creating a policy changes the discovered source ID, so the manual fixture refreshes both its discovery and source IDs before review.

The staged changes were exported into a separate temporary checkout without the unrelated appearance work. That exact candidate passed the same 144 core cases (one platform skip), all seven browser scenarios, TypeScript/CSP and build checks. Its narrow screenshot was inspected again. Locked dependencies were reused; historical-writer tests had read-only access to the repository's existing Git objects. Changed documentation passed 232 relative-link checks and both working/staged whitespace checks.

## Remaining qualification

These checks establish built local UI behavior and deterministic owned-fixture operations. They do not qualify official plugin provenance/control, the initial native AI consultation, the public-origin connection, the current package/installer, or the full Mac product journey. A missing control must stay unknown/unsupported; this slice adds no cache mutation or whole-plugin disablement workaround.
