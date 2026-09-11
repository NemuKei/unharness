# Mac remote-plugin control limit and retained scope

Checked 2026-09-11 on Apple Silicon macOS 26.6.2, Codex Desktop
26.903.61454 and its bundled Codex 0.153.4. This corrects the earlier
assumption that a writable per-plugin enabled selector establishes a working
whole-plugin control.

## Observed boundary

The immutable 0.0.3 candidate was installed through the native marketplace
and plugin commands. Its full distribution index and bundled Node signature
matched. A separate recovery copy was prepared before replacement. Only the
Unharness marketplace source changed in the user's parsed configuration;
the existing binding, Normal and personal store remained in place.

The user confirmed Superpowers as an externally added optional plugin.
Its exact remote identity/version, installed package and 14 Skill bodies were
cross-checked. GUI enrollment saved a successor registration without source
file changes. All 396 earlier immutable records remained unchanged.

An actual v3 OFF preparation then stopped at the final native dependency
check. The selected configuration contained `enabled = false`, while a fresh
native installed-plugin read and Skill catalog continued to report the plugin
enabled with its 14 Skills. No fully prepared OFF result was committed. An
independent bundled recovery restored Normal and removed the pending journal.
Controlled diagnostic repetitions localized the failure to the post-write
selector/native-state correspondence check; the package itself was unchanged.
Each repetition was restored, and the selected Normal files matched their
preparation baseline afterward.

This is configuration and native catalog evidence. No Desktop model task was
started under the failed preparation, and no claim of complete runtime
inspection is made.

## Corroboration and repair

The upstream [individual-disable request](https://github.com/openai/codex/issues/43571)
was open when checked and links the earlier
[remote-plugin reproduction](https://github.com/openai/codex/issues/28443).
The public [plugin loader](https://github.com/openai/codex/blob/main/codex-rs/core-plugins/src/loader.rs)
merges remote installed enabled state into plugin configuration and retains
local MCP overlays. That current source is corroboration, not an assertion
that the inspected desktop binary was built from the current main revision.

The control qualification now requires native readback of both process-local
enabled values. It starts no model task and writes no user configuration.
On the real profile, this reports `setup-plugin-control-unavailable`.
Unsupported OFF setup/forward plans are refused before any source journal or
publication; Native Normal files remain unchanged. Synthetic tests separately
cover a cooperating peer, a peer that ignores the overlay, a formerly reviewed
plan after capability loss, and retained-plugin mode/recovery paths.

`read_setup.pluginControls` reports present availability separately from the
immutable saved inventory. The editor retains unavailable plugins in both
reviewed modes. Old Normal, favorites and recovery continue to use frozen
records without requiring this online control check.

## Accepted Mac release scope

After this result, the maintainer explicitly chose to retain official plugins,
state that scope clearly, and complete the Mac product first. New Mac switching
targets are confirmed optional global instructions and ordinary self/external
Skills with disabled/manual/automatic states. Registered official plugins are
retained at Normal in both release definitions; unregistered plugins remain
untouched. Reliable whole-plugin OFF is deferred and is no longer a completion
gate. It is not replaced by cache edits, account removal or a global plugin
disable switch.

The native installed 0.0.3 service then reviewed and adopted a replacement
pair that kept the registered plugin at Normal. Its TRUEFORM preparation
successfully changed only the optional instruction override and ordinary
Skill invocation policy. Configuration readback matched and no journal
remained; this still did not establish loading into a Desktop model task.

The revised source passes the full Node regression, the 18 focused plugin
inventory checks, the state/enrollment/MCP group and all eight built-browser
cases. The browser cases include unsupported-plugin retention while editing
ordinary Skill state, preservation of source files during paired setup saves,
the three original-persona previews, narrow layout and a demo with no source
writes. Type, CSP, both production builds, vendored dependency integrity and
changed documentation links also pass.

The 0.0.4 candidate carries this preflight and guidance. Its complete native
journey and public distribution receive their own final evidence; installation
of 0.0.3 alone does not establish 0.0.4 qualification.
