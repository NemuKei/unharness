# Persistent Mac directory identity

Date: 2026-09-11 (JST). Base: `a2e83c507d5c422ddfe91895b16d4892293d5495`, with the source and tests committed alongside this record. The preceding base also repairs Node-only CLI startup after the image-import work.

A read-only check of an existing registration found unchanged canonical directory paths and inode numbers but a different filesystem device number. That older record did not contain a persistent volume identity; its current conflict was preserved. No personal source, registration, favorite or recovery record was rewritten.

## Change

The [OS boundary](../../src/platform/directory-identity.mjs) reads Foundation's volume UUID and persistent-file-ID capability using a fixed program and a path argument. New Mac source, owned-directory, plugin-context, scope and recovery records use the UUID plus inode. Canonical-path, directory-type, ownership and fresh within-operation checks remain in place. Unsupported metadata fails closed. Transient file/process checks still use their existing identities.

Legacy records retain their original device-number/inode format and exact repeated-configuration identity. They are not automatically upgraded. An actual previous source writer refuses a new UUID registration before publishing a managed file. Older writer-fence tests now create their starting registrations with the pinned older CLI, preserving the distinction between a readable old record and a subsequent feature-specific fence.

Before creating a policy directory, the transaction resolves and verifies its parent's persistent identity. It records the child's inode and that verified volume immediately after creation on the same current device. A later metadata-command timeout therefore leaves a usable recovery identity; the actual child's UUID is rechecked before source publication.

## Verification

- New source/owned-directory cases cover a changed device number with matching real UUID/inode, a wrong UUID, legacy strictness, an interrupted directory creation and a metadata timeout followed by exact Normal recovery.
- Plugin/recovery integration uses real filesystem metadata with only directory device numbers changed in the test process. Context and recovery IDs stay identical, the existing recovery copy is reused, saved identity records remain byte-identical, and Normal returns the original managed files. The shim is restored after the test; no system mount or device number is changed.
- A separate synthetic Node-only export, without `node_modules`, completes unconfigured status, explicit configuration and repeated status after the image decoder import was removed from basic CLI startup. Existing entry-point tests cover the regression.
- `npm run check` (type and CSP checks), `npm run build`, `npm run build:site`, and `node --test` pass on the final code: **1,081 tests, 1,022 passed, 0 failed, 59 skipped**. Optional browser execution was not enabled for this run; the skips and earlier browser evidence are not promoted to current native qualification.
- An independent code review identified the fallible metadata call after directory creation. The corrected ordering and six focused directory cases were rechecked without another actionable finding.

## Limits

This is controlled device-number-change evidence on the Mac, not an actual restart/remount test. Replay-location ownership records are outside this change. Windows source publication remains unqualified. [Recovery under denied external networking](2026-09-11-network-isolated-recovery-macos.md) uses a separately identified earlier package; fresh native model tasks, the final public client/domain, and the release package remain separate work. Recovering an old UUID-less personal registration requires a separately reviewed decision; the new format does not establish that registration's historical volume identity.
