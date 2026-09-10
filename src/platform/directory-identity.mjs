// Persistent directory identity is an OS concern. Boot-local device numbers
// remain useful for checks performed inside one live filesystem operation.
import { execFile } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const unavailable = () => { throw Object.assign(Error('unsupported-metadata'), { kind: 'unsupported-metadata' }); };
const program = `ObjC.import('Foundation');
function run(argv) {
  return JSON.stringify(argv.map(function(path) {
    var url = $.NSURL.fileURLWithPath(path), value = Ref(), supported = Ref();
    if (!url.getResourceValueForKeyError(value, $.NSURLVolumeUUIDStringKey, null)
      || !url.getResourceValueForKeyError(supported, $.NSURLVolumeSupportsPersistentIDsKey, null)) throw Error('unavailable');
    return { uuid: ObjC.unwrap(value[0]), persistentIds: ObjC.unwrap(supported[0]) };
  }));
}`;

export const validVolumeUuid = value => typeof value === 'string' && uuid.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
export const hasVolumeUuid = value => Boolean(value && Object.hasOwn(value, 'volumeUuid'));
export function directoryIdentity(stat, volumeUuid) {
  if (volumeUuid === undefined) return { dev: stat.dev, ino: stat.ino };
  if (!validVolumeUuid(volumeUuid)) unavailable();
  // Omitting dev also makes a pre-UUID registration reader refuse these new
  // records instead of dropping the persistent identity on its next write.
  return { ino: stat.ino, volumeUuid };
}
export const validDirectoryIdentity = value => Boolean(value && Number.isSafeInteger(value.ino) && value.ino >= 0
  && (hasVolumeUuid(value) ? validVolumeUuid(value.volumeUuid) && !Object.hasOwn(value, 'dev')
    : Number.isSafeInteger(value.dev) && value.dev >= 0));

export async function captureDirectoryIdentity(path, stat, { persistent = true } = {}) {
  try {
    if (!stat?.isDirectory() || stat.isSymbolicLink()) unavailable();
    let volumeUuid;
    if (persistent && process.platform === 'darwin') {
      const { stdout } = await execute('/usr/bin/osascript', ['-l', 'JavaScript', '-e', program, path],
        { encoding: 'utf8', timeout: 10000, maxBuffer: 4096 });
      const values = JSON.parse(stdout);
      if (!Array.isArray(values) || values.length !== 1 || values[0]?.persistentIds !== true
        || typeof values[0].uuid !== 'string') unavailable();
      volumeUuid = values[0].uuid.toLowerCase();
      if (!validVolumeUuid(volumeUuid)) unavailable();
    }
    const after = await lstat(path);
    if (!after.isDirectory() || after.isSymbolicLink() || after.dev !== stat.dev || after.ino !== stat.ino
      || await realpath(path) !== path) unavailable();
    return directoryIdentity(stat, volumeUuid);
  } catch { unavailable(); }
}

export function matchesDirectoryIdentity(current, expected) {
  if (!validDirectoryIdentity(current) || !validDirectoryIdentity(expected) || current.ino !== expected.ino) return false;
  if (hasVolumeUuid(expected)) return validVolumeUuid(expected.volumeUuid)
    && current.volumeUuid === expected.volumeUuid;
  return current.dev === expected.dev;
}
