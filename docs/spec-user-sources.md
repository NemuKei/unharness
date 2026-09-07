# Registered user-source modes

The maintainer approved Normal → minimal guide/manual Skills → selected extras absent on 2026-09-08. This slice implements registered user-source preparation and deterministic recovery. It does not establish desktop-loaded mode verification or change the retained memory/native-continuity policy.

## Scope

- Node.js 24+, local operation, no model/API-key requirement or hosted service. Existing diagnostic commands remain usable without browser dependencies.
- Normal restores the saved source contents. UNSEAL substitutes the fixed Unharness minimal guide for selected optional global instructions and makes selected enabled Skills manual-only. TRUEFORM suppresses the selected optional global instructions and disables selected Skills through user configuration. Sources originally disabled stay disabled in UNSEAL.
- The first writable instruction scope is the global Codex AGENTS pair. Project instructions stay untouched. The user declares that the selected effective global source is optional and user-added; a location is not that declaration. Mixed/mandatory global instructions remain unselected in this slice.
- Skill selection is explicit and limited to locally discovered user/repo sources. Provider/system/admin sources are excluded. Third-party additions may be declared user-added, but a provider-owned cache is not edited to force manual behavior. Unsupported metadata, links, managed sources and unavailable controls stay visible and block a plan that selects them.
- Hooks stay unchanged in this slice: the present API has no verified per-hook edit operation. Show that limit; do not turn off all hooks or mark an unsupported selected hook as removed.
- Memory, native continuity, managed configuration, execution permissions and unselected sources remain unchanged. Current tasks are not relabelled; successful writes mean next-task settings were prepared, with `runtimeStateVerified: false` and `modeSwitchingVerified: false`.
- Test filesystem behavior on native macOS. Windows uses portable paths and the same read/plan contracts, but real-source writes remain gated until its metadata/recovery behavior has native evidence. Synthetic fixture execution is a separate, explicitly owned test route.

## Fixed minimal guide

Ship `unharness-minimal-v1` with fixed UTF-8/LF content and SHA-256 identity:

```markdown
# Minimal working guide

- Follow the user's goal and the project's documented requirements.
- Inspect the relevant code and project information before changing behavior.
- Keep changes focused and preserve unrelated work.
- Verify results with checks appropriate to the change, and identify what remains unverified.
```

Record the guide ID, content hash, review date and official Codex/Claude guide references. It is Unharness-authored comparison material, not an official universal template or a performance promise. Show it in the UNSEAL customization disclosure. No model call generates or rewrites it during selection, planning or application.

For this initial version, `reviewedOn` is `2026-09-08`; references are `https://learn.chatgpt.com/guides/best-practices` and `https://code.claude.com/docs/en/best-practices`.

TRUEFORM writes a nonempty inert `<!-- -->\n` override when selected global optional instructions should be absent. An empty override would permit fallback. Normal restores the exact original override content or absence; the base AGENTS.md stays unchanged and guarded.

## Compilation

Compile every mode from one frozen Normal snapshot, rather than progressively modifying the previous mode. Registered sources carry content, absence, file metadata and role/ownership declarations tied to their hashes.

Use `yaml` 2.9.0 lazily for `agents/openai.yaml` edits. Change only `policy.allow_implicit_invocation`; validate all other resolved metadata before/after. Reject invalid documents, duplicate keys, aliases/tags that cannot preserve unrelated values and conflicting formats. Keep original bytes for Normal restoration. SKILL.md is captured and guarded but never rewritten merely to change invocation policy.

For TRUEFORM, build `skills.config` changes with the native Codex editor in a freshly owned temporary CODEX_HOME containing a private copy of the original TOML. Prefer `skills/config/write` with a selected exact Skill path and `enabled: false`; its implicit target is that owned copy, verified through native initialization and the user configuration layer before any write. This method has no version parameter, so use only the exclusively owned temporary profile. If a selected path has duplicate entries with any still enabled, use `config/batchWrite` for the single `skills.config` key, with the owned file path, expected version and `reloadUserConfig: false`, because the path-specific method updates only the first entry. Already-disabled selections require no write. These are the only allowed writes. In both cases validate the complete user layer and comment placement after all edits. Preserve every unselected entry and every other parsed configuration value; a native edit that loses or relocates comments remains unavailable. The private editor process cannot reload the user's desktop process. Read/write RPC transport remains separate from the existing read-only factory. Restore and recovery do not need Codex or YAML: their target bytes are already saved.

The local 0.153.4 schema/run confirms path-based Skill enablement, configuration `expectedVersion`, and null deletion. Arbitrary filePath writes are refused by the runtime; the editor must use its own temporary user configuration rather than assume it can edit a sibling staging file.

## Registration and storage

An explicit management launch binds one canonical Codex home, project and native executable. Discovery returns bounded local display names/IDs and capability reasons; browser input never contains arbitrary source paths. Detailed local registration information is a separate opt-in surface from the sanitized `inspect-sources` report.

Register only IDs from the current discovery and require the displayed discovery identity plus the user's user-added/optional declarations. Re-read sources before publication. Save a private, versioned Normal snapshot before any source mutation. Use the existing immutable local-store machinery in a dedicated user-source workspace so fixture records and validators stay isolated. A profile ownership manifest binds that workspace to the canonical home and prevents a second workspace silently capturing an already managed mode as its Normal.

Source text and configuration backups are private local records. Never return complete config.toml, hook commands, credentials or raw transcripts to the browser. The fixed guide and explicitly selected instruction/Skill review text may be shown locally as escaped text, bounded to the registered source; nothing is executed as content. Individual display names/paths are local setup data and are not added to public diagnostics.

Limits: at most 32 selected Skills, 128 KiB per source text and 768 KiB per snapshot. Reject over-limit sources without truncation. Reject final links, hard-linked write targets, unsupported metadata/ownership and redirected parents. Native real-source publication must preserve supported access metadata; unsupported filesystem cases remain unavailable rather than falling back to a weaker write.

On macOS, existing writable controls must have the executing effective UID and a reproducible effective/supplementary group. Check this before registration and before actual changed-file publication, including old plans and recovery. Retained read-only dependencies may have other owners. Portable read/plan admission is separate from this native write qualification; missing POSIX identity APIs do not enable publication on an unqualified platform.

## Plans, application and recovery

Persist a plan with exact before/after files, source dependencies, selected targets, guide identity and expected current state. Return a summary with changed file labels, planned Skill states, retained conditions and next-task requirement. No plan writes managed files.

Apply only that plan identity under an exclusive profile operation lock. Verify registered bindings, expected file contents/metadata and dependencies again. Publish an immutable pre-change checkpoint and a pending journal before the first managed write. Stage complete files on the relevant filesystem; recheck before publication, use exclusive creation for absent targets and preserve supported metadata for replacements. Order disabling configuration before restoring automatic metadata when entering TRUEFORM. Re-read all target files before recording completion.

The journal records both allowed sides of each write. Interruption can leave a before/after mixture and retained stages; a separate Node-only recovery command reverts known changes. Unexpected file bytes, links, metadata or a live/ambiguous lock owner block recovery. Do not delete unfamiliar leftovers, kill another process or silently overwrite independent edits. Recovery may report changed read-only source dependencies while reverting only unchanged control files; it must not claim the exact old favorite is restored in that case.

Normal and saved-favorite restoration use frozen content, including original absence. Keep previous versions. Saving the current prepared configuration is distinct from the automatic checkpoint. A new runtime/source version invalidates dependent classification/plans; old data remains readable. Power loss and hostile mutation of all filesystem ancestors are not a general guarantee; document the exact tested interruption boundary.

## GUI and CLI

An explicit `--manage-sources` launch enables the user-source workbench; read-only inventory launches retain their original behavior. The workbench uses the accepted Pixi scene with Normal / UNSEAL / TRUEFORM labels and a separate prepared-state/readback status. Keep fixture controls available as development diagnostics; never route a personal-source button into the fixture service.

Before registration, show one setup action and source selection with optional-role confirmation. After registration, ordinary use is mode selection, one reviewed prepare action, save and undo. Each release mode has a closed **対象を調整** disclosure for registered target selection and the fixed guide. Required/unsupported items are explained there, not exposed as working toggles. Memory/native continuity are retained information.

Every operation binds to metadata accepted by the UI and the server's launch identity. Refresh metadata before actions; a changed launch/home/project/workspace is shown before registration or application, including after failed metadata retrieval. Reuse operation IDs for a duplicate result and reject changed payloads. Do not automatically retry writes after uncertain transport failures. Preserve checkpoint/recovery access during failures.

Expose source registration/status/planning/application/favorites/recovery through deterministic core operations. Provide a Node CLI recovery route with structured resume/recovery arguments. No GUI or CLI operation starts a model task or dispatches a desktop task. A fresh desktop task is required for runtime evidence after preparation.

## Acceptance

1. Fixed guide identity; YAML policy-only edits preserve unrelated values; invalid/alias/conflicting metadata fails before managed writes; original disabled states are not activated.
2. Native editor changes only the owned temporary user config and selected Skill entries; original comments/protected values remain; child/process cleanup is bounded and read-only RPC stays read-only.
3. A synthetic profile runs register → UNSEAL → TRUEFORM → Normal → save/favorite restore → checkpoint undo. Exact original bytes/absence return. Independent edits, stale plans, duplicate callers, directory redirection and interruption block or recover as specified.
4. Native Mac metadata and interruption checks, full Node tests and GUI type/CSP/build checks pass. Browser registration/preview/prepare/recovery, failure/reconnect and narrow layout use owned data first.
5. The maintainer's real profile is discovered and can produce a concrete reviewable setup/plan. Do not select optional roles or apply it silently merely to claim a real configuration success. Report that boundary distinctly from the owned-profile test.
