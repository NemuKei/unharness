// Claude Code desktop adapter.
//
// Differences from the Codex adapter that the shared core has to accommodate,
// each one a property of Claude Code rather than a design preference:
//
//   * There is one user-scope instruction file, <home>/CLAUDE.md, with no
//     override/base pair. Nothing falls back when it is replaced, so TRUEFORM
//     writes an inert HTML comment: Claude Code strips block-level comments
//     before injecting a memory file, and keeping the file present avoids
//     deleting a user file to express absence.
//   * Skill invocation policy lives in one user settings file
//     (<home>/settings.json, `skillOverrides`) keyed by the Skill's invocation
//     name, not in per-Skill sidecars. SKILL.md is therefore captured and
//     guarded but never written. UNSEAL uses "user-invocable-only" (manual
//     only), TRUEFORM uses "off".
//   * Claude Code ships inside the desktop bundle with no CLI or local
//     read-only RPC on this machine, so the catalog is a bounded filesystem
//     read and the freshness key is the desktop bundle version. The runtime
//     version is only observable from a task recording.
//   * Task recordings are per-session JSONL with startup attachments
//     ("instructions", "skill_listing") instead of a world-state record, so
//     observations use schemaVersion 2.
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  canPlanOwnership,
  canonical,
  captureFile,
  equal,
  parentBinding
} from '../sources/platform.mjs';
import { samePath } from '../sources/paths.mjs';
import { hash } from '../sources/hash.mjs';
import { conditionId, QUALIFIED_CLAUDE_VERSIONS } from '../sources/observation-record.mjs';
import { fail, verification } from '../sources/errors.mjs';

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const digest = (text) => createHash('sha256').update(text).digest('hex');
const normalize = (text) => text.replaceAll('\r\n', '\n').trim();
const INERT_INSTRUCTIONS = '<!-- -->\n';
const CAPTURE_REASONS = [
  'unsupported-metadata',
  'source-redirection',
  'source-too-large',
  'unsupported-source'
];

const globalPaths = (home) => ({
  instructions: join(home, 'CLAUDE.md'),
  settings: join(home, 'settings.json')
});

const effectiveText = (files) => files.instructions?.text ?? '';

export const application = {
  id: 'claude',
  label: 'Claude Code',
  home: (context) => context.claudeHome,

  async contextOf(context) {
    if (
      !object(context) ||
      context.application !== 'claude' ||
      Object.keys(context).some(
        (k) => !['application', 'claudeHome', 'project', 'appBundle'].includes(k)
      )
    )
      fail('invalid-request');
    const { claudeHome, project, appBundle } = context;
    await canonical(claudeHome);
    await canonical(project);
    // The installed application identifies the desktop version that a plan
    // depends on. It is read, never launched.
    await canonical(appBundle);
    return { application: 'claude', claudeHome, project, appBundle };
  },

  ownedMarkerPath: (home) => join(home, '.unharness-owned-profile.json'),

  readOwnedMarker(marker, context) {
    const m = JSON.parse(marker.text);
    if (
      m.claudeHome !== context.claudeHome ||
      m.project !== context.project ||
      m.root !== dirname(context.claudeHome)
    )
      fail('unsupported-source');
    return m.root;
  },

  limitations: Object.freeze([
    'hooks unchanged',
    'user rules and managed policy instructions unchanged',
    'catalog read from the documented on-disk layout, not from the running runtime',
    // Managed settings can also arrive by MDM profile, the claude.ai console or
    // the embedding desktop app, none of which is a file this can read.
    'a managed policy delivered outside a file cannot be read; only a fresh task confirms the effective state',
    'only prepared file state; fresh desktop task required'
  ]),

  async discover(context, ownedRoot) {
    const {
      catalog,
      catalogIdentity,
      readSkillFrontmatter,
      frontmatterBoolean,
      outOfScopeInstructionSources,
      instructionImports
    } = await import('../claude/catalog.mjs');
    const cat = await catalog(context);
    const paths = globalPaths(context.claudeHome);
    const files = {},
      bindings = {},
      unavailableSources = [];
    for (const [key, path] of Object.entries(paths)) {
      try {
        files[key] = await captureFile(path);
        bindings[key] = await parentBinding(path);
      } catch (e) {
        if (!CAPTURE_REASONS.includes(e.kind)) throw e;
        files[key] = null;
        bindings[key] = null;
        unavailableSources.push({ id: key, reason: e.kind });
      }
    }
    if (cat.overridesReason && !unavailableSources.some((u) => u.id === 'settings'))
      unavailableSources.push({ id: 'settings', reason: cat.overridesReason });
    // A settings layer above the user layer that cannot be read could be
    // shadowing any override, so the effective state is not established.
    for (const layer of cat.unreadableLayers)
      unavailableSources.push({ id: layer.id, reason: layer.reason });
    const globalReason = unavailableSources[0]?.reason ?? null;

    const hasInstructions = !!files.instructions?.text.trim();
    const instructionOwnership = canPlanOwnership(files.instructions);
    const settingsOwnership = canPlanOwnership(files.settings);
    const instructions = {
      id:
        'instructions-' +
        hash({ paths, instructions: files.instructions }),
      label: 'Global Claude Code instructions',
      path: paths.instructions,
      effective: hasInstructions ? 'instructions' : null,
      eligible: hasInstructions && !globalReason && instructionOwnership,
      availability: {
        normal: !globalReason && instructionOwnership,
        unseal: hasInstructions && !globalReason && instructionOwnership,
        trueform: hasInstructions && !globalReason && instructionOwnership
      },
      reason:
        globalReason ??
        (!instructionOwnership
          ? 'unsupported-metadata'
          : hasInstructions
            ? null
            : 'no-effective-instructions')
    };

    const skills = [];
    for (const s of cat.skills) {
      const identity = catalogIdentity(s);
      let eligible =
        !globalReason &&
        ['user', 'repo'].includes(s.scope) &&
        s.addressable &&
        // Only the user layer is written. A higher-precedence layer naming this
        // Skill would win, so a user-layer write could not take effect.
        s.shadowedBy === null;
      if (ownedRoot) {
        const rel = relative(ownedRoot, s.path);
        if (rel.startsWith('..') || isAbsolute(rel)) eligible = false;
      }
      let reason = eligible
          ? null
          : s.scope === 'plugin'
            ? 'provider-managed-or-outside-owned-profile'
            : !s.addressable
              ? 'skill-name-not-addressable'
              : s.shadowedBy !== null
                ? 'skill-override-shadowed'
                : 'provider-managed-or-outside-owned-profile',
        body = null,
        binding = null,
        modelInvocable = null,
        userInvocable = true;
      // The current state is read for every user or project Skill, including
      // one this cannot control: a shadowed Skill still has a truthful state.
      const readable =
        !globalReason && ['user', 'repo'].includes(s.scope) && s.addressable;
      if (readable)
        try {
          if (
            !isAbsolute(s.path) ||
            resolve(s.path) !== s.path ||
            !s.path.endsWith('/SKILL.md')
          )
            fail('unsupported-source');
          body = await captureFile(s.path);
          if (!body) fail('unsupported-source');
          binding = await parentBinding(s.path);
          const front = await readSkillFrontmatter(body.text);
          if (front === null) fail('unsupported-source');
          const disableModel = frontmatterBoolean(
            front['disable-model-invocation']
          );
          const userFlag = frontmatterBoolean(front['user-invocable']);
          if (
            (Object.hasOwn(front, 'disable-model-invocation') &&
              disableModel === null) ||
            (Object.hasOwn(front, 'user-invocable') && userFlag === null)
          )
            fail('unsupported-source');
          userInvocable = userFlag !== false;
          // Automatic selection needs both the settings override and the
          // Skill's own frontmatter to allow it.
          modelInvocable = (s.enabled ?? true) && disableModel !== true;
        } catch (e) {
          if (eligible) reason = e.kind ?? 'unsupported-source';
          eligible = false;
        }
      // Both release modes edit only the user settings file. A Skill the model
      // already cannot select needs no UNSEAL write at all.
      const unsealAvailable =
        eligible &&
        userInvocable &&
        (!modelInvocable || settingsOwnership);
      const trueformAvailable = eligible && settingsOwnership;
      const ownershipLimited = eligible && !settingsOwnership;
      eligible = eligible && (unsealAvailable || trueformAvailable);
      const sourceDigest = hash({ body });
      skills.push({
        id: 'skill-' + hash({ identity, sourceDigest }),
        sourceDigest,
        label: s.name,
        path: s.path,
        scope: s.scope,
        pluginId: s.pluginId,
        // A registered Skill always has a read frontmatter state. For a row
        // this cannot read - a plugin Skill - fall back to what the winning
        // settings layer says rather than defaulting to "off".
        enabled: modelInvocable ?? s.enabled ?? false,
        override: s.override,
        shadowedBy: s.shadowedBy,
        eligible,
        availability: {
          normal: eligible,
          unseal: unsealAvailable,
          trueform: trueformAvailable
        },
        reason:
          reason ??
          (ownershipLimited
            ? 'unsupported-metadata'
            : !userInvocable
              ? 'manual-control-unavailable'
              : null),
        identity,
        body,
        binding
      });
    }

    const notices = await outOfScopeInstructionSources(context.claudeHome);
    const imports = instructionImports(files.instructions?.text ?? '');
    if (imports.length)
      notices.push({
        id: 'instruction-imports',
        kind: 'replaced-with-instructions',
        label: 'Imports inside the selected instruction file',
        path: paths.instructions,
        count: imports.length,
        detail:
          'UNSEAL and TRUEFORM replace this file, so whatever these @ imports load is also absent until Normal is restored.'
      });
    for (const layer of cat.higherPrecedenceLayers)
      notices.push({
        id: 'higher-precedence-settings',
        kind: 'higher-precedence-settings',
        label: `Skill overrides in ${layer.layer} settings`,
        path: layer.path,
        count: layer.names.length,
        detail:
          'These entries win over the user settings file, so a Skill named here cannot be controlled by any mode.'
      });
    if (cat.worktreeLocal)
      notices.push({
        id: 'worktree-local-settings',
        kind: 'higher-precedence-settings',
        label: 'Main checkout local settings',
        path: cat.worktreeLocal.path,
        // The count is the Skill overrides actually found there, so an absent
        // or empty file does not read as one that shadows something.
        count: cat.worktreeLocal.overrideCount,
        detail:
          'This project is a git worktree, so Claude Code reads its local settings from the main checkout root.'
      });
    const excluded = cat.skills.filter((s) => s.scope === 'plugin');
    if (excluded.length)
      notices.push({
        id: 'plugin-skills',
        kind: 'managed-source',
        label: 'Plugin Skills',
        path: join(context.claudeHome, 'plugins'),
        count: excluded.length,
        detail:
          'Plugin-owned Skills are provider sources and are retained unchanged in every mode.'
      });

    return {
      version: cat.version,
      unavailableSources,
      instructions,
      skills,
      files,
      bindings,
      notices
    };
  },

  assertRegistrationOwnership(d, selected, instructionsOptional) {
    if (instructionsOptional && !canPlanOwnership(d.files.instructions))
      fail('unsupported-metadata');
    // Every selected Skill is controlled through the one settings file.
    if (selected.length && !canPlanOwnership(d.files.settings))
      fail('unsupported-metadata');
    for (const skill of d.skills.filter((s) => selected.includes(s.id))) {
      if (skill.shadowedBy !== null) fail('unsupported-source');
      if (!skill.availability.unseal && !skill.availability.trueform)
        fail('unsupported-metadata');
    }
  },

  // A registered Skill remembers that no higher-precedence layer named it, so a
  // layer added later invalidates its plans instead of preparing a write that
  // cannot take effect.
  registeredSkillFields: (s) => ({ shadowedBy: s.shadowedBy ?? null }),

  pathsFor(reg) {
    const p = globalPaths(reg.context.claudeHome);
    // SKILL.md is captured and guarded; it is never a control target.
    for (const s of reg.skills) p[s.id + ':body'] = s.path;
    return p;
  },

  controlKeys(reg) {
    return ['settings', ...(reg.instructions ? ['instructions'] : [])];
  },

  // The one registered file that mixes managed and retained settings: the
  // selected Skills' overrides are managed, every other key is retained.
  retainedKey: 'settings',
  retainedCategories: Object.freeze(['Claude Code settings']),

  async mergeRetained({ reg, baseText, targetText, currentText }) {
    const { mergeRetainedSettings } = await import(
      '../claude/settings-reconcile.mjs'
    );
    const { desktopVersion } = await import('../claude/catalog.mjs');
    const merged = mergeRetainedSettings({
      baseText,
      targetText,
      currentText,
      skillNames: reg.skills.map((s) => s.identity.name)
    });
    // A settings file carries no runtime version, so the interpreting
    // application's version is what a retained recording depends on.
    const { version } = await desktopVersion(reg.context.appBundle);
    return { ...merged, version };
  },

  // Only the guarded body backs a registered Claude Skill; invocation policy
  // lives in the shared settings file, not in a per-Skill sidecar.
  skillFiles: (s) => ({ [s.id + ':body']: { file: s.body, binding: s.binding } }),

  rejectsRegisteredSkill: (s) => s.scope === 'plugin' || !!s.pluginId,

  skillSourceDigest: (snapshot, s) => hash({ body: snapshot[s.id + ':body'] }),

  changedFileLabel: (id) =>
    id === 'instructions'
      ? 'Global instruction file'
      : id === 'settings'
        ? 'Skill invocation settings'
        : 'Skill body',

  async assertFreshCatalog(reg) {
    const { catalog, catalogIdentity } = await import('../claude/catalog.mjs');
    const current = await catalog(reg.context);
    if (current.version !== reg.version) fail('stale-discovery');
    if (current.unreadableLayers.length) fail('stale-discovery');
    for (const s of reg.skills) {
      const found = current.skills.find((c) => equal(catalogIdentity(c), s.identity));
      if (!found) fail('stale-discovery');
      // A higher-precedence override added since registration would win over
      // anything this writes, so the plan is no longer preparable.
      if ((found.shadowedBy ?? null) !== (s.shadowedBy ?? null))
        fail('stale-discovery');
    }
  },

  async compile({ reg, mode, selection, normal, targetFile }) {
    const after = structuredClone(normal);
    let guide = null;
    const skillStates = [];
    if (mode === 'normal') return { after, guide, skillStates };
    if (reg.instructions && selection.includes(reg.instructions.id)) {
      const { getMinimalGuide } = await import('../sources/guide.mjs');
      const fixed = getMinimalGuide();
      after.instructions = await targetFile(
        'instructions',
        mode === 'unseal' ? fixed.text : INERT_INSTRUCTIONS
      );
      if (mode === 'unseal') {
        const { text, ...identity } = fixed;
        guide = identity;
      }
    }
    const skills = reg.skills.filter((s) => selection.includes(s.id));
    const manualNames = [],
      disabledNames = [];
    for (const s of skills) {
      skillStates.push({
        id: s.id,
        enabled: mode === 'trueform' ? false : s.enabled,
        manualOnly: mode === 'unseal' && s.enabled
      });
      if (mode === 'trueform') disabledNames.push(s.identity.name);
      else if (s.enabled) manualNames.push(s.identity.name);
    }
    if (manualNames.length || disabledNames.length) {
      const { setSkillOverrides, MANUAL_ONLY_OVERRIDE, DISABLED_OVERRIDE } =
        await import('../claude/settings.mjs');
      let text = normal.settings?.text ?? '';
      if (manualNames.length)
        text = setSkillOverrides(text, manualNames, MANUAL_ONLY_OVERRIDE);
      if (disabledNames.length)
        text = setSkillOverrides(text, disabledNames, DISABLED_OVERRIDE);
      if (text !== (normal.settings?.text ?? ''))
        after.settings = await targetFile('settings', text);
    }
    return { after, guide, skillStates };
  },

  async expectations(w, files, normal) {
    const { getMinimalGuide } = await import('../sources/guide.mjs');
    const {
      readSkillOverrides,
      MANUAL_ONLY_OVERRIDE,
      DISABLED_OVERRIDE,
      AUTOMATIC_OVERRIDES
    } = await import('../claude/settings.mjs');
    const { readSkillFrontmatter, frontmatterBoolean } = await import(
      '../claude/catalog.mjs'
    );
    const result = [];
    if (w.reg.instructions) {
      const text = normalize(effectiveText(files));
      const expected =
        text === normalize(effectiveText(normal))
          ? 'saved-instructions'
          : text === normalize(getMinimalGuide().text)
            ? 'minimal-guide'
            : text === normalize(INERT_INSTRUCTIONS)
              ? 'inert-instructions'
              : 'unknown';
      result.push({
        sourceId: w.reg.instructions.id,
        category: 'instructions',
        expected,
        text
      });
    }
    let overrides = null;
    try {
      overrides = readSkillOverrides(files.settings?.text ?? '');
    } catch {
      /* Unsupported settings cannot establish selected intent. */
    }
    for (const s of w.reg.skills) {
      const name = s.identity.name;
      let expected = 'unknown';
      if (overrides) {
        const override = overrides[name];
        if (override === DISABLED_OVERRIDE) expected = 'disabled';
        else if (override === MANUAL_ONLY_OVERRIDE) expected = 'manual-only';
        else if (override === undefined || AUTOMATIC_OVERRIDES.includes(override)) {
          // The Skill's own frontmatter can still withdraw automatic selection.
          const front = await readSkillFrontmatter(
            files[s.id + ':body']?.text ?? ''
          );
          const disableModel =
            front === null
              ? null
              : frontmatterBoolean(front['disable-model-invocation']);
          expected =
            front === null
              ? 'unknown'
              : disableModel === true
                ? 'manual-only'
                : disableModel === false || disableModel === null
                  ? 'automatic-catalog'
                  : 'unknown';
        }
      }
      result.push({
        sourceId: s.id,
        category: 'skill',
        expected,
        name,
        path: s.path
      });
    }
    return result;
  },

  // Claude Code on macOS ships inside the desktop bundle with no CLI and no
  // local read-only RPC, so nothing can report the runtime's own resolved
  // configuration layers, Skill catalog and hooks before a replay attempt, and
  // nothing can open one specific project as a fresh task. Ordinary recorded
  // runs and saved starting conditions stay available; a replay is refused
  // with this reason rather than substituting a weaker comparison.
  sequentialReplay: Object.freeze({
    supported: false,
    reason:
      'Claude Code on macOS exposes no local runtime conditions report or project-open command for a qualified replay attempt.'
  }),

  // Ordinary-run measurement for one recorded task.
  runParser: 'claude-desktop',

  // Reading a recording for a comparison fails loudly: an unavailable record
  // must never become an empty measurement.
  async readRunRecords(w, taskId) {
    const { findCurrentDesktopSession, readDesktopRecords } = await import(
      '../claude/desktop-record.mjs'
    );
    try {
      return await readDesktopRecords(
        await findCurrentDesktopSession({ sessionId: taskId, claudeHome: w.reg.context.claudeHome })
      );
    } catch (e) {
      fail(
        e.kind === 'current-session-unavailable'
          ? 'comparison-task-record-unavailable'
          : 'comparison-task-record-invalid'
      );
    }
  },

  async projectRun(w, records, options) {
    const { projectClaudeRun } = await import('../claude/run-metrics.mjs');
    return projectClaudeRun(records, options);
  },

  async readTaskRecords(w, taskId) {
    const { findCurrentDesktopSession, readDesktopRecords } = await import(
      '../claude/desktop-record.mjs'
    );
    try {
      const session = await findCurrentDesktopSession({
        sessionId: taskId,
        claudeHome: w.reg.context.claudeHome
      });
      return {
        records: (await readDesktopRecords(session)).records,
        readIssue: null
      };
    } catch (e) {
      return {
        records: [],
        readIssue:
          e.kind === 'current-session-unavailable'
            ? 'task-record-unavailable'
            : 'task-record-invalid'
      };
    }
  },

  projectTask(w, taskId, expected, records, observedAt, readIssue, boundary) {
    return projection(w, taskId, expected, records, observedAt, readIssue, boundary);
  }
};

function startupFields(records) {
  const withSession = records.filter(
    (r) =>
      object(r) &&
      typeof r.sessionId === 'string' &&
      ['user', 'assistant', 'attachment', 'system'].includes(r.type)
  );
  const first = withSession[0] ?? null;
  const attachment = (type) => {
    for (const r of records)
      if (r?.type === 'attachment' && r.attachment?.type === type)
        return r.attachment;
    return null;
  };
  const effort = records.find(
    (r) => r?.type === 'assistant' && typeof r.effort === 'string'
  )?.effort;
  return {
    header: first
      ? {
          sessionId:
            new Set(withSession.map((r) => r.sessionId)).size === 1
              ? first.sessionId
              : null,
          version: typeof first.version === 'string' ? first.version : null,
          cwd: typeof first.cwd === 'string' ? first.cwd : null,
          entrypoint:
            typeof first.entrypoint === 'string' ? first.entrypoint : null,
          userType: typeof first.userType === 'string' ? first.userType : null,
          timestamp:
            typeof first.timestamp === 'string' &&
            Number.isFinite(Date.parse(first.timestamp))
              ? first.timestamp
              : null,
          anySidechain: withSession.some((r) => r.isSidechain === true),
          permissionMode:
            withSession
              .map((r) => r.permissionMode)
              .find((v) => typeof v === 'string') ?? null
        }
      : null,
    instructions: attachment('instructions'),
    skillListing: attachment('skill_listing'),
    model: attachment('model'),
    effort: typeof effort === 'string' ? effort : null,
    completed: records.some(
      (r) =>
        r?.type === 'assistant' &&
        object(r.message) &&
        ['end_turn', 'stop_sequence', 'max_tokens'].includes(r.message.stop_reason)
    )
  };
}

function projection(w, taskId, expected, records, observedAt, readIssue, boundary) {
  const reasons = [];
  const add = (value) => {
    if (!reasons.includes(value)) reasons.push(value);
  };
  const { header, instructions, skillListing, model, effort, completed } =
    startupFields(records);
  const instructionFiles = Array.isArray(instructions?.files)
    ? instructions.files.filter(
        (f) => object(f) && typeof f.path === 'string' && typeof f.content === 'string'
      )
    : null;
  const userInstructionPath = globalPaths(w.reg.context.claudeHome).instructions;
  const projectFiles = (instructionFiles ?? []).filter(
    (f) => !samePath(f.path, userInstructionPath)
  );
  const conditions = {
    runtimeVersion:
      typeof header?.version === 'string' &&
      /^\d{1,8}(\.\d{1,8}){1,3}$/.test(header.version)
        ? header.version
        : null,
    desktopVersion: typeof w.reg.version === 'string' ? w.reg.version : null,
    model: conditionId(model?.identity?.modelId),
    reasoningEffort: ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)
      ? effort
      : null,
    executionPolicyDigest: header?.permissionMode
      ? digest(JSON.stringify({ permissionMode: header.permissionMode }))
      : null,
    projectInstructionsDigest: projectFiles.length
      ? digest(
          JSON.stringify(
            projectFiles
              .map((f) => [f.path, normalize(f.content)])
              .sort((a, b) => a[0].localeCompare(b[0]))
          )
        )
      : null,
    // A recorded auto-memory index. A false value means "not recorded here",
    // never that the user's memory is disabled or empty.
    memoryGuidanceRecorded: (instructionFiles ?? []).some((f) =>
      /[\\/]memory[\\/]MEMORY\.md$/.test(f.path)
    )
  };
  let unqualified = false;
  if (boundary.issue) add(boundary.issue);
  if (readIssue) add(readIssue);
  if (!header) add('session-header-unavailable');
  else {
    const reject = (code) => {
      add(code);
      unqualified = true;
    };
    if (header.sessionId !== taskId) reject('task-identity-mismatch');
    if (header.entrypoint !== 'claude-desktop') reject('task-origin-unqualified');
    if (header.userType !== 'external') reject('task-route-unqualified');
    // A recorded sidechain belongs to a subagent, not to the requested task.
    if (header.anySidechain) reject('task-forked');
    if (!samePath(header.cwd, w.reg.context.project)) reject('task-project-mismatch');
    if (!header.timestamp) add('task-record-invalid');
    else {
      if (
        boundary.preparation &&
        Date.parse(header.timestamp) < Date.parse(boundary.preparation.preparedAt)
      )
        reject('task-before-preparation');
      if (Date.parse(header.timestamp) > Date.parse(observedAt))
        reject('task-start-in-future');
    }
    if (!completed) reject('task-incomplete');
  }
  const qualifiedRuntime = QUALIFIED_CLAUDE_VERSIONS.includes(
    conditions.runtimeVersion
  );
  if (!qualifiedRuntime) add('unsupported-claude-version');

  const catalogNames =
    qualifiedRuntime && Array.isArray(skillListing?.names)
      ? skillListing.names.filter((n) => typeof n === 'string')
      : null;
  const sources = expected.map((s) => {
    const result = {
      sourceId: s.sourceId,
      category: s.category,
      expected: s.expected,
      recorded: 'unknown',
      status: 'unknown'
    };
    if (!qualifiedRuntime || s.expected === 'unknown') {
      if (s.expected === 'unknown') add('skill-state-unavailable');
      return result;
    }
    if (s.category === 'instructions') {
      if (!instructionFiles) {
        add('instruction-field-unavailable');
        return result;
      }
      const entry = instructionFiles.find((f) =>
        samePath(f.path, userInstructionPath)
      );
      if (!entry) {
        // No user-scope instruction file reached the session.
        result.recorded = 'absent';
        result.status = s.expected === 'inert-instructions' ? 'matched' : 'not-matched';
        if (result.status === 'not-matched') add('instruction-prefix-mismatch');
        return result;
      }
      const text = normalize(entry.content);
      // Claude Code strips block-level HTML comments before injection, so an
      // inert file may be recorded either verbatim or as empty content.
      const match =
        s.expected === 'inert-instructions'
          ? text === s.text || text === ''
          : text === s.text;
      result.recorded = match ? 'matching-prefix' : 'different-prefix';
      result.status = match ? 'matched' : 'not-matched';
      if (!match) add('instruction-prefix-mismatch');
    } else {
      if (!catalogNames) {
        add('skill-catalog-unavailable');
        return result;
      }
      const matches = catalogNames.filter((n) => n === s.name);
      if (matches.length > 1) {
        add('skill-catalog-unavailable');
        return result;
      }
      const present = matches.length === 1;
      result.recorded = present ? 'present' : 'absent';
      result.status =
        present === (s.expected === 'automatic-catalog') ? 'matched' : 'not-matched';
      if (result.status === 'not-matched') add('skill-catalog-mismatch');
    }
    return result;
  });
  const unknown =
    boundary.issue ||
    readIssue ||
    !header ||
    reasons.includes('task-record-invalid') ||
    !qualifiedRuntime ||
    sources.some((s) => s.status === 'unknown');
  const status = boundary.issue
    ? 'unknown-record'
    : unqualified
      ? 'unqualified-record'
      : unknown
        ? 'unknown-record'
        : sources.some((s) => s.status === 'not-matched')
          ? 'not-matched-record'
          : 'matched-record';
  return {
    role: 'task-observation',
    schemaVersion: 2,
    application: 'claude',
    taskId,
    scopeId: w.scopeId,
    snapshotId: w.state.snapshotId,
    preparationId: boundary.preparation?.id ?? null,
    preparedMode: w.state.preparedMode,
    observedAt,
    status,
    reasons,
    sources,
    conditions,
    verification
  };
}
