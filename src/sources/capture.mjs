import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute, resolve, relative } from 'node:path';
import {
  captureFile,
  parentBinding,
  equal,
  defaultMetadata,
  canPlanOwnership
} from './platform.mjs';
import { fail, verification } from './errors.mjs';
const ordered = (x) =>
  Array.isArray(x)
    ? x.map(ordered)
    : x && typeof x === 'object'
      ? Object.fromEntries(
          Object.keys(x)
            .sort()
            .map((k) => [k, ordered(x[k])])
        )
      : x;
export const hash = (x) =>
  createHash('sha256')
    .update(JSON.stringify(ordered(x)))
    .digest('hex');
export const retained = Object.freeze([
  'project requirements',
  'memory',
  'native continuity',
  'execution permissions',
  'managed/provider sources',
  'hooks',
  'unselected sources'
]);
export function snapshotLimit(files) {
  if (Buffer.byteLength(JSON.stringify(files)) > 768 * 1024)
    fail('snapshot-too-large');
  return files;
}
export async function discoveryCapture(input) {
  const { catalog, catalogIdentity, contextOf } = await import('./catalog.mjs');
  const context = await contextOf(input),
    cat = await catalog(context);
  let ownedRoot = null;
  const marker = await captureFile(
    join(context.codexHome, '.unharness-owned-profile.json')
  );
  if (marker) {
    try {
      const m = JSON.parse(marker.text);
      if (
        m.codexHome !== context.codexHome ||
        m.project !== context.project ||
        m.root !== dirname(context.codexHome)
      )
        fail('unsupported-source');
      ownedRoot = m.root;
    } catch {
      fail('unsupported-source');
    }
  }
  const paths = {
    base: join(context.codexHome, 'AGENTS.md'),
    override: join(context.codexHome, 'AGENTS.override.md'),
    config: join(context.codexHome, 'config.toml')
  };
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
  const effective = files.override?.text.trim()
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
    path: effective ? paths[effective] : paths.override,
    effective,
    eligible: !!effective && !globalReason && instructionOwnership,
    availability: {
      normal: !globalReason && instructionOwnership,
      unseal: !!effective && !globalReason && instructionOwnership,
      trueform: !!effective && !globalReason && instructionOwnership
    },
    reason:
      globalReason ??
      (!instructionOwnership
        ? 'unsupported-metadata'
        : effective
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
          const { makeManualSkillPolicy } = await import('./skill-policy.mjs');
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
  const discoveryId = hash({
    context,
    version: cat.version,
    files,
    bindings,
    skills,
    unavailableSources
  });
  return {
    context,
    ownedRoot,
    unavailableSources,
    version: cat.version,
    discoveryId,
    instructions,
    skills,
    files,
    bindings
  };
}
export function discoverySummary(d) {
  return {
    discoveryId: d.discoveryId,
    context: d.context,
    registrationAvailable: !d.unavailableSources.length,
    unavailableSources: d.unavailableSources,
    instructions: d.instructions,
    skills: d.skills.map(
      ({
        identity,
        sourceDigest,
        body,
        policy,
        format,
        binding,
        policyBinding,
        formatBinding,
        ...row
      }) => row
    ),
    retained,
    limitations: [
      'hooks unchanged',
      'only prepared file state; fresh desktop task required'
    ],
    verification
  };
}
export function pathsFor(reg) {
  const p = {
    base: join(reg.context.codexHome, 'AGENTS.md'),
    override: join(reg.context.codexHome, 'AGENTS.override.md'),
    config: join(reg.context.codexHome, 'config.toml')
  };
  for (const s of reg.skills) {
    p[s.id + ':body'] = s.path;
    p[s.id + ':policy'] = join(dirname(s.path), 'agents', 'openai.yaml');
    p[s.id + ':format'] = join(dirname(s.path), 'SKILL.json');
  }
  return p;
}
export async function captureRegistered(reg) {
  const files = {};
  for (const [k, p] of Object.entries(pathsFor(reg)))
    files[k] = await captureFile(p);
  return snapshotLimit(files);
}
export function validateFiles(reg, files) {
  if (
    !files ||
    !equal(Object.keys(files).sort(), Object.keys(pathsFor(reg)).sort())
  )
    fail('record-invalid');
  for (const v of Object.values(files))
    if (
      v !== null &&
      (typeof v?.text !== 'string' ||
        Buffer.byteLength(v.text) > 128 * 1024 ||
        !v.meta ||
        !Number.isInteger(v.meta.uid) ||
        !Number.isInteger(v.meta.gid) ||
        !Number.isInteger(v.meta.mode) ||
        v.meta.mode < 0 ||
        v.meta.mode > 0o777 ||
        !v.meta.xattrs ||
        Object.entries(v.meta.xattrs).some(
          ([k, v]) =>
            !/^[a-zA-Z0-9_.-]{1,128}$/.test(k) ||
            typeof v !== 'string' ||
            !/^(?:[0-9a-f]{2})*$/.test(v) ||
            v.length > 65536
        ))
    )
      fail('record-invalid');
  return snapshotLimit(files);
}
export async function freshCatalog(reg) {
  const { catalog, catalogIdentity } = await import('./catalog.mjs');
  const current = await catalog(reg.context);
  if (current.version !== reg.version) fail('stale-discovery');
  for (const s of reg.skills)
    if (!current.skills.some((c) => equal(catalogIdentity(c), s.identity)))
      fail('stale-discovery');
}
export async function targetFile(reg, key, text, normal) {
  return {
    text,
    meta: normal[key]?.meta ?? (await defaultMetadata(reg.context.codexHome))
  };
}

// Recheck platform-appropriate admission before creating a reservation. A
// policy retained read-only by TRUEFORM is not an ownership admission failure.
export function assertRegistrationOwnership(d, selected, instructionsOptional) {
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
}
