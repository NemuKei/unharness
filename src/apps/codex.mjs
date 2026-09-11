// Codex desktop adapter.
//
// This module holds the Codex-specific source layout, mode compilation and
// task-record projection that the registered-source core used to inline. The
// behavior is unchanged: the same paths, eligibility rules, plan bytes,
// observation reasons and persisted record shape (schemaVersion 1) as before
// the application seam existed. Native RPC, YAML and the desktop record reader
// stay behind lazy imports so the Node-only recovery path keeps its import
// budget.
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { recordedDesktopOrigin } from '../codex/desktop-origin.mjs';
import { canPlanOwnership, canonical, captureFile, parentBinding } from '../sources/platform.mjs';
import { samePath } from '../sources/paths.mjs';
import { hash } from '../sources/hash.mjs';
import { conditionId } from '../sources/observation-record.mjs';
import { parseSkillCatalog, selectedSkillIntent } from '../codex/skill-listing.mjs';
import { fail, verification } from '../sources/errors.mjs';

export { parseSkillCatalog, selectedSkillIntent };

const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const digest = (text) => createHash('sha256').update(text).digest('hex');
const normalize = (text) => text.replaceAll('\r\n', '\n').trim();
const effective = (files) =>
  files.override?.text?.trim() ? files.override.text : (files.base?.text ?? '');

function globalPaths(home) {
  return {
    base: join(home, 'AGENTS.md'),
    override: join(home, 'AGENTS.override.md'),
    config: join(home, 'config.toml')
  };
}

export const application = {
  id: 'codex',
  label: 'Codex',
  home: (context) => context.codexHome,

  // Persisted Codex contexts keep their original three fields with no
  // application marker, so old registrations open without any migration.
  async contextOf(context) {
    if (
      !object(context) ||
      Object.keys(context).some(
        (k) => !['application', 'codexHome', 'project', 'executable'].includes(k)
      )
    )
      fail('invalid-request');
    const { codexHome, project, executable = 'codex' } = context;
    await canonical(codexHome);
    await canonical(project);
    if (
      typeof executable !== 'string' ||
      !executable ||
      /\.(cmd|bat)$/i.test(executable)
    )
      fail('invalid-request');
    return { codexHome, project, executable };
  },

  ownedMarkerPath: (home) => join(home, '.unharness-owned-profile.json'),

  readOwnedMarker(marker, context) {
    const m = JSON.parse(marker.text);
    if (
      m.codexHome !== context.codexHome ||
      m.project !== context.project ||
      m.root !== dirname(context.codexHome)
    )
      fail('unsupported-source');
    return m.root;
  },

  limitations: Object.freeze([
    'hooks unchanged',
    'only prepared file state; fresh desktop task required'
  ]),

  async discover(context, ownedRoot) {
    const { catalog, catalogIdentity } = await import('../codex/catalog.mjs');
    const cat = await catalog(context);
    const paths = globalPaths(context.codexHome);
    const files = {},
      bindings = {},
      unavailableSources = [];
    for (const [key, path] of Object.entries(paths)) {
      try {
        files[key] = await captureFile(path);
        bindings[key] = await parentBinding(path);
      } catch (e) {
        if (
          ![
            'unsupported-metadata',
            'source-redirection',
            'source-too-large',
            'unsupported-source'
          ].includes(e.kind)
        )
          throw e;
        files[key] = null;
        bindings[key] = null;
        unavailableSources.push({ id: key, reason: e.kind });
      }
    }
    const globalReason = unavailableSources[0]?.reason ?? null;
    const effectiveKey = files.override?.text.trim()
      ? 'override'
      : files.base?.text.trim()
        ? 'base'
        : null;
    const instructionId =
      'instructions-' +
      hash({ paths, base: files.base, override: files.override });
    const instructionOwnership = canPlanOwnership(files.override);
    const configOwnership = canPlanOwnership(files.config);
    const instructions = {
      id: instructionId,
      label: 'Global Codex instructions',
      path: effectiveKey ? paths[effectiveKey] : paths.override,
      effective: effectiveKey,
      eligible: !!effectiveKey && !globalReason && instructionOwnership,
      availability: {
        normal: !globalReason && instructionOwnership,
        unseal: !!effectiveKey && !globalReason && instructionOwnership,
        trueform: !!effectiveKey && !globalReason && instructionOwnership
      },
      reason:
        globalReason ??
        (!instructionOwnership
          ? 'unsupported-metadata'
          : effectiveKey
            ? null
            : 'no-effective-instructions')
    };
    const skills = [];
    for (const s of cat.skills) {
      const identity = catalogIdentity(s);
      let eligible =
        !globalReason &&
        ['user', 'repo'].includes(s.scope) &&
        !s.path.includes('/.system/') &&
        !s.pluginId?.includes('@openai-');
      if (ownedRoot) {
        const rel = relative(ownedRoot, s.path);
        if (rel.startsWith('..') || isAbsolute(rel)) eligible = false;
      }
      let reason = eligible ? null : 'provider-managed-or-outside-owned-profile',
        body = null,
        policy = null,
        format = null,
        binding = null,
        policyBinding = null,
        formatBinding = null;
      let manual = false;
      if (eligible)
        try {
          if (
            !isAbsolute(s.path) ||
            resolve(s.path) !== s.path ||
            (!s.path.endsWith('/SKILL.md') && !s.path.endsWith('\\SKILL.md'))
          )
            fail('unsupported-source');
          body = await captureFile(s.path);
          if (!body) fail('unsupported-source');
          binding = await parentBinding(s.path);
          const policyPath = join(dirname(s.path), 'agents', 'openai.yaml');
          policy = await captureFile(policyPath);
          policyBinding = await parentBinding(policyPath);
          const formatPath = join(dirname(s.path), 'SKILL.json');
          format = await captureFile(formatPath);
          formatBinding = await parentBinding(formatPath);
          // Plugin/provider cache ownership is never inferred from a path under home.
          if (!format && !s.pluginId && !s.path.includes('/plugins/cache/')) {
            const { makeManualSkillPolicy } = await import(
              '../sources/skill-policy.mjs'
            );
            await makeManualSkillPolicy(policy?.text ?? null);
            manual = true;
          }
        } catch (e) {
          reason = e.kind ?? 'unsupported-source';
          if (e.kind !== 'unsupported-skill-policy') eligible = false;
        }
      const policyOwnership = canPlanOwnership(policy);
      const unsealAvailable =
        eligible && (!s.enabled || (manual && policyOwnership));
      const trueformAvailable = eligible && configOwnership;
      const ownershipLimited =
        eligible &&
        ((!policyOwnership && s.enabled && manual) || !configOwnership);
      eligible = eligible && (unsealAvailable || trueformAvailable);
      const sourceDigest = hash({ body, policy, format });
      const id = 'skill-' + hash({ identity, sourceDigest });
      skills.push({
        id,
        sourceDigest,
        label: s.name,
        path: s.path,
        scope: s.scope,
        pluginId: s.pluginId,
        enabled: s.enabled,
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
            : manual
              ? null
              : 'manual-control-unavailable'),
        identity,
        body,
        policy,
        format,
        binding,
        policyBinding,
        formatBinding
      });
    }
    return {
      version: cat.version,
      unavailableSources,
      instructions,
      skills,
      files,
      bindings,
      notices: []
    };
  },

  // Recheck platform-appropriate admission before creating a reservation. A
  // policy retained read-only by TRUEFORM is not an ownership admission failure.
  assertRegistrationOwnership(d, selected, instructionsOptional) {
    if (instructionsOptional && !canPlanOwnership(d.files.override))
      fail('unsupported-metadata');
    for (const skill of d.skills.filter((s) => selected.includes(s.id))) {
      const manual =
        skill.availability.unseal &&
        (!skill.enabled || canPlanOwnership(skill.policy));
      const disable =
        skill.availability.trueform && canPlanOwnership(d.files.config);
      if (!manual && !disable) fail('unsupported-metadata');
    }
  },

  pathsFor(reg) {
    const p = globalPaths(reg.context.codexHome);
    for (const s of reg.skills) {
      p[s.id + ':body'] = s.path;
      p[s.id + ':policy'] = join(dirname(s.path), 'agents', 'openai.yaml');
      p[s.id + ':format'] = join(dirname(s.path), 'SKILL.json');
    }
    return p;
  },

  controlKeys(reg) {
    return [
      'config',
      ...(reg.instructions ? ['override'] : []),
      ...reg.skills.map((s) => s.id + ':policy')
    ];
  },

  // The one registered file that mixes managed and retained settings.
  retainedKey: 'config',
  retainedCategories: Object.freeze(['Codex settings']),

  async mergeRetained({ reg, baseText, targetText, currentText }) {
    const { mergeRetainedConfig } = await import('../codex/config-reconcile.mjs');
    const result = await mergeRetainedConfig({
      baseText,
      targetText,
      currentText,
      skillPaths: reg.skills.map((s) => s.path),
      pluginIds: (reg.plugins ?? []).map(p => p.id),
      executable: reg.context.executable
    });
    return { text: result.text, changed: result.changed, version: result.codexVersion };
  },

  registeredSkillFields: () => ({}),

  skillFiles: (s) => ({
    [s.id + ':body']: { file: s.body, binding: s.binding },
    [s.id + ':policy']: { file: s.policy, binding: s.policyBinding },
    [s.id + ':format']: { file: s.format, binding: s.formatBinding }
  }),

  rejectsRegisteredSkill: (s) => !!s.pluginId?.includes('@openai-'),

  skillSourceDigest: (snapshot, s) =>
    hash({
      body: snapshot[s.id + ':body'],
      policy: snapshot[s.id + ':policy'],
      format: snapshot[s.id + ':format']
    }),

  changedFileLabel: (id) =>
    id === 'override'
      ? 'Global instruction override'
      : id === 'config'
        ? 'Skill enablement configuration'
        : 'Skill invocation policy',

  async assertFreshCatalog(reg) {
    const { catalog, catalogIdentity } = await import('../codex/catalog.mjs');
    const { equal } = await import('../sources/platform.mjs');
    const current = await catalog(reg.context);
    if (current.version !== reg.version) fail('stale-discovery');
    for (const s of reg.skills)
      if (!current.skills.some((c) => equal(catalogIdentity(c), s.identity)))
        fail('stale-discovery');
  },

  supportsReleasePresets: true,
  async forwardDependencyGuard(w) {
    if (!w.reg.plugins?.length) return async () => {};
    const { validateRegisteredPlugins, checkPluginPackage } = await import('../codex/plugin-dependency.mjs');
    const dependencies = await validateRegisteredPlugins(w.workspace, w.reg);
    return async ({ localOnly = false } = {}) => {
      for (const dependency of dependencies) {
        if (localOnly) await checkPluginPackage(dependency, w.reg.context);
        else {
          const { assertPluginDependency } = await import('../codex/plugin-inventory.mjs');
          await assertPluginDependency(w.reg.context, dependency);
        }
      }
    };
  },
  async changedReadOnlyDependencies(w) {
    if (!w.reg.plugins?.length) return [];
    const { validateRegisteredPlugins, checkPluginPackage } = await import('../codex/plugin-dependency.mjs');
    const changed = [];
    for (const dependency of await validateRegisteredPlugins(w.workspace, w.reg)) {
      try { await checkPluginPackage(dependency, w.reg.context); }
      catch { changed.push(dependency.plugin.id); }
    }
    return changed;
  },
  // Stored legacy plans keep their original disabled-Skill contract. Reviewed
  // release presets explicitly request manual invocation for either mode.
  async compile({ reg, mode, selection, normal, targetFile, releasePreset }) {
    const after = structuredClone(normal);
    let guide = null;
    const skillStates = [];
    if (mode === 'normal') return { after, guide, skillStates };
    const instructionStyle = releasePreset?.instructionStyle ?? (mode === 'unseal' ? 'minimal' : 'none');
    const manualOnly = releasePreset?.skillRelease === 'manual-only' || mode === 'unseal';
    if (reg.instructions && selection.includes(reg.instructions.id)) {
      const { getMinimalGuide } = await import('../sources/guide.mjs');
      const fixed = getMinimalGuide();
      after.override = await targetFile(
        'override',
        instructionStyle === 'minimal' ? fixed.text : '<!-- -->\n'
      );
      if (instructionStyle === 'minimal') {
        const { text, ...identity } = fixed;
        guide = identity;
      }
    }
    if (releasePreset?.skillRelease === 'per-source-v3') {
      const { compileCodexSourceStates } = await import('../codex/source-state-compiler.mjs');
      return { ...await compileCodexSourceStates({ reg, normal, after, targetFile, sourceStates: releasePreset.sourceStates }), guide };
    }
    const skills = reg.skills.filter((s) => selection.includes(s.id));
    for (const s of skills) {
      skillStates.push({
        id: s.id,
        enabled: manualOnly ? s.enabled : false,
        manualOnly: manualOnly && s.enabled
      });
      if (manualOnly && s.enabled) {
        const { makeManualSkillPolicy } = await import(
          '../sources/skill-policy.mjs'
        );
        const key = s.id + ':policy';
        const result = await makeManualSkillPolicy(normal[key]?.text ?? null);
        after[key] = await targetFile(key, result);
      }
    }
    if (releasePreset?.automaticSkillIds) {
      const { readSkillInvocationPolicy, makeAutomaticSkillPolicy } = await import('../sources/skill-policy.mjs');
      for (const s of reg.skills.filter(s => releasePreset.automaticSkillIds.includes(s.id) && s.enabled)) {
        const key = s.id + ':policy';
        if (!await readSkillInvocationPolicy(normal[key]?.text ?? null))
          after[key] = await targetFile(key, await makeAutomaticSkillPolicy(normal[key]?.text ?? null));
      }
      // v1 records describe only released targets. v2 records describe every
      // optional registered Skill, including retained and disabled members.
      skillStates.splice(0, skillStates.length, ...reg.skills.filter(s => selection.includes(s.id)
        || releasePreset.automaticSkillIds.includes(s.id)).map(s => ({ id: s.id, enabled: s.enabled,
        manualOnly: s.enabled && !releasePreset.automaticSkillIds.includes(s.id) })));
    }
    if (!manualOnly && skills.length) {
      const { disableSkillConfig } = await import('../codex/config-editor.mjs');
      const result = await disableSkillConfig({
        configText: normal.config?.text ?? '',
        skillPaths: skills.map((s) => s.path),
        executable: reg.context.executable
      });
      after.config = await targetFile('config', result.text);
    }
    return { after, guide, skillStates };
  },

  async expectations(w, files, normal) {
    const { readSkillSelectors } = await import('../codex/config-editor.mjs');
    const { makeManualSkillPolicy } = await import('../sources/skill-policy.mjs');
    const { getMinimalGuide } = await import('../sources/guide.mjs');
    const result = [];
    if (w.reg.instructions) {
      const text = normalize(effective(files));
      const expected =
        text === normalize(effective(normal))
          ? 'saved-instructions'
          : text === normalize(getMinimalGuide().text)
            ? 'minimal-guide'
            : text === '<!-- -->'
              ? 'inert-instructions'
              : 'unknown';
      result.push({
        sourceId: w.reg.instructions.id,
        category: 'instructions',
        expected,
        text
      });
    }
    let normalFlags = null,
      preparedFlags = null;
    if (w.reg.skills.length) {
      try {
        const args = {
          skillPaths: w.reg.skills.map((s) => s.path),
          executable: w.reg.context.executable
        };
        const first = await readSkillSelectors({
          ...args,
          configText: normal.config?.text ?? ''
        });
        const second =
          normal.config?.text === files.config?.text
            ? first
            : await readSkillSelectors({
                ...args,
                configText: files.config?.text ?? ''
              });
        if (
          first.codexVersion === '0.153.4' &&
          second.codexVersion === '0.153.4'
        ) {
          normalFlags = first.selectors;
          preparedFlags = second.selectors;
        }
      } catch {
        /* Unsupported native input cannot establish selected intent. */
      }
    }
    for (const [index, s] of w.reg.skills.entries()) {
      let enabled = null;
      if (normalFlags && preparedFlags)
        enabled = selectedSkillIntent(
          normalFlags[index],
          preparedFlags[index],
          s.enabled,
          { allowEnable: w.manifestVersion === 3 }
        );
      let expected = enabled === false ? 'disabled' : 'unknown';
      if (enabled === true && files[s.id + ':format'] === null) {
        try {
          const text = files[s.id + ':policy']?.text ?? null;
          expected =
            (await makeManualSkillPolicy(text)) === text
              ? 'manual-only'
              : 'automatic-catalog';
        } catch {
          /* Unsupported frozen policy stays unknown. */
        }
      }
      result.push({
        sourceId: s.id,
        category: 'skill',
        expected,
        name: s.identity.name,
        path: s.path
      });
    }
    return result;
  },

  // Sequential replay needs a runtime-authoritative conditions report and an
  // "open this project" desktop command. Codex exposes both locally.
  sequentialReplay: Object.freeze({ supported: true, reason: null }),

  // Ordinary-run measurement for one recorded task.
  runParser: 'codex-desktop',

  // Reading a recording for a comparison fails loudly: an unavailable record
  // must never become an empty measurement.
  async readRunRecords(w, taskId) {
    const { findCurrentDesktopSession, readDesktopRecords } = await import(
      '../codex/desktop-record.mjs'
    );
    try {
      return await readDesktopRecords(
        await findCurrentDesktopSession({ sessionId: taskId, codexHome: w.reg.context.codexHome })
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
    const { projectCodexRun } = await import('../codex/run-metrics.mjs');
    return projectCodexRun(records, options);
  },

  async readTaskRecords(w, taskId) {
    const { findCurrentDesktopSession, readDesktopRecords } = await import(
      '../codex/desktop-record.mjs'
    );
    try {
      const session = await findCurrentDesktopSession({
        sessionId: taskId,
        codexHome: w.reg.context.codexHome
      });
      return { records: (await readDesktopRecords(session)).records, readIssue: null };
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

  async projectTask(w, taskId, expected, records, observedAt, readIssue, boundary) {
    const result = projection(
      w,
      taskId,
      expected,
      records,
      observedAt,
      readIssue,
      boundary
    );
    if (!w.reg.plugins?.length) return result;
    const { frozenPluginInputBindings, projectPluginInputs, withPluginEvidence } = await import('../codex/plugin-task-observation.mjs');
    const bindings = await frozenPluginInputBindings(w);
    const plugins = projectPluginInputs(bindings, initialFields(records).state, result.conditions.codexVersion);
    return { ...withPluginEvidence(result, plugins), schemaVersion: 3 };
  }
};

const POLICY_FIELDS = [
  'approval_policy',
  'approvals_reviewer',
  'sandbox_policy',
  'permission_profile',
  'active_permission_profile'
];
function policyDigest(context) {
  if (!object(context)) return null;
  const entries = POLICY_FIELDS.filter((key) =>
    Object.hasOwn(context, key)
  ).map((key) => [key, context[key]]);
  const canonicalValue = (value) =>
    Array.isArray(value)
      ? value.map(canonicalValue)
      : object(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, canonicalValue(value[key])])
          )
        : value;
  return entries.length
    ? digest(JSON.stringify(canonicalValue(Object.fromEntries(entries))))
    : null;
}

function initialFields(records) {
  let state = null,
    firstContext = null,
    startup = true,
    firstFullSeen = false,
    memory = false;
  const metas = records.filter((r) => r.type === 'session_meta');
  for (const r of records) {
    const p = r.payload;
    if (!object(p)) continue;
    if (r.type === 'turn_context' && firstContext === null && startup)
      firstContext = p;
    if (r.type === 'world_state' && p.full === true && startup && !firstFullSeen) {
      firstFullSeen = true;
      state = object(p.state) ? p.state : null;
    }
    if (r.type === 'response_item') {
      if (
        p.type === 'message' &&
        ['developer', 'system', 'user'].includes(p.role) &&
        startup
      ) {
        if (p.role === 'developer' && Array.isArray(p.content))
          memory ||= p.content.some(
            (c) =>
              c?.type === 'input_text' &&
              typeof c.text === 'string' &&
              c.text.includes('## Memory') &&
              c.text.includes('MEMORY_SUMMARY')
          );
      } else startup = false;
    }
    if (
      r.type === 'event_msg' &&
      ['agent_message', 'agent_reasoning', 'exec_command_begin', 'task_complete'].includes(
        p.type
      )
    )
      startup = false;
  }
  return {
    meta: metas.length === 1 && object(metas[0].payload) ? metas[0].payload : null,
    state,
    context: firstContext,
    memory
  };
}

function projection(w, taskId, expected, records, observedAt, readIssue, boundary) {
  const reasons = [];
  const add = (value) => {
    if (!reasons.includes(value)) reasons.push(value);
  };
  const { meta, state, context, memory } = initialFields(records);
  const conditions = {
    codexVersion:
      typeof meta?.cli_version === 'string' &&
      /^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(meta.cli_version)
        ? meta.cli_version
        : null,
    model: conditionId(context?.model),
    reasoningEffort: [
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultra'
    ].includes(context?.effort)
      ? context.effort
      : null,
    executionPolicyDigest: policyDigest(context),
    projectInstructionsDigest: null,
    memoryGuidanceRecorded: memory
  };
  let unqualified = false;
  if (boundary.issue) add(boundary.issue);
  if (readIssue) add(readIssue);
  if (!meta) add('task-record-invalid');
  else {
    const reject = (code) => {
      add(code);
      unqualified = true;
    };
    if (meta.id !== taskId) reject('task-identity-mismatch');
    if (!recordedDesktopOrigin(meta)) reject('task-origin-unqualified');
    if (!['user', 'agent_created_thread'].includes(meta.thread_source))
      reject('task-route-unqualified');
    if (
      meta.forked_from_id != null ||
      meta.forked_from_thread_id != null ||
      meta.thread_source === 'agent_forked_thread'
    )
      reject('task-forked');
    if (
      !samePath(meta.cwd, w.reg.context.project) ||
      !samePath(context?.cwd, w.reg.context.project)
    )
      reject('task-project-mismatch');
    if (typeof meta.timestamp !== 'string' || !Number.isFinite(Date.parse(meta.timestamp)))
      add('task-record-invalid');
    else {
      if (
        boundary.preparation &&
        Date.parse(meta.timestamp) < Date.parse(boundary.preparation.preparedAt)
      )
        reject('task-before-preparation');
      if (Date.parse(meta.timestamp) > Date.parse(observedAt))
        reject('task-start-in-future');
    }
    if (
      !context ||
      typeof context.turn_id !== 'string' ||
      !records.some(
        (r) =>
          r.type === 'event_msg' &&
          r.payload?.type === 'task_complete' &&
          r.payload.turn_id === context.turn_id
      )
    )
      reject('task-incomplete');
  }
  if (conditions.codexVersion !== '0.153.4') add('unsupported-codex-version');
  if (!state) add('initial-world-state-unavailable');
  const catalog =
    conditions.codexVersion === '0.153.4'
      ? parseSkillCatalog(state?.host_skills)
      : null;
  const sources = expected.map((s) => {
    const result = {
      sourceId: s.sourceId,
      category: s.category,
      expected: s.expected,
      recorded: 'unknown',
      status: 'unknown'
    };
    if (conditions.codexVersion !== '0.153.4' || s.expected === 'unknown') {
      if (s.expected === 'unknown') add('skill-state-unavailable');
      return result;
    }
    if (s.category === 'instructions') {
      if (
        !object(state?.agents_md) ||
        !samePath(state.agents_md.directory, w.reg.context.project) ||
        typeof state.agents_md.text !== 'string'
      ) {
        add('instruction-field-unavailable');
        return result;
      }
      const text = normalize(state.agents_md.text);
      const projectPrefix = s.text + '\n\n--- project-doc ---\n\n';
      // The delimiter may itself be literal global instruction text. Locate
      // project content only after the entire known global text has matched.
      const exact = text === s.text;
      const hasProject = !exact && text.startsWith(projectPrefix);
      if (hasProject)
        conditions.projectInstructionsDigest = digest(
          text.slice(projectPrefix.length)
        );
      const match = exact || hasProject;
      result.recorded = match ? 'matching-prefix' : 'different-prefix';
      result.status = match ? 'matched' : 'not-matched';
      if (!match) add('instruction-prefix-mismatch');
    } else {
      if (!catalog) {
        add('skill-catalog-unavailable');
        return result;
      }
      // A name/path disagreement cannot establish omission of this identity.
      const related = catalog.filter(
        (e) => e.name === s.name || samePath(e.path, s.path)
      );
      if (related.some((e) => e.name !== s.name || !samePath(e.path, s.path))) {
        add('skill-catalog-unavailable');
        return result;
      }
      const present = related.length === 1;
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
    !meta ||
    reasons.includes('task-record-invalid') ||
    conditions.codexVersion !== '0.153.4' ||
    !state ||
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
    schemaVersion: 1,
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
