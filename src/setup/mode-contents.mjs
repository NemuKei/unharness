import { exactKeys } from '../comparisons/assessment.mjs';
import { openWorkspace, activeNormalId, loadNormal, loadSnapshot } from '../sources/records.mjs';
import { applicationFor } from '../apps/index.mjs';
import { equal } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { loadSetup } from './records.mjs';

const modes = ['normal', 'unseal', 'trueform'];
async function savedContents(workspace) {
  const w = await openWorkspace(workspace), app = applicationFor(w.reg.context);
  if (!app.describeSavedMode || !app.savedModeSource) fail('setup-application-unsupported');
  const setup = await loadSetup(w), normalId = activeNormalId(w), saved = {}, summaries = {};
  for (const mode of modes) {
    const preset = setup?.review.presets[mode];
    if (mode !== 'normal' && !preset) {
      summaries[mode] = { available: false, reason: 'setup-required' }; continue;
    }
    const snapshotId = mode === 'normal' ? normalId : preset.snapshotId;
    const snapshot = mode === 'normal' ? await loadNormal(workspace, w.reg, normalId) : await loadSnapshot(workspace, w.reg, snapshotId);
    const input = { reg: w.reg, mode, snapshot, preset };
    saved[mode] = input;
    summaries[mode] = { available: true, snapshotId, ...await app.describeSavedMode(input) };
  }
  const current = await openWorkspace(workspace);
  if (current.scopeId !== w.scopeId || !equal(current.state, w.state)) fail('stale-plan');
  return { app, saved, summary: { scopeId: w.scopeId, normalId, setupId: setup?.setupId ?? null,
    preparedSetupId: w.state.preparedSetupId ?? null, modes: summaries } };
}
export async function readModeContents(args) {
  exactKeys(args, ['workspace'], [], 'invalid-request');
  return (await savedContents(args.workspace)).summary;
}
export async function readModeSource(args) {
  exactKeys(args, ['workspace', 'mode', 'snapshotId', 'sourceId'], [], 'invalid-request');
  if (!modes.includes(args.mode) || typeof args.sourceId !== 'string' || !/^[a-f0-9]{64}$/.test(args.snapshotId)) fail('invalid-request');
  const { summary, saved, app } = await savedContents(args.workspace), mode = summary.modes[args.mode];
  if (!mode.available || mode.snapshotId !== args.snapshotId) fail('stale-plan');
  if (args.sourceId === mode.instructions.sourceId && !mode.instructions.readable) fail('invalid-request');
  const text = await app.savedModeSource({ ...saved[args.mode], sourceId: args.sourceId });
  if (typeof text !== 'string') fail('invalid-request');
  return { scopeId: summary.scopeId, mode: args.mode, snapshotId: args.snapshotId, sourceId: args.sourceId, text };
}
