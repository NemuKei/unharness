# Project status

As of 2026-09-24. Read [the documentation guide](README.md) for the canonical
contracts and [the continuity brief](handoff.md) when starting another task.
The current work is the 0.1.0 chat-led redesign on Mac Codex, followed by Mac
Claude Code (0.2.0), then Windows. The [Windows Codex handoff](handoff-windows-codex.md)
remains the entry for later Windows work; it does not qualify a Windows build.

## In development: 0.1.0 chat-led redesign (not released)

Spec: [chat-led redesign](superpowers/specs/2026-09-23-chat-led-redesign.md).
Plan and Codex handoff: [plan](superpowers/plans/2026-09-23-chat-led-redesign.md),
[handoff](handoff-chat-led-redesign.md). Implemented on `main` and verified with
`npm run check`, `npm run build`, `npm run build:site` and `node --test`
(Playwright browser tests skipped where the module is unavailable):

- Everyday wording: 零式 / 限定解除 / 通常装備 with one-line meanings; blocked
  reasons and failures in everyday words, codes under 詳しく.
- AI proposals: `propose_change`, `read_proposals`, `decide_proposal`. A proposal
  stores its basis and optional setup review; approval re-checks the basis, then
  applies setup, plans and applies in one step. Stale, double and interrupted
  approvals are handled.
- Home screen: current mode, 零式 and 限定解除 as everyday choices, Restore for
  通常装備, one confirmation sheet, a single failure notice with an automatic
  state re-read, and その他 (appearance first).
- First run: registration opens first with names and everyday descriptions;
  after saving Normal the screen guides to an AI-proposed 零式.
- Switch history (append-only) for per-mode usage estimates; failures to record
  it never fail a switch. Check-in after three days or five tasks.
- Retired: public-site operation and same-request replay. Existing receipts,
  starts and replay records remain on disk and do not block state, switching
  or recovery.

Not yet verified: Playwright browser tests, the real Mac Codex desktop journey
with a user's own configuration ([trial procedure](trial-0.1.0-mac.md)), and the
public-site demo update (plan Task 8).
The package is not released; 0.0.11 below remains the published preview.

## Published 0.0.11 Mac preview

The [0.0.11 Mac preview](https://github.com/NemuKei/unharness/releases/tag/v0.0.11)
is published from clean source `caad44a`. It includes the local GUI and mode,
settings, appearance and work-record improvements described below. The final ZIP,
7,551 indexed files, native update/failure recovery/v3 rollback, explicit v4
mode cycle and recovery after cache/data deletion passed. Anonymous download,
checksum and tag were verified before updating the public catalog.
See [the release evidence](evidence/2026-09-21-mac-0.0.11.md).

The site catalog now offers 0.0.11; actual packaged MCP checks return `current`
for 0.0.11 and `update-available` for 0.0.10. Personal plugin installation and
fresh-task loading remain separate and were not changed by publication.

## Published public-page refresh

The public-page and local UI/UX task results are integrated into the local
development checkout. The public site leads to local opening guidance; ordinary
visits register no operating tools and offer no new public pairing. Earlier
connection diagnostics and operation receipts remain in a separate legacy view.
A temporary status failure can recover through its existing unexpired grant.
The introduction and opening instructions now describe the distributed 0.0.11
package. Local installation and fresh-task loading remain separate checks.

Integration preserves the current runtime's retained-settings mode planning and
the older server's conflict gate. A reused operation UUID cannot bind an old
plan to a changed source-conflict condition. Its historical receipt stays
readable; changed source contents are still rechecked by the server before
application. The legacy launcher command returns a verified local URL and sends
only identity probes, without requesting pairing or approval.

The public site was deployed from clean source `aedb7b9` on 2026-09-21. All 49
served files matched the build, and live Japanese/English and narrow-screen
checks passed. The current local development GUI was also rebuilt and reopened
with its registered settings unchanged. See [publication evidence](evidence/2026-09-21-ui-publication.md).
The maintainer selected this scope; the 0.0.10 archive and installed plugin were
not updated, and no personal configuration was applied.

## UI/UX refresh included in 0.0.11

The 2026-09-21 development work keeps the existing local-first workbench and
its controllers while improving how users inspect, confirm and apply a saved
loadout. Modes now begins with a compact next-task summary, keeps the artwork
above the three configuration modes, places confirmation before long saved
contents, and keeps saved configurations and recovery nearby. Settings is
staged as inspection, AI consultation and local details. Work records retain
their separate ordinary-record and controlled-replay purposes.

The shared UI uses owned React/CSS primitives, semantic light/dark tokens and
short reduced-motion-aware transitions; it does not install Tailwind, Radix,
Motion or a new router/store. Prepared appearance identity changes only the
presentation accent. The update panel reports the displayed screen version,
leaves installed/latest versions unconfirmed and copies a request for the
existing AI update check. It adds no update HTTP route or external-proposal
inbox. See the [approved phased plan](superpowers/plans/2026-09-21-ui-ux-update.md).
The current local GUI runs from the development checkout, and the same features
are now in the 0.0.11 archive. The maintainer's installed plugin and personal
settings are unchanged; package and website publication have separate evidence.

Final integration validation passed type/CSP checks, local and site builds,
and the full Node suite: 1,418 tests, 1,330 passes, 88 skips and zero failures.
The obsolete launcher pairing assertion now tests the accepted local-entry
contract and observes identity probes without pairing/approval requests.

Built Chrome checks separately passed 87 expanded regressions with test-file
concurrency limited to two. After the final operation-ID fix, all four public
workbench cases passed, including real browser consumption of the retained-mode
capability and server rejection of a second source edit; the final-build public
artwork and lifecycle groups also passed 5/5 and 3/3. These public tests use a
synthetic HTTPS origin with routed transport, not live public TLS or native
local-network permission qualification. Pro's integration finding was reproduced
before the fix; its follow-up found no additional concrete P1/P2 in that change.

Unbounded browser batches exceeded image waits under load. Diagnostic runs
observed the same pending operations finish without another user action; the
bounded batch retains the original deadlines, assertions and intentional race
tests. This is a test-workload result, not a product performance repair. See
[the browser test procedure](../CONTRIBUTING.md#presentation-dependencies).
Coverage includes mode review/apply/Normal return, context replacement,
comparison/replay, appearances, Japanese/English, 390/536/1440 widths, light/dark,
reduced motion and keyboard use. Manual in-app checks on an owned synthetic
profile confirmed explicit application, persistent success feedback, narrow
Settings and Back, with no console warnings/errors. Native screen readers and
native 200% browser zoom remain untested. Packaging, installation and publication
remain separate; the integrated source is committed and pushed as `aedb7b9`.

## Custom UNSEAL guidance included in 0.0.11

Setup v4 can freeze user-confirmed additional instructions for UNSEAL. TRUEFORM
keeps no added instructions and Normal keeps its original saved contents.
Saving the pair and preparing a mode remain separate. The UI reads the saved
body as text, and old favorites, offline recovery and ordinary Skill inheritance
remain available. See [the contract](spec-custom-guidance.md) and
[verification](evidence/2026-09-20-custom-guidance.md).

The affected suite passed 177 checks; type/CSP/build and the built GUI journey
passed. The earlier full suite has one independently reproduced baseline pairing
failure after obsolete version assertions were corrected. Installation and
personal adoption are still separate: this does not qualify the newer native
Codex runtime or remove its saved dependency/version conflict.

## Simple mode screen included in 0.0.11

The 2026-09-20 follow-up simplifies the everyday screen to mode selection and
saved instruction/Skill contents. Records, appearance, settings, favorites and
recovery remain under More. A saved-mode selection previews only; change review
and application remain explicit. Text opens from the selected saved snapshot,
including through independent live edits. Normal and historical v1/v2/v3 modes
are not reinterpreted. Read-only CLI/HTTP/MCP operations share the Codex adapter;
no new Claude or native source-write qualification is claimed.
[Verification](evidence/2026-09-20-simple-mode-contents.md) records the scoped
automated checks, built-browser read/switch/recovery journey and preserved
saved source state. Personal modes were not applied; the evidence records the
separate configuration-digest boundary. The simplified development GUI is open; installation
and publication remain separate.

## Local entry and work records included in 0.0.11

The development workbench is now the everyday operating surface. Public pages
provide introduction, demos and install/update guidance; ordinary visitors do
not enter a public operating session. Earlier public receipts and bounded
compatibility remain available. See [local entry](spec-local-entry.md).

**記録・比較** now starts with named work records: select a recent task, save a
short outcome/note, open one record, or compare two or three. UUIDs and detailed
criteria are secondary, and controlled replay has its own entrance. Completed
work is frozen before assessment discussion; unknown/partial evidence remains
visible. See [work-record UX](spec-work-record-ux.md).

[September 20 verification](evidence/2026-09-20-local-work-record-ux.md) records
150 passing affected tests (31 optional browser skips), 26 passing MCP/legacy
checks, final type/CSP/local/site builds and manual built-browser journeys at
normal and 390px widths. Recent-task metadata was separately inspected on exact
Codex 0.155.0-alpha.9.2; this adds no source-write or desktop-mode qualification
for that version. The current development GUI was opened on the existing saved
workspace with configuration/source state unchanged. Installed plugin and
published package/site remain unchanged. The [execution plan](superpowers/plans/2026-09-14-local-workbench-comparison-ux.md)
is complete for this local development scope.

## Mode-switch improvement included in 0.0.11

The 2026-09-14 development change incorporates unrelated Codex settings into an
ordinary mode plan. Users select and confirm a mode without a separate common
settings/Normal-version decision. Selection and refresh leave active state and
files unchanged; confirmation freezes and preserves current shared settings in
the existing guarded transaction. Instruction/Skill changes and unprovable
differences still stop the operation. Earlier Normal/favorite versions and
offline recovery remain available.

Validation: 259 affected Node checks passed, with one non-macOS guard case
skipped on macOS. Type/CSP checks, local/site builds, and the built in-app GUI
passed: shared edit → select UNSEAL → confirm → common setting preserved;
independent instruction edit → mode controls blocked with a review path.
The normal side-pane and 390px layout showed no overflow or console errors.
These checks used synthetic profiles/native transports, not personal-source
writes or fresh desktop-model qualification. The [implementation plan](superpowers/plans/2026-09-14-retained-mode-switch.md)
records the scope. Installation, archive publication and public deployment are
unchanged; 0.0.10 and earlier installed builds still use separate reconciliation.

## Available now

The [0.0.11 Mac preview](https://github.com/NemuKei/unharness/releases/tag/v0.0.11)
is published. The agreed initial product scope is Apple Silicon
and Codex Desktop: save Normal, prepare the three supported modes, inspect fresh
task evidence, compare recorded work, reuse favorites and recover independently.
The [Mac qualification](evidence/2026-09-13-mac-codex-completion.md) is the
mode/control/recovery baseline and links earlier fresh-model and setup evidence.

The earlier 0.0.8 added fixed twelve-frame authoring, nine intermediate awakening poses,
outward crests and bloom, free appearance save/reselection and the 白銀/琥珀
examples. Its archive, installed native MCP authoring, personal-source/old-artwork
preservation and actual public HTTPS selection passed; see
[the motion evidence](evidence/2026-09-13-awakening-motion.md).

The public introduction subsequently changed to three columns at widths of
960px or more: default, 白銀 and 琥珀 share mode/effects controls. Smaller screens
retain the character chooser. This was a site-only update; the 0.0.8 archive and
personal configuration were not changed for that layout work.

The repository's introduction leads with “モデルは変わった。装備は、そのまま？”
and shows the same four functions through screen and chat entry points. The
local/public workbench uses mode/settings/appearance pages, nearby mode
confirmation and actionable blocked states. Initial registration and local
approval remain explicit; conflicts offer an AI inspection prompt without
enabling a source write. These UI and management-Skill changes first shipped in
0.0.9. Version 0.0.10 adds the bilingual product journey, Codex draft handoff and
read-only update discovery. The public site now serves that interface and the
verified 0.0.11 download with the updated local-opening guidance.
Its isolated native installation,
packaged MCP and archive checks are recorded in [the release evidence](evidence/2026-09-14-workbench-release.md).
The published snapshots below remain independent.

## Release and site are separate snapshots

| Surface | Verified revision | Evidence |
| --- | --- | --- |
| Published 0.0.11 package | caad44acaddfe58ba8e29e03e15d3a973a6092df | [Archive and isolated native checks](evidence/2026-09-21-mac-0.0.11.md) |
| Public local-opening guide, demo and 0.0.11 catalog/download | cd7275398a36b56b99ee47bde724c1aee7ba2b3e | [Publication checks](evidence/2026-09-21-mac-0.0.11.md) |
| Current repository | Re-read main/remote and local changes | Later documentation commits do not rebuild the archive or redeploy the site |

The latest site deployment is 591ce410-062e-4438-aed5-b5776824f651 on the dedicated
`deltahelmlab-unharness` Pages project. All 49 served files matched its build.
Release availability, published asset digests and the anonymous download were
rechecked for 0.0.11. The installed personal profile was not updated by this
release task.

## Current limits

The accepted [guided-entry concept](guided-entry-preview.md) now shares its draft
handoff and sample experience with the [production implementation](guided-product-entry.md).
The real workbench, installation and recovery journey support Japanese/English.
The management MCP adds read-only update discovery and distinguishes running
metadata from host selection and fresh-task loading. Its dated build/native and
publication boundaries are recorded in [guided-product evidence](evidence/2026-09-14-guided-product.md).
The published package/site rows above remain authoritative until replaced by
verified publication evidence.

- Individual remote-plugin OFF is unavailable on the qualified Codex 0.153.4 and is deferred by the maintainer. Unsupported forward OFF plans stop before source writes.
- Prepared files, recorded selected inputs and unknown whole-plugin runtime remain distinct. No performance improvement is promised or inferred from a lighter configuration.
- macOS 26.6.2 on Apple Silicon is the qualified platform. Exact desktop/native versions are recorded in the evidence. Intel Mac, Claude Code and Windows are not added by these results.
- Independent edits require review; recovery never silently overwrites them. The management and recovery entrance remains available across supported modes.

## Deferred work

On 2026-09-24 the priority became **Mac Codex redesign (0.1.0) → Mac Claude Code (0.2.0) → Windows** (see [delivery](delivery.md)). After 0.1.0, resume Claude Code's existing adapter and [native qualification](claude-native-qualification.md). Both applications on macOS and Windows remain the target. Preserve existing adapters and evidence boundaries; this order does not establish new support. Reusable artwork packs and a public gallery remain separate future decisions. See [delivery](delivery.md), [compatibility](compatibility.md) and the [completed Mac experience plan](superpowers/plans/2026-09-09-mac-product-experience.md).
