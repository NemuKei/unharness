import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { preservesUnselectedConfig } from '../codex/control-config.mjs';
import { fail } from '../sources/errors.mjs';

// The executing product owns this location. Source labels, Skill frontmatter
// and caller-provided role claims cannot declare another source exempt.
const productRoot = resolve(fileURLToPath(new URL('../../', import.meta.url)));

export function requiredControlSources(sources, root = productRoot) {
  const path = join(root, 'skills', 'unharness', 'SKILL.md');
  const sourceIds = sources.filter(source => source.path === path).map(source => source.id);
  return { path, sourceIds, fileIds: sourceIds.flatMap(id => ['body', 'policy', 'format'].map(kind => `${id}:${kind}`)) };
}

export function assertControlPreserved({ selectedIds = [], changedFileIds = [], control }) {
  if (selectedIds.some(id => control.sourceIds.includes(id))
    || changedFileIds.some(id => control.fileIds.includes(id))) fail('setup-required-control');
}

export function assertControlChanges({ sources, plugins = [], before, after }) {
  const control = requiredControlSources(sources);
  assertControlPreserved({ control,
    changedFileIds: control.fileIds.filter(id => !isDeepStrictEqual(before[id], after[id])),
  });
  if (Object.hasOwn(before, 'config') && !preservesUnselectedConfig(
    before.config?.text ?? '', after.config?.text ?? '',
    sources.filter(source => source.path !== control.path).map(source => source.path),
    plugins.filter(plugin => !plugin.requiredControl && plugin.wholePluginControl).map(plugin => plugin.id),
  )) fail('setup-required-control');
}

export function retainControlSources(sources, root = productRoot) {
  const retained = new Set(requiredControlSources(sources, root).sourceIds);
  return sources.map(source => retained.has(source.id) ? {
    ...source, eligible: false, reason: 'unharness-management-retained',
    availability: { normal: false, unseal: false, trueform: false },
  } : source);
}
