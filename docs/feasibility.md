# Feasibility and limits

Assessment recorded on 2026-09-06. The maintainer asked which parts are feasible and which compromises must be understood first. This page distinguishes implementation prospects from observed support. The runtime contains inventory, source-control and desktop-record diagnostics with a persistent synthetic fixture; full desktop mode application remains unverified.

The maintainer accepted these limits and selected clipboard-image copy plus an editable X composer with the public OSS link as the initial sharing workflow. This acceptance permits development within the stated boundaries; it does not replace desktop or browser verification.

## Cost boundary is feasible

The user explicitly confirmed that their existing AI costs are separate. Unharness itself can be free with no required paid API, hosted backend, or recurring operator service expense by running the control/storage/UI/rendering/export components on the user's computer. Prepared/procedural pixel art can produce three candidates locally; optional authoring or judging through the user's own AI consumes that environment's allowance. No Unharness-funded model service is needed.

Do not rely on a third-party free-tier quota to call this zero recurring cost. A local web interface and CLI avoid requiring a managed cloud runtime. Installer signing, automatic distribution, and other packaging choices must be assessed against the same constraint before becoming dependencies. Maintaining compatibility with app updates still requires development work; zero service fees does not mean no maintenance.

## The central unresolved gate: desktop control and evidence

The [Mac probe](evidence/2026-09-06-codex-macos.md) successfully read configuration/skill/hook inventory from a separately started Codex App Server. It did not attach to the active desktop session, change a setting, start a model task, verify a mode, or collect desktop task usage. Windows has not yet supplied a real probe result. Claude Code integration remains unimplemented.

The subsequent [fixture investigation](evidence/2026-09-06-source-controls-macos.md) verified selected source controls in a separately rendered CLI input: manual-only catalog exclusion, effective file-based skill disablement, fixed-only AGENTS override, and restoration of marker visibility. It changed only temporary test files. These results support implementation of source controls but do not answer the actual desktop-loading boundary below.

A subsequent [desktop-record observation](evidence/2026-09-06-desktop-observation-macos.md) confirmed that this actual Mac task's initial recording contains host-provided Skill and memory guidance, and that usage records contain recognized fields. A bounded local reader and synthetic fixture/recovery commands are implemented. A later [fresh-task sequence](evidence/2026-09-06-desktop-fixture-macos.md) observed the synthetic source changes, explicit literal Skill invocation and refresh-assisted restoration. New tasks sometimes retained a stale catalog, so the implementation keeps a pending/unverified state until actual input is observed. A user-created task and one owned-file mtime notification trial restored visibility without an app restart. These results do not establish complete source control, a general refresh guarantee or usage totals.

The full product cannot yet be promised merely because local settings files can be edited. The next scoped investigation must determine:

1. Which optional sources the real desktop task loads, including app/plugin-provided sources outside standalone discovery.
2. Which of those sources can be managed without changing fixed instructions or permissions, and whether the scope is task-local or affects other tasks.
3. How a fresh desktop task receives the prepared settings, whether a restart/manual step is needed, and what observable evidence confirms the state.
4. Whether restore can preserve unrelated edits, and whether the selected task's usage, retries, and child tasks can be observed sufficiently for the intended metrics.

Continue toward full desktop support only with concrete results for these boundaries. A manual restart/new-task step may be an acceptable integration outcome, but must be reflected in the workflow. If required sources cannot be controlled or observed, expose the limit and revisit the supported scope with the maintainer; do not label partial control as verified TRUEFORM or silently substitute CLI-only work for the agreed desktop product.

The maintainer clarified that initial use selects one mode at a time. Simultaneous multi-mode dispatch is not required. The [App Server thread APIs](https://learn.chatgpt.com/docs/app-server) provide a way to address separate conversations, but do not establish independent desktop harnesses or memory for concurrent trials. Sequential use avoids requiring that concurrent boundary, while source discovery, fresh-task application, restoration, and honest measurement still need verification.

## Limits to accept upfront

| Area | Feasible target | Limit |
| --- | --- | --- |
| Zero and UNSEAL | Manage registered optional sources and verify supported states for a fresh task | No promise to erase instructions already loaded into the current conversation, remove provider/managed rules, or unload every host-injected source |
| Numerical comparison | Observed token/time/attempt data, acceptance checks, and task-specific scorecards | Complete desktop usage still needs a live test; missing fields and child usage remain unknown rather than invented totals |
| Quality | Fixed task criteria and distinguishable human/AI judgments | No universal objective quality score or guarantee that one loadout is generally superior |
| Artwork | Local prepared/procedural variety, three candidates and one saved identity, optional user-AI authoring | A finite art system has finite expressive range; random combinations are not proof of worldwide uniqueness |
| Remake rule | Three candidates and a final choice enforced by normal GUI/AI operations | Local OSS files/code can be changed; the rule is not tamper-proof scarcity |
| X sharing | Copy a PNG to the clipboard and open template text plus the public OSS URL; the user pastes and publishes, with image saving as fallback | Clipboard/gesture/popup support needs browser verification; the Web Intent does not attach an image and opening it does not prove publication |
| Portability | Separate adapters and OS boundaries tested on macOS and Windows | Native Windows, WSL, Codex, and Claude Code are distinct verification cases |

The [Codex skill guide](https://learn.chatgpt.com/docs/build-skills) explicitly calls for a restart after changing skill enablement in configuration. The [App Server guide](https://learn.chatgpt.com/docs/app-server) documents token-usage events, but that documentation does not establish access to the active desktop's events. [X's Web Intent parameters](https://docs.x.com/x-for-websites/post-button/guides/web-intent) establish the text/URL handoff boundary.

## What has been adopted

Random default appearance → sufficiently evidenced performance condition → voluntary original creation → three candidates → one final choice → local save and optional X sharing. Technical retries preserve already valid candidates, and a distinct later achievement may yield a new form. These decisions and the cost boundary are accepted targets; they do not mean the desktop integration or appearance runtime has passed implementation acceptance.

Adopted forms become reusable collection items. Confirmed adverse performance restricts their active presentation to BAD variants, with neutral treatment when evidence is unknown. Different ordinary tasks do not by themselves establish a mode regression; that filter still needs applicable evidence. Acquisition is retained even when a current treatment cannot be equipped.
