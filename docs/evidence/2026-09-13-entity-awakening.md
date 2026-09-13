# Entity awakening and prepared appearances

Date: 2026-09-13. Scope: the [three-pose artwork contract](../spec-entity-poses.md).
This extends the qualified Mac Codex product's appearance system; it does not
requalify or expand source controls, official-plugin OFF, Claude Code or Windows.

## Implemented behavior

- Normal sleeps curled up; UNSEAL remains curled and half awake; TRUEFORM unfolds.
  The importer uses one physical scale for all three, preserving the v1 hardware
  template and 49 mechanical cels. Connected silhouettes can overlap column bounds
  without leaking pixels into another pose.
- **白銀** has short silver hair and cyan light; **琥珀** has long chestnut hair and
  amber light. TRUEFORM adds bounded crown lift, emission, floating motion and
  original light crests. Six interlaced curves and irregular rays leave a subtle
  visual hint. Product names do not identify providers; no official logo asset
  is embedded in the images or crests.
- The introduction compares the default and selected humanoid with working mode
  transitions. The workbench saves a prepared look through ordinary image review
  and save, verifies its exact expected manifest, and reuses an existing version
  on later selection. Choosing a look never prepares a mode or selects a model.
- New authoring places use the three-pose input. Historical single-image works
  and v1 authoring places remain readable, and an old creation retry reopens the
  old place. The source PNG, configuration, old works and review receipts remain
  intact. Effects Off and reduced motion keep the canonical static pose.

## Local verification

- Full Node suite: **1,336 tests, 1,261 passed, 0 failed, 75 skipped**. Browser
  scenarios are run separately rather than relabeled as covered by this count.
- Type check, CSP-compatible Pixi check, local GUI build and site build pass.
- Focused real Chrome checks cover import/save/reload/old selection, lost-save
  receipt recovery, corrupt-old-image isolation, all mapped parts, three-pose
  rendering, reversal/retargeting, effects-off pixels and resource disposal.
- The local and paired-public appearance panels save and reselect works without
  changing the synthetic registered source bytes. Prepared default/白銀/琥珀
  choices survive reload and reuse their existing versions.
- The introduction switches both scenes through intermediate mechanical cels,
  supports both humanoids, disables motion correctly and fits a 390px viewport.
  Rendered screenshots of both awake characters were inspected after their
  replacement images became visible, not merely after a stale ready marker.

The checks exposed and resolved two integration gaps: review correspondence now
accounts for one sheet producing three PNGs through one shared pure validator;
image membership reads join the server's operation queue so its own selection
publication cannot replace the collection index midway through a read. Validation,
ownership checks and uncertain-operation handling were preserved.

## Release evidence

The [0.0.7 prerelease](https://github.com/NemuKei/unharness/releases/tag/v0.0.7)
was published and anonymously downloaded. The ZIP has 98,636,558 bytes and
SHA-256 `e09df97262117306f5d4f4c108fc6181687b1d3cc44743087250b9900eddb9cd`.
Its distribution ID is `716ffa9aab9f0cfbdd218ed9de4ec0431cfd9eee3d0cead166bc073cad606f3f`,
with 7,472 indexed files from source `12647cd10a94819550d8fb08320af07772ca5d0b`.
Independent extraction reproduced the distribution, executable bits and signed
bundled Node. The tag, anonymous archive and sidecar checksum agree.

Native Codex loaded the installed 0.0.7 MCP on an owned profile, issued an
authoring place, reviewed/saved both actual example sheets, accepted an exact
retry and reselected an earlier work. Registered source files and source state
were preserved. The personal update retained its pre-existing selected v1
artwork and collection, all registered source bytes and old Normal version.
Its reviewed retained-only adoption changed zero managed files.

The public site deployed source `c8d773d5774c8ffa11bba46c94dd4ccbeb60a19e`;
all 30 served files matched the build and the security headers were checked.
The actual Codex in-app browser rendered both characters and their transitions.
Paired website-tool status returned the owned native profile's prepared Normal.
The [0.0.6 Mac qualification](2026-09-13-mac-codex-completion.md) remains the
separate baseline for native mode/control/recovery acceptance.
