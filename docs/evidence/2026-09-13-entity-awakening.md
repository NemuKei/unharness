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

The immutable 0.0.7 distribution, installed-plugin artwork journey and public
deployment still require their release checks. The currently published 0.0.6
[Mac evidence](2026-09-13-mac-codex-completion.md) remains a separate dated result.
