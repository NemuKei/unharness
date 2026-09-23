import { openWorkspace } from '../sources/records.mjs';
import { readPreparationHistory, modeAt } from '../sources/preparation-history.mjs';
import { listRecentUserTasks } from '../comparisons/service.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail } from '../sources/errors.mjs';
export { checkInDue } from './check-in-rule.mjs';

const MODES = ['normal', 'unseal', 'trueform'];
const dayMs = 24 * 60 * 60 * 1000;
const blank = () => ({ tasks: 0, perTask: null });
export function recordedTotal(measurement, application) {
  const total = measurement?.usage?.totals?.totalTokens;
  return application === 'codex' && measurement?.usage?.availability === 'available'
    && Number.isSafeInteger(total) && total >= 0 ? total : null;
}
async function recentMetadata(workspace) {
  const tasks = [], cursors = new Set();
  let cursor;
  for (let page = 0; page < 50; page++) {
    const result = await listRecentUserTasks({ workspace, ...(cursor ? { taskCursor: cursor } : {}) });
    if (!result.available) return { tasks: [], available: false, truncated: false };
    tasks.push(...result.tasks);
    if (tasks.length > 1000) return { tasks: tasks.slice(0, 1000), available: true, truncated: true };
    if (!result.nextCursor) return { tasks, available: true, truncated: false };
    if (cursors.has(result.nextCursor)) fail('comparison-tasks-unavailable');
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  return { tasks, available: true, truncated: true };
}
async function taskTotal(w, app, task) {
  try {
    const read = await app.readRunRecords(w, task.taskId);
    const options = { taskId: task.taskId, expectedProject: w.reg.context.project, recordRead: read.recordRead };
    let projected = await app.projectRun(w, read.records, options);
    const last = projected.measurement.availableTurns.filter(turn => turn.completed).at(-1);
    if (!last) return null;
    if (last.turnId !== projected.measurement.throughTurnId)
      projected = await app.projectRun(w, read.records, { ...options, throughTurnId: last.turnId });
    if (projected.measurement.createdAt === null
      || Math.abs(Date.parse(projected.measurement.createdAt) - task.createdAt * 1000) > 1000) return null;
    return recordedTotal(projected.measurement, app.id);
  } catch { return null; }
}
export async function usageSummary({ workspace, days }) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 30) fail('invalid-request');
  const w = await openWorkspace(workspace), app = applicationFor(w.reg.context);
  const history = await readPreparationHistory({ workspace });
  const byMode = Object.fromEntries(MODES.map(mode => [mode, blank()]));
  const ratioToTrueform = Object.fromEntries(MODES.map(mode => [mode, null]));
  if (!history.length) return { byMode, ratioToTrueform, availability: 'none' };
  const recent = await recentMetadata(workspace);
  if (!recent.available) return { byMode, ratioToTrueform, availability: 'none' };
  const now = Date.now(), cutoff = now - days * dayMs, totals = Object.fromEntries(MODES.map(mode => [mode, 0]));
  const incomplete = Object.fromEntries(MODES.map(mode => [mode, false]));
  let unknown = recent.truncated;
  const seen = new Set();
  for (const task of recent.tasks) {
    if (seen.has(task.taskId)) continue;
    seen.add(task.taskId);
    if (!Number.isSafeInteger(task.createdAt) || task.createdAt * 1000 < cutoff || task.createdAt * 1000 > now) continue;
    const mode = modeAt(history, new Date(task.createdAt * 1000).toISOString());
    if (!mode) { unknown = true; continue; }
    byMode[mode].tasks++;
    const total = await taskTotal(w, app, task);
    if (total === null || !Number.isSafeInteger(totals[mode] + total)) incomplete[mode] = true;
    else totals[mode] += total;
  }
  const count = MODES.reduce((sum, mode) => sum + byMode[mode].tasks, 0);
  if (count === 0) return { byMode, ratioToTrueform, availability: 'none' };
  for (const mode of MODES) if (byMode[mode].tasks && !incomplete[mode]) byMode[mode].perTask = totals[mode] / byMode[mode].tasks;
  const baseline = byMode.trueform.perTask;
  if (baseline !== null && baseline > 0)
    for (const mode of MODES) if (byMode[mode].perTask !== null) ratioToTrueform[mode] = byMode[mode].perTask / baseline;
  return { byMode, ratioToTrueform,
    availability: unknown || MODES.some(mode => incomplete[mode]) ? 'partial' : 'complete' };
}
