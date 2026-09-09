import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { openWorkspace, loadSnapshot, record, writeJson } from './records.mjs';
import { acquire, pending, assertCurrent } from './transaction.mjs';
import { applicationFor } from '../apps/index.mjs';
import { fail } from './errors.mjs';
import {
  preparationMetadata,
  projectObservation,
  validUuid
} from './observation-record.mjs';

// The Codex catalog grammar keeps its historical import path for the replay
// observation and its existing tests.
export {
  parseSkillCatalog,
  selectedSkillIntent
} from '../codex/skill-listing.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export async function registeredSourceExpectations(w, files) {
  const normal = await loadSnapshot(w.workspace, w.reg, w.reg.normalId);
  return applicationFor(w.reg.context).expectations(w, files, normal);
}

export async function projectRegisteredTaskObservation(
  w,
  taskId,
  records,
  observedAt,
  readIssue
) {
  const files = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
  return applicationFor(w.reg.context).projectTask(
    w,
    taskId,
    await registeredSourceExpectations(w, files),
    records,
    observedAt,
    readIssue,
    preparationMetadata(w.state)
  );
}

export async function observe(args) {
  if (
    !object(args) ||
    Object.keys(args).sort().join(',') !== 'taskId,workspace' ||
    !validUuid(args.taskId)
  )
    fail('invalid-request');
  const { workspace } = args,
    taskId = args.taskId.toLowerCase();
  const opened = await openWorkspace(workspace),
    release = await acquire(opened);
  try {
    const w = await openWorkspace(workspace);
    if (await pending(workspace)) fail('recovery-required');
    const files = await loadSnapshot(workspace, w.reg, w.state.snapshotId);
    await assertCurrent(w, files);
    const { records, readIssue } = await applicationFor(
      w.reg.context
    ).readTaskRecords(w, taskId);
    const payload = await projectRegisteredTaskObservation(
      w,
      taskId,
      records,
      new Date().toISOString(),
      readIssue
    );
    const current = await openWorkspace(workspace);
    if (
      !isDeepStrictEqual(w.state, current.state) ||
      !isDeepStrictEqual(w.reg, current.reg) ||
      (await pending(workspace))
    )
      fail('source-conflict');
    await assertCurrent(current, files);
    const observationId = await record(workspace, 'observation', payload);
    const projected = projectObservation(
      { kind: 'unharness-user-source', ...payload },
      observationId,
      w
    );
    const publishing = await openWorkspace(workspace);
    if (
      !isDeepStrictEqual(w.state, publishing.state) ||
      !isDeepStrictEqual(w.reg, publishing.reg) ||
      (await pending(workspace))
    )
      fail('source-conflict');
    await assertCurrent(publishing, files);
    await writeJson(join(workspace, 'state.json'), {
      ...w.state,
      lastObservationId: observationId
    });
    return projected;
  } finally {
    await release();
  }
}
