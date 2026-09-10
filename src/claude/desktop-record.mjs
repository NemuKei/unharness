// Claude Code desktop task recording.
//
// A Claude Code session is one JSONL file under <home>/projects/<project>/.
// The project directory name is derived by the application, so this locates a
// recording by filename only and never opens another task's contents to find
// the requested one.
import { readdir } from 'node:fs/promises';
import { arch, platform } from 'node:os';
import { join } from 'node:path';
import { readRecordFile } from '../sources/record-file.mjs';

export const readDesktopRecords = readRecordFile;

const MAX_ENTRIES = 50000;
const fail = (kind) => {
  throw Object.assign(new Error(kind), { kind });
};
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const validDate = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v));

export const DESKTOP_ENTRYPOINT = 'claude-desktop';
// A turn the assistant ended, as opposed to one it paused to call a tool.
export const TURN_END_STOP_REASONS = Object.freeze([
  'end_turn',
  'stop_sequence',
  'max_tokens'
]);

export async function findCurrentDesktopSession({ sessionId, claudeHome } = {}) {
  if (
    typeof sessionId !== 'string' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(sessionId) ||
    typeof claudeHome !== 'string'
  )
    fail('current-session-unavailable');
  const matches = [];
  let count = 0;
  try {
    const root = join(claudeHome, 'projects');
    for (const project of await readdir(root, { withFileTypes: true })) {
      if (++count > MAX_ENTRIES) fail('session-index-too-large');
      if (!project.isDirectory() || project.isSymbolicLink()) continue;
      for (const entry of await readdir(join(root, project.name), {
        withFileTypes: true
      })) {
        if (++count > MAX_ENTRIES) fail('session-index-too-large');
        if (entry.isFile() && entry.name === `${sessionId}.jsonl`)
          matches.push(join(root, project.name, entry.name));
      }
    }
  } catch (error) {
    if (error.kind === 'session-index-too-large') throw error;
    fail('current-session-unavailable');
  }
  if (matches.length !== 1) fail('current-session-unavailable');
  return matches[0];
}

/** The first attachment of a given type, which carries the startup snapshot. */
export function firstAttachment(records, type) {
  for (const r of records)
    if (r?.type === 'attachment' && r.attachment?.type === type)
      return r.attachment;
  return null;
}

/** The earliest record that carries session-level fields. */
export function sessionHeader(records) {
  const withSession = records.filter(
    (r) =>
      object(r) &&
      typeof r.sessionId === 'string' &&
      ['user', 'assistant', 'attachment', 'system'].includes(r.type)
  );
  if (!withSession.length) return null;
  const first = withSession[0];
  const ids = new Set(withSession.map((r) => r.sessionId));
  return {
    sessionId: ids.size === 1 ? first.sessionId : null,
    version: typeof first.version === 'string' ? first.version : null,
    cwd: typeof first.cwd === 'string' ? first.cwd : null,
    entrypoint: typeof first.entrypoint === 'string' ? first.entrypoint : null,
    userType: typeof first.userType === 'string' ? first.userType : null,
    timestamp: validDate(first.timestamp) ? first.timestamp : null,
    // A sidechain record belongs to a subagent, not to the requested task.
    anySidechain: withSession.some((r) => r.isSidechain === true),
    permissionMode:
      withSession.map((r) => r.permissionMode).find((v) => typeof v === 'string') ??
      null,
    gitBranchRecorded: withSession.some((r) => typeof r.gitBranch === 'string')
  };
}

export function turnCompleted(records) {
  return records.some(
    (r) =>
      r?.type === 'assistant' &&
      object(r.message) &&
      TURN_END_STOP_REASONS.includes(r.message.stop_reason)
  );
}

/**
 * A projection of one local recording used for evidence collection. It carries
 * counts and recorded-field presence, never prose, paths or transcript text.
 */
export function summarizeDesktopRecords(records, { expectedSessionId, expectedCwd, preparedAt } = {}) {
  const header = sessionHeader(records);
  if (!header) fail('invalid-desktop-record');
  if (expectedSessionId !== undefined && header.sessionId !== expectedSessionId)
    fail('desktop-record-identity-mismatch');
  const instructions = firstAttachment(records, 'instructions');
  const skillListing = firstAttachment(records, 'skill_listing');
  const model = firstAttachment(records, 'model');
  const environment = firstAttachment(records, 'environment');
  const instructionScopes = Array.isArray(instructions?.files)
    ? instructions.files
        .map((f) => (typeof f?.type === 'string' ? f.type : 'unknown'))
        .sort()
    : null;
  return {
    schemaVersion: 1,
    kind: 'claude-desktop-record-observation',
    observedAt: new Date().toISOString(),
    environment: {
      platform: platform(),
      architecture: arch(),
      nodeVersion: process.versions.node
    },
    claudeCodeVersion: header.version,
    surface: 'local-session-record',
    desktopSessionAttached: false,
    runtimeStateVerified: false,
    modeSwitchingVerified: false,
    sourceCoverage: 'unknown',
    provenance: {
      desktopOriginator: header.entrypoint === DESKTOP_ENTRYPOINT,
      recordedEntrypoint: header.entrypoint,
      anySidechain: header.anySidechain,
      cwdMatches: expectedCwd === undefined ? null : header.cwd === expectedCwd,
      preparedBeforeStart:
        preparedAt === undefined
          ? null
          : validDate(preparedAt) &&
            !!header.timestamp &&
            Date.parse(header.timestamp) >= Date.parse(preparedAt),
      firstTurnCompleted: turnCompleted(records)
    },
    recordedSources: {
      instructions: instructions ? 'field-recorded' : 'unknown',
      instructionFileCount: Array.isArray(instructions?.files)
        ? instructions.files.length
        : null,
      instructionScopes,
      skillListing: skillListing ? 'field-recorded' : 'unknown',
      skillCount: Number.isSafeInteger(skillListing?.skillCount)
        ? skillListing.skillCount
        : null,
      model: model ? 'field-recorded' : 'unknown',
      environmentSnapshot: environment ? 'field-recorded' : 'unknown'
    },
    permissionModeRecorded: header.permissionMode,
    records: records.length
  };
}

export async function collectDesktopRecord({ session, expectedSessionId, expectedCwd, notBefore } = {}) {
  try {
    if (notBefore !== undefined && !validDate(notBefore))
      fail('invalid-desktop-record');
    const { records, recordRead } = await readRecordFile(session);
    const report = summarizeDesktopRecords(records, {
      expectedSessionId,
      expectedCwd,
      preparedAt: notBefore
    });
    report.recordRead = recordRead;
    return report;
  } catch (error) {
    const allowed = new Set([
      'invalid-desktop-record',
      'desktop-record-too-large',
      'desktop-record-changed',
      'desktop-record-identity-mismatch'
    ]);
    fail(allowed.has(error?.kind) ? error.kind : 'desktop-record-read-error');
  }
}
