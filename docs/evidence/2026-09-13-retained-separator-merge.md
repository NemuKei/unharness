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

Replacing the native marketplace also moved its retained plugin table.
Adapting the old saved Skill block then required combining a table deletion
at its former location with a neighboring insertion. The small synthetic
reproduction also exercised concurrent insertion of two separate tables.

The shared composition helper now proposes combinations of separable
deletions and boundary insertions, shared blank prefixes and independently
parseable table insertions. Both native and frozen paths retain their
independent proof of selected and retained values, comment checks and bounds.
Replacements, insertions inside deleted content, competing non-table
insertions and changed retained values still fail. Old setups, Normal
versions, favorites and snapshots are not rewritten.

The LF/CRLF and table-move cases reproduced the failures before the fix and
passed afterward. Composing the actual updated qualification profile also
passed without source writes. The full regression passed 1,253 of 1,324
cases, with 71 explicit optional/platform skips and no failures. Type/CSP and
both builds passed.

The corrected source completed an actual HTTPS/WebMCP TRUEFORM preparation,
GUI UNSEAL preparation and WebMCP Normal restoration. Independent readback
matched all selected file bytes and metadata to current Normal, preserved the
original saved setup and corroborated all three operation receipts.

The [immutable 0.0.6 package](2026-09-13-mac-codex-completion.md) carries the
complete fix. Its actual native installation, public GUI/WebMCP round trip
and restricted-process recovery passed. The existing 0.0.4 archive remains
unchanged; the internal 0.0.5 candidate was not published.
