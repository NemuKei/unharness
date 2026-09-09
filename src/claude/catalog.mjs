// Claude Code desktop catalog.
//
// Claude Code on macOS ships inside the desktop application bundle; there is
// no separate CLI or local read-only RPC to ask for the Skill catalog the way
// the Codex adapter does. Discovery is therefore a bounded read of the
// documented on-disk layout, and every result records that its source is the
// filesystem rather than the running runtime. Nothing here starts a process
// belonging to the desktop application or asks a model anything.
//
// Documented layout used here (code.claude.com/docs/en/skills, /settings,
// /memory), confirmed against Claude Code 2.1.260 in Claude Desktop 1.49585.0:
//   <home>/CLAUDE.md              user-scope instructions
//   <home>/settings.json          user settings, including skillOverrides
//   <home>/rules/*.md             user-scope rules (out of this slice's scope)
//   <home>/skills/<name>/SKILL.md personal Skills
//   <home>/plugins/**             plugin Skills (provider-managed)
//   <project>/.claude/skills/<name>/SKILL.md  project Skills
import { execFile } from 'node:child_process';
import { readdir, lstat, readFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { captureFile } from '../sources/platform.mjs';
import { readSkillOverrides, AUTOMATIC_OVERRIDES, validSkillName } from './settings.mjs';
import { fail } from '../sources/errors.mjs';

const exec = promisify(execFile);
const MAX_ENTRIES = 4096;
const MAX_FRONTMATTER_BYTES = 64 * 1024;

export const MANAGED_SYSTEM_DIRECTORY = '/Library/Application Support/ClaudeCode';
export const MANAGED_POLICY_INSTRUCTIONS = join(MANAGED_SYSTEM_DIRECTORY, 'CLAUDE.md');
export const MANAGED_SETTINGS = join(MANAGED_SYSTEM_DIRECTORY, 'managed-settings.json');
export const MANAGED_SETTINGS_DIRECTORY = join(MANAGED_SYSTEM_DIRECTORY, 'managed-settings.d');

// Settings precedence is managed > project-local > project > user
// (code.claude.com/docs/en/settings). Only the user layer is ever written; the
// others are read to find out whether a user-layer override could take effect.
// `higherPrecedenceOverrides` below reads them in that order.

export const homePaths = (home) => ({
  instructions: join(home, 'CLAUDE.md'),
  settings: join(home, 'settings.json')
});

export const skillRoot = (home) => join(home, 'skills');
export const projectSkillRoot = (project) => join(project, '.claude', 'skills');
export const pluginRoot = (home) => join(home, 'plugins');

/**
 * Desktop application version, read from the installed bundle. This is the
 * freshness key for a Claude registration: an application update invalidates
 * dependent classification and plans. `plutil` handles binary and XML plists
 * and only reads the file.
 */
export async function desktopVersion(appBundle) {
  try {
    const { stdout } = await exec(
      '/usr/bin/plutil',
      ['-convert', 'json', '-o', '-', join(appBundle, 'Contents', 'Info.plist')],
      { maxBuffer: 1024 * 1024 }
    );
    const info = JSON.parse(stdout);
    const version = info?.CFBundleShortVersionString;
    const identifier = info?.CFBundleIdentifier;
    if (
      typeof version !== 'string' ||
      !/^\d{1,8}(\.\d{1,8}){1,3}$/.test(version) ||
      typeof identifier !== 'string' ||
      !/^[A-Za-z0-9.-]{1,128}$/.test(identifier)
    )
      fail('discovery-failed');
    return { version, identifier };
  } catch (e) {
    if (e.kind) throw e;
    fail('discovery-failed');
  }
}

async function directoryNames(path) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return [];
    fail('discovery-failed');
  }
  if (entries.length > MAX_ENTRIES) fail('discovery-failed');
  // A link is neither followed nor silently skipped: it is returned so the
  // caller can report the Skill as unavailable instead of omitting it.
  return entries
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => e.name)
    .filter((name) => !name.startsWith('.'))
    .sort();
}

/**
 * Parse only the leading YAML frontmatter of a SKILL.md. Anything that cannot
 * be read as a plain mapping leaves the invocation flags unknown, which keeps
 * the Skill out of the eligible set rather than guessing its current state.
 */
export async function readSkillFrontmatter(text) {
  if (typeof text !== 'string') return null;
  const normalized = text.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) return {};
  const end = normalized.indexOf('\n---', 3);
  if (end === -1) return null;
  const block = normalized.slice(4, end + 1);
  if (Buffer.byteLength(block, 'utf8') > MAX_FRONTMATTER_BYTES) return null;
  try {
    const { parseDocument, isMap, isScalar, isAlias, visit } = await import('yaml');
    const doc = parseDocument(block, {
      logLevel: 'silent',
      prettyErrors: false,
      uniqueKeys: true,
      strict: true
    });
    if (doc.errors.length || doc.warnings.length) return null;
    visit(doc, {
      Node(_key, node) {
        if (isAlias(node) || node.anchor || node.tag) throw Error('unsupported');
        if (
          isMap(node) &&
          node.items.some(
            (pair) => !isScalar(pair.key) || typeof pair.key.value !== 'string'
          )
        )
          throw Error('unsupported');
      }
    });
    if (doc.contents === null) return {};
    if (!isMap(doc.contents)) return null;
    return doc.toJS({ maxAliasCount: 0 }) ?? {};
  } catch {
    return null;
  }
}

// Claude Code accepts several spellings for a boolean frontmatter flag.
export function frontmatterBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1))
    return value === 1;
  if (typeof value === 'string')
    return ['true', 'yes', 'on', '1'].includes(value.trim().toLowerCase())
      ? true
      : ['false', 'no', 'off', '0'].includes(value.trim().toLowerCase())
        ? false
        : null;
  return null;
}

async function collectSkills(root, scope, pluginId = null) {
  const found = [];
  for (const name of await directoryNames(root)) {
    const directory = join(root, name);
    const path = join(directory, 'SKILL.md');
    found.push({
      path,
      // The invocation name is the directory name for personal and project
      // Skills; a frontmatter `name` does not rename the "/" command.
      name: pluginId ? `${pluginId}:${name}` : name,
      directory,
      scope,
      pluginId
    });
  }
  return found;
}

async function collectPluginSkills(home) {
  const found = [];
  const root = pluginRoot(home);
  for (const marketplace of await directoryNames(root)) {
    for (const plugin of await directoryNames(join(root, marketplace))) {
      found.push(
        ...(await collectSkills(
          join(root, marketplace, plugin, 'skills'),
          'plugin',
          plugin
        ))
      );
    }
  }
  return found;
}

/**
 * The main checkout root of a git worktree, or null.
 *
 * Claude Code reads and writes `.claude/settings.local.json` at the repository
 * root, and in a worktree it uses the main checkout's root
 * (code.claude.com/docs/en/settings). A worktree's `.git` is a file naming its
 * git directory under `<main>/.git/worktrees/<name>`.
 */
export async function mainCheckoutRoot(project) {
  try {
    const marker = join(project, '.git');
    const info = await lstat(marker);
    if (!info.isFile()) return null;
    const text = await readFile(marker, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > 4096) return null;
    const match = text.match(/^gitdir:\s*(.+?)\s*$/m);
    if (!match) return null;
    // <main>/.git/worktrees/<name> -> <main>
    const gitDir = resolve(project, match[1]);
    const worktrees = dirname(gitDir);
    if (basename(worktrees) !== 'worktrees') return null;
    const root = dirname(dirname(worktrees));
    return root === project ? null : root;
  } catch {
    return null;
  }
}

async function layerOverrides(path, unreadable, id) {
  let file;
  try {
    file = await captureFile(path);
  } catch {
    // A layer we cannot even read could still be shadowing the user layer.
    unreadable.push({ id, path, reason: 'unsupported-source' });
    return null;
  }
  if (file === null) return {};
  try {
    return readSkillOverrides(file.text);
  } catch (e) {
    unreadable.push({ id, path, reason: e.kind ?? 'config-transform-failed' });
    return null;
  }
}

/**
 * Skill overrides from every readable layer above the user layer, highest
 * precedence first. Writing the user layer cannot change the effective state of
 * a Skill named in one of these.
 */
export async function higherPrecedenceOverrides(context) {
  const unreadable = [];
  const layers = [];
  const add = async (layer, path, id) => {
    const overrides = await layerOverrides(path, unreadable, id);
    if (overrides && Object.keys(overrides).length)
      layers.push({ layer, path, overrides });
  };
  await add('managed', MANAGED_SETTINGS, 'managed-settings');
  let managedParts = [];
  try {
    managedParts = (await readdir(MANAGED_SETTINGS_DIRECTORY))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .slice(0, 64);
  } catch {
    managedParts = [];
  }
  for (const name of managedParts)
    await add('managed', join(MANAGED_SETTINGS_DIRECTORY, name), 'managed-settings');
  const worktreeRoot = await mainCheckoutRoot(context.project);
  let worktreeLocal = null;
  if (worktreeRoot) {
    const path = join(worktreeRoot, '.claude', 'settings.local.json');
    const before = layers.length;
    await add('project-local', path, 'worktree-local-settings');
    worktreeLocal = {
      path,
      overrideCount:
        layers.length > before ? Object.keys(layers.at(-1).overrides).length : 0
    };
  }
  await add(
    'project-local',
    join(context.project, '.claude', 'settings.local.json'),
    'project-local-settings'
  );
  await add('project', join(context.project, '.claude', 'settings.json'), 'project-settings');
  return { layers, unreadable, worktreeRoot, worktreeLocal };
}

/** The highest-precedence layer that names this Skill, or null. */
export function shadowOf(layers, name) {
  for (const entry of layers)
    if (Object.hasOwn(entry.overrides, name))
      return { layer: entry.layer, path: entry.path, setting: entry.overrides[name] };
  return null;
}

/**
 * The catalog Unharness can establish from disk. `enabled` is the recorded
 * automatic-invocation state: the model may select the Skill on its own only
 * when neither the settings override nor the SKILL.md frontmatter withdraws it.
 */
export async function catalog(context) {
  const { version, identifier } = await desktopVersion(context.appBundle);
  const home = context.claudeHome;
  const settings = await captureFile(homePaths(home).settings).catch(() => null);
  let overrides = null,
    overridesReason = null;
  try {
    overrides = readSkillOverrides(settings?.text ?? '');
  } catch (e) {
    overridesReason = e.kind ?? 'config-transform-failed';
  }
  const higher = await higherPrecedenceOverrides(context);
  const discovered = [
    ...(await collectSkills(skillRoot(home), 'user')),
    ...(await collectSkills(projectSkillRoot(context.project), 'repo')),
    ...(await collectPluginSkills(home))
  ];
  if (discovered.length > 2048) fail('discovery-failed');
  const counts = new Map();
  for (const s of discovered)
    counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  const skills = [];
  for (const s of discovered) {
    // A higher-precedence layer wins outright, so it decides both the current
    // state and whether the user layer could change it at all.
    const shadow = shadowOf(higher.layers, s.name);
    const override = shadow ? shadow.setting : overrides?.[s.name];
    skills.push({
      ...s,
      // A name that is not a usable override key, or that two discovered
      // Skills share, cannot be addressed by settings without ambiguity.
      addressable:
        validSkillName(s.name) && counts.get(s.name) === 1 && !overridesReason,
      shadowedBy: shadow ? shadow.layer : null,
      override: override ?? null,
      enabled:
        override === undefined || override === null
          ? null
          : AUTOMATIC_OVERRIDES.includes(override)
    });
  }
  skills.sort((a, b) => a.path.localeCompare(b.path));
  return {
    version,
    identifier,
    overridesReason,
    higherPrecedenceLayers: higher.layers.map((l) => ({
      layer: l.layer,
      path: l.path,
      names: Object.keys(l.overrides).sort()
    })),
    unreadableLayers: higher.unreadable,
    worktreeRoot: higher.worktreeRoot,
    worktreeLocal: higher.worktreeLocal,
    // A CLI-visible runtime version is not obtainable without a task record.
    runtimeVersion: null,
    skills
  };
}

export const catalogIdentity = (s) => ({
  path: s.path,
  name: s.name,
  scope: s.scope,
  pluginId: s.pluginId
});

/**
 * User-scope instruction sources that this slice deliberately does not manage.
 * They stay visible so a TRUEFORM absence claim is never read as covering them.
 */
export async function outOfScopeInstructionSources(home) {
  const notices = [];
  const rules = join(home, 'rules');
  let ruleFiles = [];
  try {
    const entries = await readdir(rules, { withFileTypes: true, recursive: true });
    ruleFiles = entries
      .filter((e) => (e.isFile() || e.isSymbolicLink()) && e.name.endsWith('.md'))
      .slice(0, MAX_ENTRIES);
  } catch (e) {
    if (!['ENOENT', 'ENOTDIR'].includes(e.code)) ruleFiles = [];
  }
  if (ruleFiles.length)
    notices.push({
      id: 'user-rules',
      kind: 'unmanaged-instruction-source',
      label: 'User rules directory',
      path: rules,
      count: ruleFiles.length,
      detail:
        'Files under <home>/rules load in every session and are not changed by any mode.'
    });
  let managed = null;
  try {
    managed = await lstat(MANAGED_POLICY_INSTRUCTIONS);
  } catch {
    managed = null;
  }
  if (managed)
    notices.push({
      id: 'managed-policy-instructions',
      kind: 'managed-source',
      label: 'Managed policy instructions',
      path: MANAGED_POLICY_INSTRUCTIONS,
      count: 1,
      detail:
        'Organization-managed instructions cannot be excluded and are preserved in every mode.'
    });
  return notices;
}

/**
 * `@path` imports inside the selected instruction file. Replacing the file in
 * UNSEAL or TRUEFORM also removes whatever those imports pulled in, which is
 * reported rather than left implicit.
 */
export function instructionImports(text) {
  if (typeof text !== 'string') return [];
  const withoutFences = text
    .replaceAll(/```[\s\S]*?```/g, '')
    .replaceAll(/`[^`\n]*`/g, '');
  const found = new Set();
  for (const match of withoutFences.matchAll(/(?:^|\s)@([^\s`]{1,512})/g))
    found.add(match[1]);
  return [...found].slice(0, 64);
}

export { basename, dirname };
