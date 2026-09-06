# Feasibility and limits

Assessment recorded on 2026-09-06, before starting another runtime slice. The maintainer asked which parts are feasible and which compromises must be understood first. This page distinguishes implementation prospects from observed support. The runtime remains the read-only inventory probe.

## Cost boundary is feasible

The user explicitly confirmed that their existing AI costs are separate. Unharness itself can be free with no required paid API, hosted backend, or recurring operator service expense by running the control/storage/UI/rendering/export components on the user's computer. Prepared/procedural pixel art can produce three candidates locally; optional authoring or judging through the user's own AI consumes that environment's allowance. No Unharness-funded model service is needed.

Do not rely on a third-party free-tier quota to call this zero recurring cost. A local web interface and CLI avoid requiring a managed cloud runtime. Installer signing, automatic distribution, and other packaging choices must be assessed against the same constraint before becoming dependencies. Maintaining compatibility with app updates still requires development work; zero service fees does not mean no maintenance.

## The central unresolved gate: desktop control and evidence

The [Mac probe](evidence/2026-09-06-codex-macos.md) successfully read configuration/skill/hook inventory from a separately started Codex App Server. It did not attach to the active desktop session, change a setting, start a model task, verify a mode, or collect desktop task usage. Windows has not yet supplied a real probe result. Claude Code integration remains unimplemented.

The full product cannot yet be promised merely because local settings files can be edited. The next scoped investigation must determine:

1. Which optional sources the real desktop task loads, including app/plugin-provided sources outside standalone discovery.
2. Which of those sources can be managed without changing fixed instructions or permissions, and whether the scope is task-local or affects other tasks.
3. How a fresh desktop task receives the prepared settings, whether a restart/manual step is needed, and what observable evidence confirms the state.
4. Whether restore can preserve unrelated edits, and whether the selected task's usage, retries, and child tasks can be observed sufficiently for the intended metrics.

Continue toward full desktop support only with concrete results for these boundaries. A manual restart/new-task step may be an acceptable integration outcome, but must be reflected in the workflow. If required sources cannot be controlled or observed, expose the limit and revisit the supported scope with the maintainer; do not label partial control as verified TRUEFORM or silently substitute CLI-only work for the agreed desktop product.

## Limits to accept upfront

| Area | Feasible target | Limit |
| --- | --- | --- |
| Zero and UNSEAL | Manage registered optional sources and verify supported states for a fresh task | No promise to erase instructions already loaded into the current conversation, remove provider/managed rules, or unload every host-injected source |
| Numerical comparison | Observed token/time/attempt data, acceptance checks, and task-specific scorecards | Complete desktop usage still needs a live test; missing fields and child usage remain unknown rather than invented totals |
| Quality | Fixed task criteria and distinguishable human/AI judgments | No universal objective quality score or guarantee that one loadout is generally superior |
| Artwork | Local prepared/procedural variety, three candidates and one saved identity, optional user-AI authoring | A finite art system has finite expressive range; random combinations are not proof of worldwide uniqueness |
| Remake rule | Three candidates and a final choice enforced by normal GUI/AI operations | Local OSS files/code can be changed; the rule is not tamper-proof scarcity |
| X sharing | Save a PNG and open editable prefilled post text, with the user attaching the image and publishing | The basic Web Intent has no image-attachment parameter; opening it is not proof of a completed post |
| Portability | Separate adapters and OS boundaries tested on macOS and Windows | Native Windows, WSL, Codex, and Claude Code are distinct verification cases |

The [Codex skill guide](https://learn.chatgpt.com/docs/build-skills) explicitly calls for a restart after changing skill enablement in configuration. The [App Server guide](https://learn.chatgpt.com/docs/app-server) documents token-usage events, but that documentation does not establish access to the active desktop's events. [X's Web Intent parameters](https://docs.x.com/x-for-websites/post-button/guides/web-intent) establish the text/URL handoff boundary.

## What has been adopted

Random default appearance → sufficiently evidenced performance condition → voluntary original creation → three candidates → one final choice → local save and optional X sharing. Technical retries preserve already valid candidates, and a distinct later achievement may yield a new form. These decisions and the cost boundary are accepted targets; they do not mean the desktop integration or appearance runtime has passed implementation acceptance.
