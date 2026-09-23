import { constants } from 'node:fs';
import { lstat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openWorkspace } from './records.mjs';
import { fail } from './errors.mjs';

const MAX_BYTES = 1024 * 1024;
const MAX_ROWS = 10000;
const MODES = new Set(['normal', 'unseal', 'trueform', 'favorite', 'checkpoint']);
const pathFor = workspace => join(workspace, 'preparation-history.jsonl');
const validTime = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
function validRow(row) {
  return row && typeof row === 'object' && !Array.isArray(row)
    && Object.keys(row).sort().join() === 'mode,preparedAt,revision'
    && MODES.has(row.mode) && Number.isSafeInteger(row.revision) && row.revision >= 0 && validTime(row.preparedAt);
}
async function fileInfo(path) {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_BYTES) fail('preparation-history-invalid');
    return info;
  } catch (error) { if (error?.code === 'ENOENT') return null; throw error; }
}
export async function readPreparationHistory({ workspace }) {
  await openWorkspace(workspace);
  const path = pathFor(workspace), before = await fileInfo(path);
  if (!before) return [];
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let text;
  try {
    const now = await handle.stat();
    if (now.dev !== before.dev || now.ino !== before.ino || now.size > MAX_BYTES) fail('preparation-history-invalid');
    text = await handle.readFile('utf8');
  } finally { await handle.close(); }
  if (!text.endsWith('\n') || Buffer.byteLength(text) > MAX_BYTES) fail('preparation-history-invalid');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length > MAX_ROWS) fail('preparation-history-invalid');
  const rows = [];
  for (const line of lines) {
    let row;
    try { row = JSON.parse(line); } catch { fail('preparation-history-invalid'); }
    if (!validRow(row)) fail('preparation-history-invalid');
    rows.push(row);
  }
  return rows;
}
export async function appendPreparationHistory({ workspace, mode, revision, preparedAt }) {
  const row = { mode, revision, preparedAt };
  if (!validRow(row)) fail('preparation-history-invalid');
  const rows = await readPreparationHistory({ workspace });
  if (rows.length >= MAX_ROWS) fail('preparation-history-invalid');
  if (rows.length && JSON.stringify(rows.at(-1)) === JSON.stringify(row)) return;
  const path = pathFor(workspace), before = await fileInfo(path);
  const handle = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    const now = await handle.stat();
    if (!now.isFile() || now.nlink !== 1 || before && (now.dev !== before.dev || now.ino !== before.ino)
      || now.size + Buffer.byteLength(JSON.stringify(row)) + 1 > MAX_BYTES) fail('preparation-history-invalid');
    await handle.writeFile(JSON.stringify(row) + '\n');
    await handle.sync();
  } finally { await handle.close(); }
}
export function modeAt(history, startedAt) {
  if (!Array.isArray(history) || !validTime(startedAt)) return null;
  let winner = null;
  for (const row of history) if (validRow(row) && Date.parse(row.preparedAt) <= Date.parse(startedAt)
    && (!winner || Date.parse(row.preparedAt) >= Date.parse(winner.preparedAt))) winner = row;
  return winner && ['normal', 'unseal', 'trueform'].includes(winner.mode) ? winner.mode : null;
}
