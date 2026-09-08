import { lstat, opendir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fail } from '../sources/errors.mjs';
import { inventoryStartingFiles } from './inventory.mjs';
import { readStartingManifest } from './records.mjs';
import { replayRelativePath } from './variant.mjs';
import { captureStartingFiles, startingCaptureGuard, assertStartingFilesCurrent, validateStartingPaths } from './files.mjs';

export async function captureReplayRetainedInputs(w, manifestId, native) {
  try {
    const fallbacks = native.config.project_doc_fallback_filenames ?? [];
    if (!Array.isArray(fallbacks) || fallbacks.length > 32 || fallbacks.some(p => typeof p !== 'string' || p.includes('/') || p.includes('\\'))) throw Error();
    const roots = new Set(['AGENTS.md', 'AGENTS.override.md', 'CLAUDE.md', ...fallbacks]);
    validateStartingPaths([...roots]);
    const selected = new Set();
    for (const s of w.reg.skills.filter(s => s.identity.scope === 'repo')) {
      const body = replayRelativePath(w.reg.context.project, s.path);
      for (const path of [body, dirname(body) + '/SKILL.json', dirname(body) + '/agents/openai.yaml']) selected.add(path);
    }
    const retained = p => !selected.has(p) && (roots.has(p) || p.startsWith('.codex/') || p.startsWith('.agents/'));
    const manifest = await readStartingManifest({ store: w.workspace, manifestId });
    const current = await inventoryStartingFiles({ project: w.reg.context.project });
    const paths = [...new Set([...roots, ...manifest.files.map(f => f.path).filter(retained), ...current.paths.filter(retained)])].sort();
    const capture = await captureStartingFiles({ project: w.reg.context.project, paths });
    for (const file of capture.files) {
      const expected = manifest.files.find(f => f.path === file.path);
      const { bytes, ...meta } = file;
      if (expected) {
        const { chunks, ...saved } = expected;
        if (!isDeepStrictEqual(meta, saved)) throw Error();
      } else if (file.present) throw Error();
    }
    return startingCaptureGuard(capture);
  } catch { fail('replay-retained-conditions-changed'); }
}
export async function assertReplayRetainedInputs(w, guard) {
  try { await assertStartingFilesCurrent({ project: w.reg.context.project, capture: guard }); }
  catch { fail('replay-retained-conditions-changed'); }
}
export async function assertReplayStartingTree(location, capture) {
  try {
    const expected = new Set();
    for (const file of capture.files.filter(f => f.present)) {
      expected.add(file.path);
      let parent = dirname(file.path);
      while (parent !== '.') { expected.add(parent); parent = dirname(parent); }
    }
    const found = new Set();
    async function walk(parent = '') {
      for await (const entry of await opendir(join(location.project, parent))) {
        if (!parent && entry.name === '.git' && location.repository.kind === 'git') continue;
        const path = parent ? parent + '/' + entry.name : entry.name;
        if (!expected.has(path)) throw Error();
        found.add(path);
        const stat = await lstat(join(location.project, path));
        if (stat.isSymbolicLink()) throw Error();
        if (stat.isDirectory()) await walk(path);
        else if (!stat.isFile() || stat.nlink !== 1) throw Error();
      }
    }
    await walk();
    if (!isDeepStrictEqual([...expected].sort(), [...found].sort())) throw Error();
    await assertStartingFilesCurrent({ project: location.project, capture });
  } catch { fail('replay-destination-changed'); }
}
