import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { captureFileBytes } from '../sources/platform.mjs';
import { fail } from '../sources/errors.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { digestBytes } from './files.mjs';
import { hash } from './start-records.mjs';
import { inspectReplayRepository } from './repository.mjs';

const changed = () => fail('replay-git-state-changed');
export function validateReplayGitGuard(guard, repository) {
  if (repository.kind === 'directory') { if (guard !== null) changed(); return; }
  exactKeys(guard, ['head', 'index'], [], 'replay-git-state-changed');
  for (const file of Object.values(guard)) {
    exactKeys(file, ['size', 'sha256', 'meta'], [], 'replay-git-state-changed');
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > 8 * 1024 * 1024 || !hash(file.sha256)
      || !file.meta || !Number.isSafeInteger(file.meta.mode)) changed();
  }
}
export async function captureReplayGitGuard(location) {
  if (location.repository.kind === 'directory') return null;
  try {
    const native = await inspectReplayRepository({ project: location.project });
    if (native.kind !== 'git' || native.head !== location.repository.head
      || !isDeepStrictEqual(native.gitDirectory, location.gitDirectory)
      || !isDeepStrictEqual(native.commonDirectory, location.repository.commonDirectory)) changed();
    const guard = {};
    for (const [key, name] of [['head', 'HEAD'], ['index', 'index']]) {
      const file = await captureFileBytes(join(location.gitDirectory.path, name), 8 * 1024 * 1024);
      if (!file || key === 'head' && file.bytes.toString() !== location.repository.head + '\n') changed();
      guard[key] = { size: file.bytes.length, sha256: digestBytes(file.bytes), meta: file.meta };
    }
    validateReplayGitGuard(guard, location.repository);
    return guard;
  } catch { changed(); }
}
export async function assertReplayGitGuard(location, expected) {
  validateReplayGitGuard(expected, location.repository);
  if (!isDeepStrictEqual(await captureReplayGitGuard(location), expected)) changed();
}
