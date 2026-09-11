# Explicit recovery of legacy Mac directory bindings

The old Mac registration records a boot-local device number and inode. A later device-number change correctly makes its existing writer stop. New registrations already use a persistent volume UUID and inode. Recovering an old registration must preserve its historical uncertainty and all saved source content.

This is a focused extension of registered-source recovery. The maintainer authorized all gates needed for the Mac completion goal; that authorization does not permit independent source edits to be overwritten or historical UUID evidence to be invented.

## Selected design

| Option | Result |
| --- | --- |
| Rewrite old bindings or relax matching | Rejected: changes immutable evidence or silently trusts another directory |
| Register a separate workspace from current files | Rejected: would risk adopting a prepared release mode as Normal and separate existing favorites/history |
| Record a new, explicitly confirmed registration generation | Selected: preserves the old records/root collection while giving future operations a reviewed current identity |

The new child scope has role `registration-rebind`. It keeps the same workspace, root, context, runtime version, registered paths, source IDs, roles, source digests and original Normal ID. It records `parentScopeId`, `parentNormalId` and a rebind review ID. Its bindings differ only by replacing eligible legacy identities with the currently observed UUID and the same inode. Existing persistent identities must still match exactly.

An eligible legacy directory must be canonical, currently a directory, at the same path and inode, with a supported persistent identity. Missing-parent bindings retain their original ancestor and missing-path list. Only previously recorded `ownedDirs` may authorize a now-existing formerly missing parent; their same-inode identity is reattested without granting new directory ownership. Relocation, replacement, symlinks and unknown directories are refused.

Review captures only registered files. They must match the current prepared snapshot except for the application's retained configuration file. Any difference there must pass the existing native retained-settings merge and runtime-version check. Review does not adopt that edit, change Normal or modify a source. Source/setup/retained/enrollment journals, active replays and artwork recovery prevent adoption.

Applying the reviewed location requires `confirmedCurrentLocations: true`, rechecks the complete state, paths, identities, files and metadata under the existing lock, and changes records only. The state selects the child scope, advances its revision, reattests existing owned directories, clears current observation/plans and active setup selection, and requires a new preparation. Current source snapshot and Normal references remain unchanged. Old setup records remain readable as history; new release-mode use requires a v2 setup review.

The existing v2 manifest is published before selecting the child. Pre-v2 writers reject that manifest; the currently published reader rejects `registration-rebind`. Existing registration/enrollment checks remain strict. Enrollment after rebind creates an ordinary registration generation and must not inherit the rebind marker accidentally.

A dedicated journal records exact before/after state and manifest. Interruption recovery cancels only record changes, writes the previous state before removing the writer fence, preserves independent edits and rejects unknown stages. No catalog or native compiler is needed for cancellation. Stale plans and public grants cannot operate the new scope.

After rebind, retained edits still produce a conflict. The existing `plan-retained` / `accept-retained` flow adopts them separately, followed by a reviewed Normal or favorite restore. Historical restores use current approved directories and identify directory rebind separately from Skill enrollment. Old Normal/favorite/checkpoint/comparison/artwork records keep their IDs and contents.

## Local maintenance interface

Use the existing Node.js 24+ CLI and JSON contract, with no additional dependencies or configuration precedence:

- `sources review-rebind --json {"workspace":"<registered-workspace>"}` saves a bounded review and returns its ID, target directory identities, unchanged source count and whether a retained edit still needs adoption.
- `sources apply-rebind --json {"workspace":"<registered-workspace>","reviewId":"<64-hex-id>","confirmedCurrentLocations":true}` accepts only that review and returns the new scope/revision with `sourceFilesChanged: 0` and unverified runtime state.
- `sources recover` cancels a pending rebind with the existing offline recovery entry.

Stdout remains one JSON result, stderr one bounded JSON error, with the existing exit-code behavior. No prompt, generic force flag, arbitrary replacement path, public WebMCP capability or automatic migration is added. This maintenance route is for old development registrations; the published new-installation flow continues to capture persistent identities normally.

## Required evidence

Tests must cover strict refusal before confirmation; exact source/Normal/history preservation; same path/inode and missing/owned-directory checks; retained edits remaining separate; managed edits and changed review inputs refused; duplicate adoption; child-lineage corruption; subsequent enrollment; old writer refusal; and cancellation at journal, manifest and state boundaries, including foreign stages and independent edits. Native verification follows only after those pass and must re-read the selected real sources without publishing their bodies.

Plugin context/recovery bindings are a separate boundary. They are inspected before reuse; a healthy direct registered-source MCP needs no invented plugin migration. A legacy plugin binding cannot be repaired by editing its old record or reusing a conflicting recovery record. Such a finding requires its own bounded implementation and evidence.
