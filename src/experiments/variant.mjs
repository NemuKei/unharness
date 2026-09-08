import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { loadSnapshot } from '../sources/records.mjs';
import { registeredSourceExpectations } from '../sources/observation.mjs';
import { fail } from '../sources/errors.mjs';
import { digestBytes, validateStartingPaths } from './files.mjs';
import { readStartingManifest, writeStartingManifest } from './records.mjs';

const absent = path => ({ path, present: false, size: 0, sha256: null, meta: null, bytes: null });
const frozenFile = (path, file) => file === null ? absent(path) : {
  path, present: true, size: Buffer.byteLength(file.text), sha256: digestBytes(Buffer.from(file.text)),
  meta: file.meta, bytes: Buffer.from(file.text)
};
const summary = ({ bytes, ...file }) => file;
export function replayRelativePath(project, path) {
  const value = relative(project, path);
  if (!value || value === '..' || value.startsWith('..' + sep) || isAbsolute(value)) fail('replay-source-unmapped');
  const portable = value.split(sep).join('/');
  try { validateStartingPaths([portable]); } catch { fail('replay-source-unmapped'); }
  return portable;
}

// Internal only: the registered service supplies a validated workspace and owns
// the destination. No source roles, mode assertions or filesystem writes are
// accepted from the browser. The immutable base manifest remains unchanged.
export async function buildReplayVariant({ w, manifestId, project }) {
  const snapshot = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
  const expectedSources = await registeredSourceExpectations(w, snapshot);
  if (expectedSources.some(s => s.expected === 'unknown')) fail('replay-source-state-unavailable');
  const base = await readStartingManifest({ store: w.workspace, manifestId, withBytes: true });
  const files = new Map(base.files.map(({ chunks, ...f }) => [f.path, f]));
  const sourceMappings = [], changes = [];
  const replace = (path, next, sourceId, reason) => {
    const before = files.get(path) ?? absent(path);
    if (isDeepStrictEqual(before, next)) return;
    changes.push({ sourceId, path, reason, before: summary(before), after: summary(next) });
    files.set(path, next);
  };
  for (const skill of w.reg.skills) {
    if (skill.identity.scope !== 'repo') continue;
    const path = replayRelativePath(w.reg.context.project, skill.path);
    const format = dirname(path) + '/SKILL.json', policy = dirname(path) + '/agents/openai.yaml';
    for (const [key, relativePath] of [['body', path], ['format', format]]) {
      const before = files.get(relativePath) ?? absent(relativePath);
      if (!isDeepStrictEqual(before, frozenFile(relativePath, snapshot[skill.id + ':' + key])))
        fail('replay-source-input-mismatch');
    }
    const expected = expectedSources.find(s => s.sourceId === skill.id).expected;
    const disabled = expected === 'disabled';
    // Native 0.153.4 skills/list does not honor the relocated path merely
    // because it appears in a project config layer. Omit only this approved
    // source's entrypoints in the new copy; the original is never deleted.
    if (disabled) {
      replace(path, absent(path), skill.id, 'disabled-skill-entrypoint');
      replace(format, absent(format), skill.id, 'disabled-skill-entrypoint');
    }
    replace(policy, frozenFile(policy, snapshot[skill.id + ':policy']), skill.id, 'prepared-skill-policy');
    sourceMappings.push({ sourceId: skill.id, sourcePath: skill.path, path: join(project, path),
      expected, strategy: disabled ? 'omit-entrypoints' : 'copy-entrypoints' });
  }
  const ordered = [...files.values()].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  // The shared manifest validator owns path ordering, collision and byte limits.
  const paths = validateStartingPaths(ordered.map(f => f.path));
  const capture = { files: paths.map(path => files.get(path)), totalBytes: ordered.reduce((sum, f) => sum + f.size, 0) };
  const variantId = changes.length ? await writeStartingManifest({ store: w.workspace, capture }) : manifestId;
  return { baseManifestId: manifestId, manifestId: variantId, sourceMappings,
    changes: changes.sort((a, b) => a.path.localeCompare(b.path)), expectedSources };
}
