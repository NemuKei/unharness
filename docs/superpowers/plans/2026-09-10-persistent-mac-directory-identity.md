# Mac directory identity across restarts

This repairs the accepted requirement that saved configuration and independent recovery remain usable after restart. It does not authorize changing the maintainer's real registration or configuration.

## Observed failure

A read-only check of an existing Mac registration returned `source-redirection`. Its canonical directory paths and inode numbers matched, while the stored device number differed from the current one. The registration had no persistent volume identifier. A changed device number alone is insufficient evidence either to reject a new correctly identified volume or to trust an old unqualified one.

## Bounded repair

1. Add an OS/filesystem boundary for persistent Mac directory identity. Read Foundation's persistent volume UUID and persistent-file-ID capability through a fixed, read-only system command. Pass paths as arguments; never interpolate them into a program. Keep canonical paths, directory type, inode, ownership and before/after checks. An unavailable persistent identity must not silently become a weaker modern identity.
2. New source registrations and transaction-owned directories record the volume UUID beside their inode. A matching UUID/inode survives a changed boot-local device number; changed UUIDs, replaced directories and symlinks remain rejected. Preserve the UUID through journals and recovery. Keep transient within-operation `stat` checks unchanged.
3. New plugin context, scope and recovery identities omit the boot-local device number from their persistent identity and content hash. Preserve reading and exact idempotence of legacy records on their originally valid filesystem. Old records without a persistent UUID still fail on an unexplained device change; do not rewrite or silently upgrade them.
4. Verify the new source/owned-directory and plugin/recovery paths with actual Mac metadata and controlled device-number counterexamples. Re-run existing conflict, interruption, old-version, plugin and offline recovery checks. A simulated number change is not an actual Mac reboot.
5. Prepare a separately reviewed legacy-registration recovery decision if the current user profile still needs it. Keep original Normal, saved records and files intact. No manual JSON edits, automatic re-registration or replacement of an independent source belongs to this repair.

Replay-location ownership records and process-lifetime guards have separate purposes. Audit their effect before extending this change; do not replace every device comparison globally or claim their restart qualification from the source/plugin tests.

## Verification contract

- The current owned directory remains valid when only its recorded boot-local number differs and its persistent UUID/inode match.
- A wrong volume UUID, replaced directory, symlink or unsupported identity cannot admit source writes or recovery.
- An old identity without a UUID retains its old strict comparison and is not rewritten by status or repeated configuration.
- A created policy directory retains its persistent identity through an interrupted transaction and Normal recovery.
- Plugin binding IDs and saved recovery selection stay stable under a device-number-only change; changing the actual selected directory remains an error.
- Source files, old Normal/favorites and private records are not altered during read-only verification. Public controls gain no additional permission or filesystem information.

Primary references: [Apple's persistent volume UUID](https://developer.apple.com/documentation/corefoundation/kcfurlvolumeuuidstringkey) and [nonpersistent volume identifier](https://developer.apple.com/documentation/corefoundation/kcfurlvolumeidentifierkey).
