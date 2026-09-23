import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { loadRecord, record, writeJson, readJson } from '../sources/records.mjs';
import { fail } from '../sources/errors.mjs';

const ID = /^[a-f0-9]{64}$/;
const statuses = new Set(['pending', 'applying', 'applied', 'dismissed', 'stale']);
const indexPath = workspace => join(workspace, 'proposals.json');
const emptyIndex = () => ({ schemaVersion: 1, ids: [], heads: {} });

async function indexFor(workspace) {
  let index;
  try { index = await readJson(indexPath(workspace)); }
  catch (error) { if (error?.code === 'ENOENT') return emptyIndex(); throw error; }
  if (index?.schemaVersion !== 1 || !Array.isArray(index.ids) || !index.heads
    || typeof index.heads !== 'object' || Array.isArray(index.heads)
    || Object.keys(index).sort().join() !== 'heads,ids,schemaVersion'
    || index.ids.some(id => !ID.test(id)) || new Set(index.ids).size !== index.ids.length
    || Object.keys(index.heads).sort().join() !== [...index.ids].sort().join()
    || Object.values(index.heads).some(id => id !== null && !ID.test(id))) fail('proposal-record-invalid');
  return index;
}
async function saveIndex(workspace, index) {
  const path = indexPath(workspace);
  try { await writeJson(path, index, true); }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    // Existing indexes are replaced through the same private .next + rename writer.
    await writeJson(path, index);
  }
}
export async function withProposalLock(workspace, action) {
  const path = join(workspace, 'proposals.lock');
  let handle;
  try { handle = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    if (!await reclaimAbandonedLock(path)) fail('proposal-busy');
    try { handle = await open(path, 'wx', 0o600); }
    catch (retry) { if (retry?.code === 'EEXIST') fail('proposal-busy'); throw retry; }
  }
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, token: randomUUID() }));
    await handle.sync();
    return await action();
  }
  finally { await handle.close(); await unlink(path); }
}
async function reclaimAbandonedLock(path) {
  let before;
  try { before = await lstat(path); }
  catch (error) { if (error?.code === 'ENOENT') return true; throw error; }
  if (!before.isFile() || before.isSymbolicLink() || before.size > 256) fail('proposal-record-invalid');
  let owner;
  try { owner = JSON.parse(await readFile(path, 'utf8')); }
  catch { return false; }
  if (!Number.isSafeInteger(owner?.pid) || owner.pid < 1 || typeof owner.token !== 'string') return false;
  try { process.kill(owner.pid, 0); return false; }
  catch (error) { if (error?.code !== 'ESRCH') return false; }
  let current;
  try { current = await lstat(path); }
  catch (error) { if (error?.code === 'ENOENT') return true; throw error; }
  if (current.dev !== before.dev || current.ino !== before.ino) return false;
  await unlink(path);
  return true;
}
async function materialize(workspace, index, proposalId) {
  if (!ID.test(proposalId) || !Object.hasOwn(index.heads, proposalId)) fail('proposal-invalid');
  const original = await loadRecord(workspace, 'input', proposalId);
  if (original.role !== 'proposal' || original.kind !== 'unharness-user-source') fail('proposal-record-invalid');
  const { role, kind: recordKind, proposalKind, nonce, ...fields } = original;
  if (typeof nonce !== 'string' || !['initial', 'add', 'remove', 'restore'].includes(proposalKind)) fail('proposal-record-invalid');
  const headId = index.heads[proposalId];
  let status = 'pending', result;
  if (headId !== null) {
    const head = await loadRecord(workspace, 'input', headId);
    if (head.role !== 'proposal-transition' || head.proposalId !== proposalId || !statuses.has(head.status)) fail('proposal-record-invalid');
    status = head.status;
    result = head.result;
  }
  return { proposalId, kind: proposalKind, ...fields, status, ...(result === undefined ? {} : { result }) };
}
export async function readStoredProposal(workspace, proposalId) {
  return materialize(workspace, await indexFor(workspace), proposalId);
}
export async function listStoredProposals(workspace) {
  const index = await indexFor(workspace);
  return Promise.all(index.ids.slice(0, 20).map(id => materialize(workspace, index, id)));
}
export async function createStoredProposal(workspace, fields) {
  const index = await indexFor(workspace);
  for (const id of index.ids) {
    const old = await materialize(workspace, index, id);
    if (old.mode === fields.mode && old.status === 'pending') {
      const head = await record(workspace, 'input', { role: 'proposal-transition', proposalId: id, status: 'stale', nonce: randomUUID() });
      index.heads[id] = head;
    }
  }
  const { kind, ...rest } = fields;
  const proposalId = await record(workspace, 'input', { role: 'proposal', proposalKind: kind, ...rest, nonce: randomUUID() });
  index.ids.unshift(proposalId);
  index.heads[proposalId] = null;
  await saveIndex(workspace, index);
  return materialize(workspace, index, proposalId);
}
export async function transitionStoredProposal(workspace, proposalId, status, result) {
  if (!statuses.has(status)) fail('proposal-invalid');
  const index = await indexFor(workspace), before = await materialize(workspace, index, proposalId);
  const allowed = before.status === 'pending' ? ['applying', 'dismissed', 'stale']
    : before.status === 'applying' ? ['pending', 'applied', 'stale'] : [];
  if (!allowed.includes(status)) fail('proposal-invalid');
  const payload = { role: 'proposal-transition', proposalId, status, nonce: randomUUID(),
    ...(result === undefined ? {} : { result }) };
  index.heads[proposalId] = await record(workspace, 'input', payload);
  await saveIndex(workspace, index);
  return materialize(workspace, index, proposalId);
}
