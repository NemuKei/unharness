# Legacy Mac directory reattestation

Date: 2026-09-11 (JST). This development change implements the [explicit rebind contract](../superpowers/specs/2026-09-11-legacy-directory-rebind.md) for old Mac Codex registrations. Package metadata advances to **0.0.2** for the new candidate; the published 0.0.1 archive is unchanged. This checkpoint covers synthetic transactions and a real-source review, not personal rebind application or the complete Mac product.

## Behavior

The local `review-rebind` and `apply-rebind` operations create a distinct `registration-rebind` generation under the same workspace/root. Same path/inode, current persistent identities, registered sources and recorded owned directories must match. Historical device-number bindings remain immutable and historical volume continuity stays unverified. Review can recognize a retained-only edit but cannot adopt it. Adoption requires explicit current-location confirmation, changes only records, invalidates stale scope/preparation state and preserves Normal/snapshot/history identities.

The existing retained-setting acceptance and Normal/favorite restoration remain separate. Old favorites crossing only a rebind show the directory-reconfirmation reason; real Skill additions still show enrollment. Subsequent enrollment creates its own ordinary registration generation and retains the rebind ancestor. A pending rebind cancels through the existing offline recovery entry, including a partial manifest/state transition.

## Verification

Ten new cases use records produced by the actual pre-UUID writer at `ba64cebbdc2a17179b13a6281668f75fb35dc668`. A test-only Node import makes that isolated historical process observe a different directory device number; source files and immutable records are not rewritten to invent a legacy format. The exact locked YAML, image-decoder and retained-merge dependencies are supplied to that old copy. Current production code has no test override or bypass input.

Coverage includes:

- Original Normal and an already adopted retained-settings Normal, old favorite contents, prepared snapshot and reservation stay unchanged during rebind. Independent retained edits remain a conflict until separately reviewed and accepted; the historical favorite then restores Normal while preserving those edits.
- Same-inode missing/owned-directory handling, unrecorded directories, managed edits, changed review inputs/state, explicit confirmation and duplicate adoption.
- A rebind review cannot claim another registration root. This additional test first failed, then passed after lineage validation checked the actual root.
- Journal, manifest and state interruption boundaries cancel without a catalog/YAML dependency; source edits made during the interruption remain untouched. Unknown stages prevent partial cancellation.
- Both the historical writer and the published `c81ee9c` reader fail specifically with `workspace-invalid` before source writes; missing dependencies are not accepted as proof of refusal.
- Old setup, saved-start and artwork records remain readable; v2 setup and later Skill enrollment work, and the old favorite still restores through that lineage.

The focused source/retained/enrollment/CLI/UI suite passed **75 tests**, no failures or skips. An additional variant with a previously adopted retained Normal passed separately, then the complete suite passed **1,078 of 1,143 tests**, no failures, **65 optional/platform skips**. Type/CSP and both builds passed. The established independent reviewer found no blocking issue, independently passed four cancellation cases and verified a second cancellation after an injected manifest-rename failure; source bytes remained unchanged.

The maintainer's actual registration was reviewed with the native Codex 0.153.4. Its recorded runtime version matches. Existing target/owned-directory inodes matched, the sole file difference was the retained configuration, and the existing native retained merge succeeded. The new review left source files, UNSEAL revision 15 and the original conflict unchanged. No current location or retained edit has been applied by this review.

## Remaining steps

Build and verify the independent 0.0.2 candidate before personal adoption. Then accept only the reviewed current locations, separately reconcile retained settings, restore Normal and verify original/history identities. Plugin bindings are a separate check; no saved plugin-context or plugin-scope record was found for the maintainer's existing direct registered-source MCP. Fresh Desktop model tasks, installed-package onboarding and official-plugin control remain separate goal requirements.

No personal paths, source bodies, raw task records, connection secrets or private review artifacts are included here.
