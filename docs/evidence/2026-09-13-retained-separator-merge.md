# Saved modes after native reinstallation

On 2026-09-13, the published 0.0.4 package refused a saved TRUEFORM plan in
the owned Mac qualification profile after native plugin removal and
reinstallation. The configuration contained one additional final blank line.
Its parsed retained values were unchanged. No selected configuration file was
written by the failed plan.

The saved Skill block and the new trailing separator were both insertions at
the same position. The three-way merge treated their shared blank prefix as
competing content. This occurred during adaptation of an immutable saved
preset to the accepted current Normal, before the native Skill editor.

The shared composition helper now accepts this exact blank-prefix overlap.
It keeps the inserted content and shared separator once. Both native and
frozen paths retain their independent proof of selected and retained values,
comment checks and bounds. Overlapping nonblank insertions and changed
retained values still fail. Old setups, Normal versions, favorites and
snapshots are not rewritten.

The two new LF/CRLF cases reproduced the failure before the fix and passed
afterward. All 61 related reconciliation and retained-settings checks passed.
Planning the original saved TRUEFORM with the corrected source then succeeded
without source writes. A new immutable 0.0.5 package will carry the fix;
the existing 0.0.4 archive remains unchanged. Distribution and public-mode
round-trip verification are the next checks.
