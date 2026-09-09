// Bounded JSONL task-recording reader shared by the application adapters.
// Extracted unchanged from the Codex desktop record reader when the
// application seam was introduced.
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_LINE = 8 * 1024 * 1024;

const fail = (kind) => {
  throw Object.assign(new Error(kind), { kind });
};
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export async function readRecordFile(session) {
  let handle;
  try {
    // Open once and read a bounded prefix of this inode. A concurrently appended
    // partial trailing record is ignored and explicitly reported.
    const selected = await lstat(session);
    if (!selected.isFile() || selected.isSymbolicLink())
      fail('invalid-desktop-record');
    handle = await open(
      session,
      constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0)
    );
    const info = await handle.stat();
    if (!info.isFile()) fail('invalid-desktop-record');
    if (info.size > MAX_BYTES) fail('desktop-record-too-large');
    const buffer = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        buffer.length - offset,
        offset
      );
      if (bytesRead === 0) fail('desktop-record-changed');
      offset += bytesRead;
    }
    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    const tail = lines.pop();
    let incompleteTrailingLine = false;
    if (tail) {
      if (Buffer.byteLength(tail) > MAX_LINE) fail('desktop-record-too-large');
      // Accept a valid last record without newline; a broken tail may be an
      // in-progress append. Broken records terminated by newline are errors.
      try {
        JSON.parse(tail);
        lines.push(tail);
      } catch {
        incompleteTrailingLine = true;
      }
    }
    const records = lines
      .filter((line) => line.length > 0)
      .map((line) => {
        if (Buffer.byteLength(line) > MAX_LINE) fail('desktop-record-too-large');
        try {
          const value = JSON.parse(line);
          if (!object(value)) fail('invalid-desktop-record');
          return value;
        } catch {
          fail('invalid-desktop-record');
        }
      });
    return { records, recordRead: { incompleteTrailingLine, snapshotBytes: info.size } };
  } catch (error) {
    const allowed = [
      'invalid-desktop-record',
      'desktop-record-too-large',
      'desktop-record-changed'
    ];
    fail(allowed.includes(error?.kind) ? error.kind : 'desktop-record-read-error');
  } finally {
    await handle?.close();
  }
}
