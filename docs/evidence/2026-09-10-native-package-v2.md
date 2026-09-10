# Native Mac package, saved v2 setup and artwork

Date: 2026-09-10. Environment: macOS arm64, Codex Desktop `26.903.61454` build `8378`, its bundled CLI/app-server `0.153.4`, and bundled Node.js `24.20.0`. A new owned Codex profile, project and personal marketplace were used. The actual Codex in-app browser displayed the installed package and independent recovery screen. No model turn, personal-profile registration or public deployment was performed.

## Package identity and loading

The original-authoring Skill now uses Codex's `agents/openai.yaml` explicit-invocation policy. The plugin validator rejected the additional Claude-specific `disable-model-invocation: true` frontmatter. Commit `581c8b6c098cd9e5de7e4ad3d575f2a0539287fb` removes that field while preserving `allow_implicit_invocation: false`; Claude packaging remains a later qualification. All 15 authoring contract checks, the official plugin validator and the three Skill validators pass.

| Artifact | Identity |
| --- | --- |
| Canonical package after the rendering fix | Source `a3a3af9d0d2e10a588451e5666dfd4d92ae01432`, version `0.0.1`, `sourceDirty: false` |
| Canonical distribution ID | `c9a5cb0ab0c94921f191ccd7b3e4c804e78b267fffbd199ae1478dbfd12e1bdb` |
| Native update test version | `0.0.1+codex.20260910132826` |
| Native update distribution ID | `1bd57fa046b3bb05aa9dcddfa210b246806bc12da8befda55655c9902ca12e4d` |

The development update is a new copy with the official cachebuster applied and portable/plugin/package versions synchronized before indexing. It is separate from the unchanged canonical package. Each contains 7,392 indexed files. Native installation and subsequent integrity reads matched their selected identities.

The official Node archive matched the pinned [release checksum](https://nodejs.org/dist/v24.20.0/SHASUMS256.txt). The extracted executable is 121,911,744 bytes; its Node.js Foundation Developer ID signature passed `codesign --verify --strict`. This check does not establish downloaded-package Gatekeeper behavior.

The native loader listed management, setup and original-authoring Skills under the installed plugin and exposed 62 local MCP tools. Native MCP reported the exact owned data directory. The installed wrapper configured that selected profile/project with a PATH containing only macOS system directories, opened the bundled workbench, and preserved the source files. Installation does not require a system Node executable in this checked route.

## Initial Normal, setup and source preparation

The in-app screen initially showed unregistered state. Its discovery included 51 candidates; only the newly created optional global guide and `example` Skill were selected. Other candidates remained unselected, and the management entry remained protected.

Native MCP saved a Normal favorite before v2 adoption, then reviewed and saved an empty TRUEFORM set with one owned Skill added in UNSEAL. The inventory had no qualified official plugins. Saving preserved the source-file bytes and metadata and left Normal prepared; the workspace revision advanced for the saved-record boundary. The screen observed the saved setup and favorite without reopening.

The updated package then completed this scoped mixed-entry sequence:

| Entry and preparation | Original optional guide in input | Owned example in automatic catalog | Management in catalog | Required project guide |
| --- | --- | --- | --- | --- |
| Initial Normal | Present | Present | Present | Preserved |
| GUI → TRUEFORM | Absent | Absent | Present | Preserved |
| Native MCP → UNSEAL | Absent; fixed guide prepared | Present | Present | Preserved |
| GUI → TRUEFORM | Absent | Absent | Present | Preserved |
| Native MCP → pre-v2 Normal favorite | Present | Present | Present | Preserved |

Each row uses a fresh native `debug prompt-input` read with hooks and memories disabled consistently for the diagnostic process. The synthetic profile's saved memory, permission and model settings stayed unchanged. Raw prompt text was parsed in memory and not retained. These are input-preparation observations; explicit Skill invocation and completed fresh Desktop model tasks require their own evidence. Setup and original-authoring Skills remained outside the ordinary automatic catalog.

The old Normal favorite restored exact managed-file bytes and metadata. The saved v2 setup and all three appearance items remained available. Empty official selections exercise the supported empty-set rule; they do not qualify a nonempty official-plugin selection or automatic-only plugin control.

## Local artwork through both entry points

Native MCP issued and reread an authoring place and reviewed its two selected PNG slots. The inputs were synthetic blue-rectangle and solid-background fixtures, each 724 × 724. The in-app file chooser selected those same files. The screen displayed all three composed modes before saving the first layered item.

For the next version, MCP issued a place based on the saved item and reviewed the same entity image. Its complete normalized manifest matched the image set already inspected in the three previews. MCP saved the new version; the open screen reflected its name. The collection retained the original prepared recipe, the first layered item and the derived version. These actions preserved configuration files and the prepared mode.

A native rendering failure was found during this sequence: closing a preview could invalidate another scene's batches. The captured exception was `Cannot read properties of null (reading 'ids')` in Pixi's `checkAndUpdateTexture`. The installed Pixi implementation releases global pools when the first `Application.destroy` argument is `true`. Commit `a3a3af9` makes teardown remove only that scene's view and owned resources, keeping shared pools available to other scenes.

Type/CSP checks, both production builds and 41 affected renderer/artwork/card checks pass without skips. Added Chrome checks cover repeated preview destruction, visible thumbnails and the main image after reselection; they passed before the fix too, so the actual in-app failure provides the counterexample. After installing the corrected package, the in-app browser selected old layered → derived layered → legacy recipe → old layered. All four selections retained a visible main rendering. Thumbnails also displayed, and stored package contents stayed unchanged.

## Independent recovery after removal

The corrected package prepared its indexed recovery copy outside the plugin cache. With TRUEFORM prepared, the owned native CLI removed the plugin and its installed cache. The removal changed only the plugin portion of the synthetic configuration; model, memory and permission settings stayed the same.

The independent copy started its recovery screen using its bundled runtime and a system-only PATH. The in-app screen detected the retained-setting conflict and held restoration. After checking and explicitly accepting that removal state, it offered a Normal plan affecting only the added guide and Skill invocation policy. The screen restored Normal.

Independent readback found Normal at revision 8, no conflict or pending recovery, the original optional-source bytes/metadata restored, and the uninstall configuration preserved. The v2 setup, three artwork items and historical favorite remained readable. The recovery copy still matched its distribution identity.

This run used the independent local process with the plugin cache absent. The Mac's network was not disabled, and Finder double-click launch was not tested. [Earlier recovery evidence](2026-09-09-plugin-recovery-macos.md) and automated interruption/conflict checks retain their stated scopes.

## Remaining qualification

The public HTTPS connection, public artwork client, end-user download/install route, actual fresh Desktop model journey and nonempty official-plugin controls remain open. This package checkpoint adds native loader/MCP, in-app UI, saved-data and independent-recovery evidence. It does not complete the Mac release or extend support to Claude Code, Intel Macs or Windows.
