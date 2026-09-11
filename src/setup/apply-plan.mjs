// Validate the forward application boundary, after the source lock is held.
// Frozen restore plans use their historical record; they never acquire the
// current release preset or a native/YAML dependency during recovery.
import { applicationFor } from '../apps/index.mjs';
import { loadRecord, loadSnapshot, loadNormal, activeNormalId, scopeWorkspace } from '../sources/records.mjs';
import { equal } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';

export async function assertV2ApplicationPlan(w, plan) {
  if (plan.normalId !== activeNormalId(w)) fail('setup-record-invalid');
  const allIds = [...(w.reg.instructions ? [w.reg.instructions.id] : []), ...w.reg.skills.map(s => s.id)];
  let expected;
  if (plan.mode === 'normal') {
    expected = { after: await loadNormal(w.workspace, w.reg, activeNormalId(w)), selectedIds: [],
      preparedMode: 'normal', setupId: null, guide: null, skillStates: [], adaptation: null };
  } else if (['unseal', 'trueform'].includes(plan.mode)) {
    if (!w.state.setupId) fail('setup-required');
    const { savedPresetForMode } = await import('./service.mjs');
    expected = { ...await savedPresetForMode(w, plan.mode), preparedMode: plan.mode };
  } else {
    if (typeof plan.restoreSourceId !== 'string' || !/^[a-f0-9]{64}$/.test(plan.restoreSourceId)) fail('setup-record-invalid');
    const record = await loadRecord(w.workspace, plan.mode, plan.restoreSourceId);
    if (record.role !== plan.mode) fail('setup-record-invalid');
    scopeWorkspace(w, record.scopeId);
    const { adaptRetainedSnapshot } = await import('../sources/retained-settings.mjs');
    const restored = await adaptRetainedSnapshot(w, record, plan.restoreSourceId, plan.mode);
    expected = { ...restored, selectedIds: allIds, preparedMode: record.preparedMode,
      setupId: record.preparedSetupId ?? null, guide: null, skillStates: [] };
  }
  if (!['favorite', 'checkpoint'].includes(plan.mode) && plan.restoreSourceId != null) fail('setup-record-invalid');
  for (const key of ['selectedIds', 'preparedMode', 'setupId', 'guide', 'skillStates', 'adaptation'])
    if (!equal(plan[key] ?? null, expected[key] ?? null)) fail('setup-record-invalid');
  if (w.manifestVersion === 3 && !equal(plan.pluginStates, expected.pluginStates ?? [])) fail('setup-record-invalid');
  const before = await loadSnapshot(w.workspace, w.reg, plan.beforeId);
  const after = await loadSnapshot(w.workspace, w.reg, plan.afterId);
  const changed = Object.keys(before).filter(key => !equal(before[key], expected.after[key]))
    .map(id => ({ id, label: applicationFor(w.reg.context).changedFileLabel(id) }));
  if (!equal(after, expected.after) || !equal(plan.changedFiles, changed)) fail('setup-record-invalid');
}
