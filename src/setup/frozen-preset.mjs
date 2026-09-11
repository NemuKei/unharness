// Forward preparation verifies the frozen bytes against their original Normal.
// Historical restores and offline cancellation read saved bytes independently.
import { applicationFor } from '../apps/index.mjs';
import { loadNormal, loadSnapshot } from '../sources/records.mjs';
import { targetFile } from '../sources/capture.mjs';
import { equal } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { compileReleasePreset } from './preset.mjs';
import { setupScope } from './records.mjs';
import { captureInventoryForSetup } from './inventory-capture.mjs';

export async function assertFrozenPreset(w, review, mode) {
  if (!equal(await captureInventoryForSetup(w, review.schemaVersion, review.normalId), review.inventory)) fail('setup-record-invalid');
  const normal = await loadNormal(w.workspace, w.reg, review.normalId);
  const options = compileReleasePreset(review.proposal, mode, setupScope(w, review.normalId), review.inventory);
  const compiled = await applicationFor(w.reg.context).compile({ reg: w.reg, mode, normal,
    selection: options.selection, releasePreset: options, targetFile: (key, text) => targetFile(w.reg, key, text, normal) });
  const frozen = review.presets[mode];
  if (!equal(compiled.after, await loadSnapshot(w.workspace, w.reg, frozen.snapshotId))
    || !equal(compiled.guide, frozen.guide) || !equal(compiled.skillStates, frozen.skillStates)
    || review.schemaVersion === 3 && !equal(compiled.pluginStates, frozen.pluginStates)) fail('setup-record-invalid');
}
