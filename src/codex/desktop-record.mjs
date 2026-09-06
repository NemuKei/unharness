import { lstat, open, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { arch, homedir, platform } from 'node:os';
import { join } from 'node:path';

import { fixtureMarkers, snapshotDesktopFixture } from './desktop-fixture.mjs';

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_LINE = 8 * 1024 * 1024;
const MARKERS = ['fixed', 'procedure', 'skillCatalog', 'skillBody'];
const SOURCE_KEYS = ['agents_md', 'host_skills', 'skills', 'orchestrator_skills',
  'managed_developer_instructions', 'permissions', 'apps_instructions', 'plugins_instructions'];
const USAGE_KEYS = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
  'output_tokens', 'reasoning_output_tokens', 'total_tokens'];

function fail(kind) { throw Object.assign(new Error(kind), { kind }); }
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function textOf(item) {
  if (item?.type !== 'message' || !Array.isArray(item.content)) return '';
  return item.content.filter(c => c?.type === 'input_text' && typeof c.text === 'string').map(c => c.text).join('\n');
}
function toolOutputHasMarker(item, marker) {
  if (!['function_call_output', 'custom_tool_call_output'].includes(item.type)) return false;
  if (typeof item.output === 'string') return item.output.includes(marker);
  return Array.isArray(item.output) && item.output.some(part => part?.type === 'input_text'
    && typeof part.text === 'string' && part.text.includes(marker));
}
function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function version(value) { return typeof value === 'string' ? value.match(/^\d{1,8}\.\d{1,8}\.\d{1,8}(?=$|[-+])/)?.[0] ?? null : null; }

export async function findCurrentDesktopSession({ sessionId = process.env.CODEX_THREAD_ID,
  codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex') } = {}) {
  if (typeof sessionId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(sessionId)) fail('current-session-unavailable');
  const matches = [];
  let count = 0;
  const visit = async (directory, depth) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++count > 50000) fail('session-index-too-large');
      if (entry.isFile() && entry.name.endsWith(`-${sessionId}.jsonl`)) matches.push(join(directory, entry.name));
      // Filename-only discovery of the conventional YYYY/MM/DD tree. Never
      // follow links or open another task's contents to find this task.
      else if (entry.isDirectory() && depth < 3 && (depth === 0 ? /^\d{4}$/ : /^\d{2}$/).test(entry.name)) await visit(join(directory, entry.name), depth + 1);
    }
  };
  try { await visit(join(codexHome, 'sessions'), 0); } catch (error) {
    if (error.kind === 'session-index-too-large') throw error;
    fail('current-session-unavailable');
  }
  if (matches.length !== 1) fail('current-session-unavailable');
  return matches[0];
}

// A projection of one local recording, never an attachment or a proof that all
// runtime sources were serialized. No paths, identities, prose or token totals.
export function summarizeDesktopRecords(records, { expectedCwd, expectedSessionId, preparedAt, markers } = {}) {
  const metas = records.filter(r => r?.type === 'session_meta');
  if (metas.length !== 1 || !object(metas[0].payload)) fail('invalid-desktop-record');
  const meta = metas[0].payload;
  if (typeof meta.id !== 'string' || !validDate(meta.timestamp) || typeof meta.cwd !== 'string') fail('invalid-desktop-record');
  if (expectedSessionId !== undefined && meta.id !== expectedSessionId) fail('desktop-record-identity-mismatch');
  const desktopOriginator = meta.originator === 'Codex Desktop';
  const recordedStartRoute = meta.thread_source === 'user' ? 'user-created'
    : meta.thread_source === 'agent_created_thread' ? 'agent-created'
      : meta.thread_source === 'agent_forked_thread' ? 'agent-forked' : 'unknown';
  const hasForkParent = meta.forked_from_id != null || meta.forked_from_thread_id != null;
  const knownFork = hasForkParent || recordedStartRoute === 'agent-forked';
  const contexts = records.filter(r => r?.type === 'turn_context' && object(r.payload)).map(r => r.payload);
  const firstContext = contexts[0];
  let startupOpen = true;
  let firstFullState = null;
  let fullStateCount = 0;
  const initialTexts = [];
  const developerTexts = [];
  let bodyInToolOutput = false;
  let usageCount = 0;
  let invalidUsageCount = 0;
  const usageFields = Object.fromEntries(USAGE_KEYS.map(k => [k, false]));
  let turnCompleted = false;
  for (const record of records) {
    const p = record?.payload;
    if (!object(p)) continue;
    if (record.type === 'world_state' && p.full === true && object(p.state)) {
      fullStateCount += 1;
      if (startupOpen && firstFullState === null) firstFullState = p.state;
    }
    if (record.type === 'response_item') {
      if (p.type === 'message' && ['developer', 'system', 'user'].includes(p.role) && startupOpen) {
        const text = textOf(p);
        initialTexts.push(text);
        if (p.role === 'developer') developerTexts.push(text);
      } else {
        startupOpen = false;
        if (markers && toolOutputHasMarker(p, markers.skillBody)) bodyInToolOutput = true;
      }
    }
    if (record.type === 'token_usage_record') {
      if (p.thread_id !== meta.id || !object(p.usage)
        || !USAGE_KEYS.every(k => p.usage[k] === undefined || (Number.isSafeInteger(p.usage[k]) && p.usage[k] >= 0))
        || !USAGE_KEYS.some(k => p.usage[k] !== undefined)) { invalidUsageCount += 1; continue; }
      usageCount += 1;
      for (const key of USAGE_KEYS) usageFields[key] ||= p.usage[key] !== undefined;
    }
    if (record.type === 'event_msg' && p.type === 'task_complete'
      && typeof p.turn_id === 'string' && p.turn_id === firstContext?.turn_id) turnCompleted = true;
  }
  const cwdMatches = expectedCwd === undefined ? null
    : meta.cwd === expectedCwd && firstContext?.cwd === expectedCwd;
  const preparedBeforeStart = preparedAt === undefined ? null
    : validDate(preparedAt) && Date.parse(meta.timestamp) >= Date.parse(preparedAt);
  const startupHasInput = initialTexts.length > 0;
  const markerTexts = [...initialTexts];
  if (typeof firstFullState?.agents_md?.text === 'string') markerTexts.push(firstFullState.agents_md.text);
  if (typeof firstFullState?.host_skills?.body === 'string') markerTexts.push(firstFullState.host_skills.body);
  const markerObservation = markers ? Object.fromEntries(MARKERS.map(key => [key,
    markerTexts.some(t => t.includes(markers[key])) ? 'present'
      : startupHasInput || firstFullState ? 'absent-in-record' : 'unknown',
  ])) : null;
  const sources = Object.fromEntries(SOURCE_KEYS.map(key => [key,
    firstFullState && Object.hasOwn(firstFullState, key) ? 'field-recorded' : 'unknown',
  ]));
  return {
    schemaVersion: 1, kind: 'codex-desktop-record-observation', observedAt: new Date().toISOString(),
    environment: { platform: platform(), architecture: arch(), nodeVersion: process.versions.node },
    codexCliVersion: version(meta.cli_version), surface: 'local-session-record',
    desktopSessionAttached: false, runtimeStateVerified: false, modeSwitchingVerified: false,
    sourceCoverage: 'unknown',
    provenance: { desktopOriginator, recordedStartRoute, hasForkParent, knownFork, contextRecorded: firstContext !== undefined,
      cwdMatches, preparedBeforeStart,
      freshFixtureTaskCandidate: desktopOriginator && !knownFork && cwdMatches === true && preparedBeforeStart === true },
    recordedSources: sources,
    initialInput: { recorded: startupHasInput,
      hostSkillCatalog: developerTexts.some(t => t.includes('<skills_instructions>') && t.includes('### Available skills')),
      memoryGuidance: developerTexts.some(t => t.includes('## Memory') && t.includes('MEMORY_SUMMARY')),
      appContext: developerTexts.some(t => t.includes('<app-context>')),
      markers: markerObservation },
    fixtureBodyInToolOutput: markers ? bodyInToolOutput : null,
    fullWorldStateRecords: fullStateCount,
    usage: { records: usageCount, invalidRecords: invalidUsageCount,
      fieldsPresent: usageFields, firstTurnCompleted: turnCompleted,
      totalsCollected: false, childUsageCoverage: 'unknown', completeness: 'unknown' },
  };
}

export async function collectDesktopRecord({ session, fixture, expectedSessionId } = {}) {
  let handle;
  try {
    // Open once and read a bounded prefix of this inode. A concurrently appended
    // partial trailing record is ignored and explicitly reported.
    const selected = await lstat(session);
    if (!selected.isFile() || selected.isSymbolicLink()) fail('invalid-desktop-record');
    handle = await open(session, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0) | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile()) fail('invalid-desktop-record');
    if (info.size > MAX_BYTES) fail('desktop-record-too-large');
    const buffer = Buffer.alloc(info.size);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) fail('desktop-record-changed');
      offset += bytesRead;
    }
    const text = buffer.toString('utf8');
    const lines = text.split('\n');
    const tail = lines.pop();
    let incompleteTrailingLine = false;
    if (tail) {
      if (Buffer.byteLength(tail) > MAX_LINE) fail('desktop-record-too-large');
      // Accept a valid last record without newline; a broken tail may be an
      // in-progress append. Broken records terminated by newline are errors.
      try { JSON.parse(tail); lines.push(tail); } catch { incompleteTrailingLine = true; }
    }
    const records = lines.filter(line => line.length > 0).map(line => {
      if (Buffer.byteLength(line) > MAX_LINE) fail('desktop-record-too-large');
      try { const value = JSON.parse(line); if (!object(value)) fail('invalid-desktop-record'); return value; }
      catch { fail('invalid-desktop-record'); }
    });
    let options = { expectedSessionId };
    if (fixture !== undefined) {
      const owned = await snapshotDesktopFixture(fixture);
      if (owned.operationLocked || owned.state.pending !== null || owned.state.initializing || owned.state.cleanup) fail('fixture-recovery-required');
      options = { ...options, expectedCwd: owned.project, preparedAt: owned.state.preparedAt, markers: fixtureMarkers(owned.state.seed) };
    }
    const report = summarizeDesktopRecords(records, options);
    report.recordRead = { incompleteTrailingLine, snapshotBytes: info.size };
    return report;
  } catch (error) {
    const allowed = new Set(['invalid-desktop-record', 'desktop-record-too-large', 'desktop-record-changed', 'desktop-record-identity-mismatch',
      'fixture-conflict', 'fixture-changed', 'fixture-link-or-type', 'invalid-fixture', 'fixture-recovery-required']);
    fail(allowed.has(error?.kind) ? error.kind : 'desktop-record-read-error');
  } finally { await handle?.close(); }
}
