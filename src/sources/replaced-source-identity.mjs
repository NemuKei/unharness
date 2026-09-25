import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { captureDirectoryIdentity, hasVolumeUuid } from '../platform/directory-identity.mjs';
import { canonical } from './platform.mjs';

// A replacement is only an actual directory at the exact registered Skill
// path, on the same volume. Links, relocated paths and volume changes retain
// the existing source-redirection boundary.
export async function replacedSkillIdentity(reg, key) {
  const skill = reg.skills.find(s => key === s.id + ':body');
  if (!skill) return null;
  const path = dirname(skill.path), previous = reg.bindings[key];
  if (previous?.path !== path) return null;
  try {
    await canonical(path);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    const current = await captureDirectoryIdentity(path, stat, { persistent: hasVolumeUuid(previous) });
    if (current.ino === previous.ino
      || (hasVolumeUuid(previous) ? current.volumeUuid !== previous.volumeUuid : current.dev !== previous.dev)) return null;
    return { skill, path, previous, current };
  } catch { return null; }
}

export function replacedSourceError(skill) {
  const error = new Error('source-replaced');
  error.kind = 'source-replaced';
  error.sourceId = skill.id;
  error.label = skill.label;
  return error;
}
