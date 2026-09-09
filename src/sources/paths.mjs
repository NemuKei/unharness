// Portable path comparison shared by the application adapters. Recorded task
// paths may use either separator style regardless of the reading platform, so
// the grammar is selected from the value rather than from process.platform.
import { posix, win32 } from 'node:path';

export const pathApi = (path) =>
  /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? win32 : posix;

export const absolute = (path) =>
  typeof path === 'string' &&
  !/[\0\r\n]/.test(path) &&
  pathApi(path).isAbsolute(path) &&
  pathApi(path).normalize(path) === path;

export function samePath(a, b) {
  return (
    absolute(a) &&
    absolute(b) &&
    pathApi(a) === pathApi(b) &&
    pathApi(a).normalize(a) === pathApi(b).normalize(b)
  );
}
