# Legacy Mac directory reattestation

Date: 2026-09-11 (JST). This development change implements the [explicit rebind contract](../superpowers/specs/2026-09-11-legacy-directory-rebind.md) for old Mac Codex registrations. Package metadata advances to **0.0.2** for the new candidate; the published 0.0.1 archive is unchanged. The follow-up below adds actual personal recovery without claiming the complete Mac product.

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

## Actual registered-source recovery

An independent 0.0.2 candidate was assembled from clean source `943b77c3dc843f1d9ff4983fcf89129fd3b94cba`. Distribution `0070fe477ccda934c0faa30ea512b278fd44ae76081a8b22c1930a594d90128d` validates 7,412 indexed files and its bundled Node signature. Operations below used that copy rather than a modified installed cache.

The maintainer's authorized current-location review was adopted. All six registered source files/absence and supported metadata stayed unchanged, as did the original and active Normal references, original reservation and **385 existing immutable records**. Only the current directory generation advanced, to revision 16; the retained configuration still correctly reported a separate conflict.

The existing retained-settings flow then recorded the independently edited common configuration without changing a source file, advancing to revision 17. The actual Codex in-app browser displayed the two-file Normal restore: the global instruction override and registered Skill invocation policy. Applying it ended at **Normal revision 18**, no conflict or pending recovery. Independent readback exactly matched the accepted Normal snapshot, all 385 earlier records still matched their pre-operation hashes, and six old favorites remained available. No source role or target was added during recovery. The separately confirmed external origin of the existing optional Skill is for the next setup consultation.

No saved plugin-context or plugin-scope record was found for this existing direct registered-source MCP. Its already-running old reader correctly rejected the new registration role; its cached connection is not treated as the updated package connection. Fresh installed-plugin initialization and Desktop model tasks remain next.

## GUI follow-up

The native screen exposed enrollment-specific wording after a directory-only rebind. Shared pending-preparation and setup handoff text now describes a registration update without claiming that Skills were added. A built-browser case reproduces the same-source-count rebind, checks the wording and restores its historical Normal.

Broader browser QA also found that a prior auxiliary-operation guard rejected successful enrollment's expected scope change. Enrollment now passes the explicitly reviewed next scope to a dedicated client path. The client requires the same launch/home/project/runtime/workspace, matching review/parent/root/next scope, the expected new revision/Normal and a successful record-only result. Its context ID must change because the backend hashes the active scope into that ID. Other operations retain their ordinary context-ID guard. Accepted changes invalidate old polling/artwork reads as well as cached history.

An initial matcher incorrectly required unchanged context IDs; independent review found this, the unit fixture was corrected to reproduce the failure, and the matcher was fixed. **51 client/built-browser checks pass with no skips**, including fifteen transition checks, v1/v2 enrollment, lost-response handling, directory-only rebind, setup handoffs and artwork boundaries. Type/CSP and both builds pass. The lost-response case permits a disabled or removed submit control, but still requires no enabled retry, one request only, preserved source files and an explicit state refresh. No transition from an unreviewed context is admitted.

The next immutable candidate includes this GUI follow-up. Fresh Desktop model tasks, installed-package onboarding and official-plugin control remain separate goal requirements.

No personal paths, source bodies, raw task records, connection secrets or private review artifacts are included here.
