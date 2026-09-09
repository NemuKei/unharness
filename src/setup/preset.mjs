import { recordId } from '../core/local-store.mjs';
import { exactKeys, boundedText } from '../comparisons/assessment.mjs';
import { validUtc } from '../sources/observation-record.mjs';
import { fail } from '../sources/errors.mjs';
import { requiredControlSources, assertControlPreserved } from './control-sources.mjs';

const kind = 'setup-proposal-invalid';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const shape = (value, required) => exactKeys(value, required, [], kind);
const text = (value, max, multiline = false) => boundedText(value, max, multiline, kind);
const officialHosts = new Set(['developers.openai.com', 'platform.openai.com', 'learn.chatgpt.com', 'openai.com', 'cookbook.openai.com',
  'code.claude.com', 'platform.claude.com', 'support.claude.com', 'docs.anthropic.com', 'anthropic.com', 'www.anthropic.com']);
function references(value) {
  if (!Array.isArray(value) || !value.length || value.length > 8) fail(kind);
  for (const ref of value) {
    shape(ref, ['url', 'title', 'checkedAt']); text(ref.title, 160); text(ref.url, 2000);
    const url = new URL(ref.url);
    if (url.protocol !== 'https:' || !officialHosts.has(url.hostname) || url.username || url.password || url.port
      || [...url.searchParams.keys()].some(key => key !== 'model') || !validUtc(ref.checkedAt)) fail(kind);
  }
}
export function validatePresetProposal(value, scope) {
  try {
    recordId('input', value);
    shape(value, ['schemaVersion', 'scopeId', 'normalId', 'basis', 'roles', 'unseal', 'trueform']);
    if (value.schemaVersion !== 1 || !hash(value.scopeId) || value.scopeId !== scope.scopeId
      || !hash(value.normalId) || value.normalId !== scope.normalId) fail(kind);
    const basis = value.basis;
    shape(basis, ['application', 'modelId', 'modelSource', 'desktopVersion', 'runtimeVersion', 'references', 'rationale']);
    if (basis.application !== scope.application || !['codex', 'claude'].includes(basis.application)
      || !['user-specified', 'ai-reported', 'task-record'].includes(basis.modelSource)) fail(kind);
    text(basis.modelId, 200); text(basis.rationale, 2000, true);
    for (const version of [basis.desktopVersion, basis.runtimeVersion])
      if (version !== null && (typeof version !== 'string' || !/^\d+(?:\.\d+){1,3}$/.test(version) || version.length > 40)) fail(kind);
    references(basis.references);
    const ids = scope.skills.map(s => s.id);
    if (!Array.isArray(value.roles) || value.roles.length !== ids.length || value.roles.length > 32
      || new Set(value.roles.map(r => r?.sourceId)).size !== ids.length) fail(kind);
    for (const role of value.roles) {
      shape(role, ['sourceId', 'origin', 'reason']);
      if (!ids.includes(role.sourceId) || !['self', 'external', 'unknown'].includes(role.origin)) fail(kind);
      text(role.reason, 600, true);
    }
    shape(value.unseal, ['instructions', 'automaticSkillIds']);
    shape(value.trueform, ['automaticExternalSkillIds']);
    if (!['minimal', 'none'].includes(value.unseal.instructions) || !scope.instructions && value.unseal.instructions !== 'none') fail(kind);
    for (const [list, externalOnly] of [[value.unseal.automaticSkillIds, false], [value.trueform.automaticExternalSkillIds, true]]) {
      if (!Array.isArray(list) || list.length > ids.length || new Set(list).size !== list.length
        || list.some(id => !ids.includes(id) || externalOnly && value.roles.find(r => r.sourceId === id).origin !== 'external')) fail(kind);
    }
    return structuredClone(value);
  } catch { fail(kind); }
}

// Only the local service loads an approved stored proposal for this compiler.
// Source roles and model references supplied by an AI are proposal data, not
// approval, and this pure function cannot enroll sources or change files.
export function compileReleasePreset(value, mode, scope) {
  const proposal = validatePresetProposal(value, scope);
  if (!['unseal', 'trueform'].includes(mode)) fail(kind);
  if (proposal.roles.some(r => r.origin === 'unknown')) fail('setup-roles-unconfirmed');
  const automatic = new Set(mode === 'unseal' ? proposal.unseal.automaticSkillIds : proposal.trueform.automaticExternalSkillIds);
  const manual = scope.skills.filter(s => !automatic.has(s.id));
  assertControlPreserved({ selectedIds: manual.map(s => s.id), control: requiredControlSources(scope.skills) });
  if (manual.some(s => s.enabled && !s.availability.unseal)) fail('setup-manual-control-unavailable');
  const instructionStyle = mode === 'unseal' ? proposal.unseal.instructions : 'none';
  if (scope.instructions && !scope.instructions.availability[instructionStyle === 'minimal' ? 'unseal' : 'trueform'])
    fail('setup-manual-control-unavailable');
  return { instructionStyle, skillRelease: 'manual-only', selection: [
    ...(scope.instructions ? [scope.instructions.id] : []), ...manual.map(s => s.id),
  ] };
}
