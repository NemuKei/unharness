import { join, posix, win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { openWorkspace, loadSnapshot, record, writeJson } from './records.mjs';
import { acquire, pending, assertCurrent } from './transaction.mjs';
import { fail, verification } from './errors.mjs';
import { preparationMetadata, projectObservation, validUuid, conditionId } from './observation-record.mjs';
import { findCurrentDesktopSession, readDesktopRecords } from '../codex/desktop-record.mjs';
import { readSkillSelectors } from '../codex/config-editor.mjs';
import { makeManualSkillPolicy } from './skill-policy.mjs';
import { getMinimalGuide } from './guide.mjs';
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const digest = text => createHash('sha256').update(text).digest('hex');
const normalize = text => text.replaceAll('\r\n', '\n').trim();
const effective = files => files.override?.text?.trim() ? files.override.text : files.base?.text ?? '';
const pathApi = path => /^[A-Za-z]:[\\/]|^\\\\/.test(path) ? win32 : posix;
const absolute = path => typeof path === 'string' && !/[\0\r\n]/.test(path) && pathApi(path).isAbsolute(path) && pathApi(path).normalize(path) === path;
function samePath(a, b) { return absolute(a) && absolute(b) && pathApi(a) === pathApi(b) && pathApi(a).normalize(a) === pathApi(b).normalize(b); }

// A deliberately narrow parser for the native catalog grammar. Any unresolved
// reference prevents absence claims, even when another entry happens to match.
export function parseSkillCatalog(value) {
  if (!object(value) || value.includeInstructions !== true || typeof value.body !== 'string') return null;
  const lines = value.body.replaceAll('\r\n', '\n').split('\n');
  const roots = new Map(), entries = [];
  let section = null, rootsSeen = false, availableSeen = false;
  for (const line of lines) {
    if (line === '### Skill roots') { if (rootsSeen || availableSeen) return null; rootsSeen = true; section = 'roots'; continue; }
    if (line === '### Available skills') { if (availableSeen) return null; availableSeen = true; section = 'skills'; continue; }
    if (!section || !line.trim() || line === '</skills_instructions>') continue;
    if (section === 'roots') {
      const m = line.match(/^- `([a-zA-Z][a-zA-Z0-9]*)` = `([^`]+)`$/);
      if (!m || roots.has(m[1]) || !absolute(m[2])) return null;
      roots.set(m[1], m[2]);
    } else {
      const m = line.match(/^- (\S+): [^\r\n]* \(file: ([^\r\n]+)\)$/);
      if (!m) return null;
      let path = m[2];
      if (!absolute(path)) {
        const alias = path.match(/^([a-zA-Z][a-zA-Z0-9]*)\/(.+)$/);
        if (!alias || !roots.has(alias[1]) || alias[2].split(/[\\/]/).some(p => !p || p === '.' || p === '..')) return null;
        path = pathApi(roots.get(alias[1])).join(roots.get(alias[1]), alias[2]);
      }
      if (!absolute(path) || entries.some(e => e.name === m[1] || samePath(e.path, path))) return null;
      entries.push({ name: m[1], path });
    }
  }
  return availableSeen ? entries : null;
}

export function selectedSkillIntent(normalFlags, preparedFlags, registeredEnabled) {
  if (isDeepStrictEqual(normalFlags, preparedFlags)) return registeredEnabled;
  if (preparedFlags.length && preparedFlags.every(value => value === false)) return false;
  return null;
}

async function expectations(w, files) {
  const normal = await loadSnapshot(w.workspace, w.reg, w.reg.normalId);
  const result = [];
  if (w.reg.instructions) {
    const text = normalize(effective(files));
    const expected = text === normalize(effective(normal)) ? 'saved-instructions'
      : text === normalize(getMinimalGuide().text) ? 'minimal-guide'
        : text === '<!-- -->' ? 'inert-instructions' : 'unknown';
    result.push({ sourceId: w.reg.instructions.id, category: 'instructions', expected, text });
  }
  let normalFlags = null, preparedFlags = null;
  if (w.reg.skills.length) {
    try {
      const args = { skillPaths: w.reg.skills.map(s => s.path), executable: w.reg.context.executable };
      const first = await readSkillSelectors({ ...args, configText: normal.config?.text ?? '' });
      const second = normal.config?.text === files.config?.text ? first : await readSkillSelectors({ ...args, configText: files.config?.text ?? '' });
      if (first.codexVersion === '0.153.4' && second.codexVersion === '0.153.4') { normalFlags = first.selectors; preparedFlags = second.selectors; }
    } catch { /* Unsupported native input cannot establish selected intent. */ }
  }
  for (const [index, s] of w.reg.skills.entries()) {
    let enabled = null;
    if (normalFlags && preparedFlags) {
      enabled = selectedSkillIntent(normalFlags[index], preparedFlags[index], s.enabled);
    }
    let expected = enabled === false ? 'disabled' : 'unknown';
    if (enabled === true && files[s.id + ':format'] === null) {
      try {
        const text = files[s.id + ':policy']?.text ?? null;
        expected = await makeManualSkillPolicy(text) === text ? 'manual-only' : 'automatic-catalog';
      } catch { /* Unsupported frozen policy stays unknown. */ }
    }
    result.push({ sourceId: s.id, category: 'skill', expected, name: s.identity.name, path: s.path });
  }
  return result;
}

const POLICY_FIELDS = ['approval_policy', 'approvals_reviewer', 'sandbox_policy', 'permission_profile', 'active_permission_profile'];
function policyDigest(context) {
  if (!object(context)) return null;
  const entries = POLICY_FIELDS.filter(key => Object.hasOwn(context, key)).map(key => [key, context[key]]);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return entries.length ? digest(JSON.stringify(canonical(Object.fromEntries(entries)))) : null;
}
function initialFields(records) {
  let state = null, firstContext = null, startup = true, firstFullSeen = false, memory = false;
  const metas = records.filter(r => r.type === 'session_meta');
  for (const r of records) {
    const p = r.payload;
    if (!object(p)) continue;
    if (r.type === 'turn_context' && firstContext === null && startup) firstContext = p;
    if (r.type === 'world_state' && p.full === true && startup && !firstFullSeen) { firstFullSeen = true; state = object(p.state) ? p.state : null; }
    if (r.type === 'response_item') {
      if (p.type === 'message' && ['developer', 'system', 'user'].includes(p.role) && startup) {
        if (p.role === 'developer' && Array.isArray(p.content)) memory ||= p.content.some(c => c?.type === 'input_text' && typeof c.text === 'string' && c.text.includes('## Memory') && c.text.includes('MEMORY_SUMMARY'));
      } else startup = false;
    }
    if (r.type === 'event_msg' && ['agent_message', 'agent_reasoning', 'exec_command_begin', 'task_complete'].includes(p.type)) startup = false;
  }
  return { meta: metas.length === 1 && object(metas[0].payload) ? metas[0].payload : null, state, context: firstContext, memory };
}
function projection(w, taskId, expected, records, observedAt, readIssue) {
  const boundary = preparationMetadata(w.state), reasons = [];
  const add = value => { if (!reasons.includes(value)) reasons.push(value); };
  const { meta, state, context, memory } = initialFields(records);
  const conditions = { codexVersion: typeof meta?.cli_version === 'string' && /^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(meta.cli_version) ? meta.cli_version : null, model: conditionId(context?.model), reasoningEffort: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(context?.effort) ? context.effort : null, executionPolicyDigest: policyDigest(context), projectInstructionsDigest: null, memoryGuidanceRecorded: memory };
  let unqualified = false;
  if (boundary.issue) add(boundary.issue);
  if (readIssue) add(readIssue);
  if (!meta) add('task-record-invalid');
  else {
    const reject = code => { add(code); unqualified = true; };
    if (meta.id !== taskId) reject('task-identity-mismatch');
    if (meta.originator !== 'Codex Desktop') reject('task-origin-unqualified');
    if (!['user', 'agent_created_thread'].includes(meta.thread_source)) reject('task-route-unqualified');
    if (meta.forked_from_id != null || meta.forked_from_thread_id != null || meta.thread_source === 'agent_forked_thread') reject('task-forked');
    if (!samePath(meta.cwd, w.reg.context.project) || !samePath(context?.cwd, w.reg.context.project)) reject('task-project-mismatch');
    if (typeof meta.timestamp !== 'string' || !Number.isFinite(Date.parse(meta.timestamp))) add('task-record-invalid');
    else {
      if (boundary.preparation && Date.parse(meta.timestamp) < Date.parse(boundary.preparation.preparedAt)) reject('task-before-preparation');
      if (Date.parse(meta.timestamp) > Date.parse(observedAt)) reject('task-start-in-future');
    }
    if (!context || typeof context.turn_id !== 'string' || !records.some(r => r.type === 'event_msg' && r.payload?.type === 'task_complete' && r.payload.turn_id === context.turn_id)) reject('task-incomplete');
  }
  if (conditions.codexVersion !== '0.153.4') add('unsupported-codex-version');
  if (!state) add('initial-world-state-unavailable');
  const catalog = conditions.codexVersion === '0.153.4' ? parseSkillCatalog(state?.host_skills) : null;
  const sources = expected.map(s => {
    const result = { sourceId: s.sourceId, category: s.category, expected: s.expected, recorded: 'unknown', status: 'unknown' };
    if (conditions.codexVersion !== '0.153.4' || s.expected === 'unknown') { if (s.expected === 'unknown') add('skill-state-unavailable'); return result; }
    if (s.category === 'instructions') {
      if (!object(state?.agents_md) || !samePath(state.agents_md.directory, w.reg.context.project) || typeof state.agents_md.text !== 'string') { add('instruction-field-unavailable'); return result; }
      const text = normalize(state.agents_md.text);
      const projectPrefix = s.text + '\n\n--- project-doc ---\n\n';
      // The delimiter may itself be literal global instruction text. Locate
      // project content only after the entire known global text has matched.
      const exact = text === s.text;
      const hasProject = !exact && text.startsWith(projectPrefix);
      if (hasProject) conditions.projectInstructionsDigest = digest(text.slice(projectPrefix.length));
      const match = exact || hasProject;
      result.recorded = match ? 'matching-prefix' : 'different-prefix';
      result.status = match ? 'matched' : 'not-matched';
      if (!match) add('instruction-prefix-mismatch');
    } else {
      if (!catalog) { add('skill-catalog-unavailable'); return result; }
      // A name/path disagreement cannot establish omission of this identity.
      const related = catalog.filter(e => e.name === s.name || samePath(e.path, s.path));
      if (related.some(e => e.name !== s.name || !samePath(e.path, s.path))) { add('skill-catalog-unavailable'); return result; }
      const present = related.length === 1;
      result.recorded = present ? 'present' : 'absent';
      result.status = present === (s.expected === 'automatic-catalog') ? 'matched' : 'not-matched';
      if (result.status === 'not-matched') add('skill-catalog-mismatch');
    }
    return result;
  });
  const unknown = boundary.issue || readIssue || !meta || reasons.includes('task-record-invalid') || conditions.codexVersion !== '0.153.4' || !state || sources.some(s => s.status === 'unknown');
  const status = boundary.issue ? 'unknown-record' : unqualified ? 'unqualified-record' : unknown ? 'unknown-record' : sources.some(s => s.status === 'not-matched') ? 'not-matched-record' : 'matched-record';
  return { role: 'task-observation', schemaVersion: 1, taskId, scopeId: w.scopeId, snapshotId: w.state.snapshotId, preparationId: boundary.preparation?.id ?? null, preparedMode: w.state.preparedMode, observedAt, status, reasons, sources, conditions, verification };
}
export async function projectRegisteredTaskObservation(w, taskId, records, observedAt, readIssue) {
  const files = await loadSnapshot(w.workspace, w.reg, w.state.snapshotId);
  return projection(w, taskId, await expectations(w, files), records, observedAt, readIssue);
}
export async function observe(args) {
  if (!object(args) || Object.keys(args).sort().join(',') !== 'taskId,workspace' || !validUuid(args.taskId)) fail('invalid-request');
  const { workspace } = args, taskId = args.taskId.toLowerCase();
  const opened = await openWorkspace(workspace), release = await acquire(opened);
  try {
    const w = await openWorkspace(workspace);
    if (await pending(workspace)) fail('recovery-required');
    const files = await loadSnapshot(workspace, w.reg, w.state.snapshotId);
    await assertCurrent(w, files);
    let records = [], readIssue = null;
    try {
      const session = await findCurrentDesktopSession({ sessionId: taskId, codexHome: w.reg.context.codexHome });
      ({ records } = await readDesktopRecords(session));
    } catch (e) { readIssue = e.kind === 'current-session-unavailable' ? 'task-record-unavailable' : 'task-record-invalid'; }
    const payload = await projectRegisteredTaskObservation(w, taskId, records, new Date().toISOString(), readIssue);
    const current = await openWorkspace(workspace);
    if (!isDeepStrictEqual(w.state, current.state) || !isDeepStrictEqual(w.reg, current.reg) || await pending(workspace)) fail('source-conflict');
    await assertCurrent(current, files);
    const observationId = await record(workspace, 'observation', payload);
    const projected = projectObservation({ kind: 'unharness-user-source', ...payload }, observationId, w);
    const publishing = await openWorkspace(workspace);
    if (!isDeepStrictEqual(w.state, publishing.state) || !isDeepStrictEqual(w.reg, publishing.reg) || await pending(workspace)) fail('source-conflict');
    await assertCurrent(publishing, files);
    await writeJson(join(workspace, 'state.json'), { ...w.state, lastObservationId: observationId });
    return projected;
  } finally { await release(); }
}
