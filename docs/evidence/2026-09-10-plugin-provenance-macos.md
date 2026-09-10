# Mac Codex plugin provenance investigation

Date: 2026-09-10. Source baseline: `2724739fc8805b19392d74028760a0f7cfd42c0e` on `codex/mac-finish`. This is the first investigation in the [official-plugin inheritance plan](../superpowers/plans/2026-09-10-official-plugin-mode-inheritance.md), not implemented eligibility, mode migration or a new support claim.

## Environment and operations

The selected installed application identifies as `com.openai.codex`, desktop version `26.903.61454`, build `8378`. Its bundled executable reports `codex-cli 0.153.4`. App-server TypeScript declarations were generated into a new private temporary directory with `generate-ts --experimental`; no generated protocol or personal catalog is committed.

The installed CLI's documented `plugin list --json` returned 40 installed entries. `plugin marketplace list --json` separately returned three local marketplace roots. A short-lived app-server then accepted only `initialize`, `plugin/installed`, `plugin/search`, `plugin/read` and `skills/list`, using the repository's bounded transport with an investigation-specific allowlist. It started no thread or model turn, installed no plugin and sent no configuration-write method. The process was closed afterward. The production read-only client and application adapter remain unchanged.

## What the native responses establish

| Observation | Consequence for the adapter |
| --- | --- |
| `plugin/installed` returned four groups: two local bundled/runtime groups, a remote curated group and a remote personal group; no marketplace-load errors | Remote source type alone cannot establish public-directory provenance. Retained provider sources and user-selected optional plugins need separate classification. |
| A `plugin/search` request with `scope: "global"` returned the public Superpowers entry with its remote identifier and advertised version `6.3.0` | An exact global result is evidence of a listing at that observation time. A name or locally supplied marketplace label is insufficient. |
| The matching installed entry had the same identifier/version and `installed: true`; the global search and `plugin/read` summary reported `installed: false` and `localVersion: null` | Directory results are not authoritative installation state. Join separate installation evidence, and keep absent local-version data unknown. |
| `plugin/read` listed 14 Skills with no local paths; `skills/list` returned 14 matching local Skill entries with the owning plugin ID | Map the local catalog separately. Never take a browser/AI-supplied path or infer an unregistered source from plugin selection. |
| The observed local compatibility manifest reported `6.3.0`, but the inspected protocol exposed no complete remote package content digest | Matching names and version strings do not yet prove that every installed file matches the public package. Full installed-content qualification remains unresolved. |

These are observations of the selected version, not stable public API promises. [The App Server documentation](https://learn.chatgpt.com/docs/app-server) marks `plugin/list` and `plugin/read` as under development and asks production clients not to use them yet. `plugin/installed` and `plugin/search` were present in the locally generated experimental declarations. Their use here does not authorize introducing them as an unconditional production dependency.

## Automatic-use control is still unqualified for plugins

The generated `SkillsConfigWriteParams` accepts a path or name selector and an `enabled` Boolean. It does not expose an automatic-only override. The [published configuration schema](https://learn.chatgpt.com/docs/config-schema.json) likewise gives `SkillConfig` only `enabled`, `name` and `path`; it does not allow an `allow_implicit_invocation` field in that record.

[Build skills](https://learn.chatgpt.com/docs/build-skills) documents `policy.allow_implicit_invocation` in a Skill's `agents/openai.yaml`: disabling implicit invocation preserves explicit invocation. That is Skill package metadata. It does not establish a host-level per-plugin override, or permission to rewrite provider cache files. Disabling the whole plugin, disabling a Skill, suppressing all Skill instructions and changing only automatic invocation must not be treated as equivalent controls.

The current Codex adapter explicitly excludes provider plugin IDs from registration and refuses to manufacture manual-only policy by editing plugin/cache content. Preserve those protections. New-policy enrollment, optional automatic selection and a reversible per-Skill control still need a supported integration; none is qualified by this investigation. The first implementation must keep unknown eligibility and unsupported control separate, even for a verified public listing.

## Source preservation and limits

Before the CLI inspection, 546 existing files were hashed: selected configuration/global-guide paths and discovered Skill, policy and plugin/marketplace manifests. The CLI-only comparison matched all 546. After the app-server investigation, configuration, the global guide and user Skill files still matched, but 27 files belonging to one old Codex Security cache version were absent. No surviving tracked file changed content in this sample. The active desktop's plugin catalog was also changing during this period; this observation does not attribute the cache removal to a particular process.

The investigation made no direct cache edits and did not restore or modify the host-owned cache. Because the interval includes that cache removal, it does **not** establish whole-profile filesystem immutability for the app-server calls. A product collector must pin identities, reject an unstable observation and qualify its native side effects in an isolated environment before use. Raw catalog responses, source hashes and local paths stay in the private evidence directory.

## Remaining work

- Establish a supported way to bind official listing evidence to the installed content revision, including changed packages, copied names, private entries and unavailable data.
- Establish automatic-only control for a registered plugin Skill while preserving explicit invocation, MCP, hooks, permissions and provider-owned files.
- Implement and test the fail-closed provenance projection, then derived inheritance and versioned storage. Synthetic positive fixtures will prove only that logic, not native official provenance.
- Continue the independent domain, art and installation work when those capability questions require external support or a product decision. Keep the new official-plugin policy unqualified until its own acceptance evidence exists.

## Follow-up source review and scope clarification

The same-day independent review was checked against the published source at `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a`. [SkillConfig](https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/config/src/skills_config.rs) has path/name selectors and enablement, consistent with the generated native types above. This supports the recorded lack of a qualified user-side invocation override in the inspected route; it is not proof that no other route exists.

[Remote installed-plugin synchronization](https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core-plugins/src/remote/remote_installed_plugin_sync.rs) can persist a remote ID and continue without downloading a bundle when the active local version matches the remote release version. A remote ID therefore must not be described as a download or full-content attestation. This is a source-level observation, not a reproduced Mac exploit or permission to inspect personal credentials.

The accepted [provenance contract](../spec-mode-inheritance.md) binds the host's public listing and installed state to the exact reviewed local Skill content revision. It does not require an independent proof that every file matches a public distribution digest. The earlier absence of a complete remote digest remains an observation, but does not by itself make official origin unknown. Current eligibility is still unqualified because the stable product-facing listing/install/local mapping has not been established. Invocation-change capability remains a separate unresolved condition.

The documented `plugin/skill/read` can be investigated as an additional Markdown comparison. Its generated parameters have no version selector, so a match cannot establish a full package or an exact installed release, and a mismatch can reflect an upstream version difference. That optional native call has not been executed in this evidence run. No new cache or configuration operation was performed for this follow-up review.
