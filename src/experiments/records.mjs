import { putRecord, readRecord, recordId } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';
import { validateStartingPaths, digestBytes, MAX_STARTING_FILE_BYTES, MAX_STARTING_TOTAL_BYTES } from './files.mjs';

const KIND = 'unharness-starting-files', CHUNK_BYTES = 384 * 1024;
const hash = x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const invalid = () => fail('starting-record-invalid');
const shape = (v, keys) => exactKeys(v, keys, [], 'starting-record-invalid');
function metadata(m) {
  shape(m, ['uid', 'gid', 'mode', 'xattrs']);
  if (![m.uid, m.gid, m.mode].every(v => Number.isSafeInteger(v) && v >= 0) || m.mode > 0o777
    || !m.xattrs || typeof m.xattrs !== 'object' || Array.isArray(m.xattrs)
    || Object.keys(m.xattrs).length > 128) invalid();
  for (const [name, value] of Object.entries(m.xattrs))
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(name) || typeof value !== 'string'
      || value.length > 65536 || !/^(?:[a-f0-9]{2})*$/.test(value)) invalid();
}
function validateManifest(m) {
  shape(m, ['kind', 'role', 'schemaVersion', 'files', 'totalBytes']);
  if (m.kind !== KIND || m.role !== 'manifest' || m.schemaVersion !== 1 || !Array.isArray(m.files)) invalid();
  const paths = validateStartingPaths(m.files.map(f => f?.path));
  if (paths.some((path, i) => path !== m.files[i].path)) invalid();
  let totalBytes = 0;
  for (const f of m.files) {
    shape(f, ['path', 'present', 'size', 'sha256', 'meta', 'chunks']);
    if (typeof f.present !== 'boolean' || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > MAX_STARTING_FILE_BYTES
      || !Array.isArray(f.chunks) || !f.chunks.every(hash)) invalid();
    if (f.present) {
      if (!hash(f.sha256) || f.chunks.length !== Math.ceil(f.size / CHUNK_BYTES)) invalid();
      metadata(f.meta);
    } else if (f.size !== 0 || f.sha256 !== null || f.meta !== null || f.chunks.length !== 0) invalid();
    totalBytes += f.size;
  }
  if (totalBytes !== m.totalBytes || totalBytes > MAX_STARTING_TOTAL_BYTES) invalid();
  return m;
}
function chunkPayload(bytes) {
  return { kind: KIND, role: 'binary-chunk', schemaVersion: 1,
    size: bytes.length, sha256: digestBytes(bytes), base64: bytes.toString('base64') };
}
export async function writeStartingManifest({ store, capture }) {
  try {
    const chunks = new Map(), files = capture.files.map(f => {
      if ((f.present && (!Buffer.isBuffer(f.bytes) || f.bytes.length !== f.size || digestBytes(f.bytes) !== f.sha256))
        || (!f.present && f.bytes !== null)) invalid();
      const ids = [];
      if (f.present) for (let at = 0; at < f.bytes.length; at += CHUNK_BYTES) {
        const payload = chunkPayload(f.bytes.subarray(at, at + CHUNK_BYTES));
        const id = recordId('input', payload);
        chunks.set(id, payload); ids.push(id);
      }
      const { bytes, ...meta } = f;
      return { ...meta, chunks: ids };
    });
    const manifest = validateManifest({ kind: KIND, role: 'manifest', schemaVersion: 1, files, totalBytes: capture.totalBytes });
    recordId('input', manifest);
    for (const payload of chunks.values()) await putRecord({ store, type: 'input', payload });
    return (await putRecord({ store, type: 'input', payload: manifest })).id;
  } catch (e) {
    if (e.kind === 'record-too-large') fail('starting-files-limit');
    if (e.kind === 'starting-record-invalid') throw e;
    fail('starting-record-invalid');
  }
}
export async function readStartingManifest({ store, manifestId, withBytes = false }) {
  try {
    if (!hash(manifestId) || typeof withBytes !== 'boolean') invalid();
    const manifest = validateManifest(await readRecord({ store, type: 'input', id: manifestId }));
    const cache = new Map(), files = [];
    for (const f of manifest.files) {
      const pieces = [];
      for (let i = 0; i < f.chunks.length; i++) {
        const id = f.chunks[i];
        let bytes = cache.get(id);
        if (!bytes) {
          const chunk = await readRecord({ store, type: 'input', id });
          shape(chunk, ['kind', 'role', 'schemaVersion', 'size', 'sha256', 'base64']);
          if (chunk.kind !== KIND || chunk.role !== 'binary-chunk' || chunk.schemaVersion !== 1
            || !Number.isSafeInteger(chunk.size) || chunk.size < 1 || chunk.size > CHUNK_BYTES
            || !hash(chunk.sha256) || typeof chunk.base64 !== 'string' || chunk.base64.length > CHUNK_BYTES / 3 * 4) invalid();
          bytes = Buffer.from(chunk.base64, 'base64');
          if (bytes.toString('base64') !== chunk.base64 || bytes.length !== chunk.size || digestBytes(bytes) !== chunk.sha256) invalid();
          cache.set(id, bytes);
        }
        if (bytes.length !== Math.min(CHUNK_BYTES, f.size - i * CHUNK_BYTES)) invalid();
        pieces.push(bytes);
      }
      const bytes = f.present ? Buffer.concat(pieces, f.size) : null;
      if (bytes && digestBytes(bytes) !== f.sha256) invalid();
      files.push({ ...f, ...(withBytes ? { bytes } : {}) });
    }
    return { manifestId, files, totalBytes: manifest.totalBytes };
  } catch { invalid(); }
}
// History can inspect the bounded manifest without loading every input blob.
// This is metadata only; any consumer of file bytes uses readStartingManifest.
export async function readStartingManifestIndex({ store, manifestId }) {
  try {
    if (!hash(manifestId)) invalid();
    const manifest = validateManifest(await readRecord({ store, type: 'input', id: manifestId }));
    return { manifestId, files: manifest.files, totalBytes: manifest.totalBytes };
  } catch { invalid(); }
}
