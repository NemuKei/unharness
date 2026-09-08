import { ApiError } from "./api.ts";
import type { Api } from "./api";
import { sameSourceContext, validateSourceMetadata } from "./source-operations.ts";
import { validReplayResponse } from "./replays.ts";
import type { ReplayPage } from "./replays";
import type { SourceMetadata, SourceView, SourceFavoritePage } from "./sources";
import type { RunPage } from "./comparisons";
import type { StartingPage } from "./starting-conditions";
import { validateMeasurement } from "../../src/comparisons/measurement.mjs";
import { validateAssessment, deriveAcceptance } from "../../src/comparisons/assessment.mjs";

export type HistorySlice<T> = { data: T; error: null } | { data: null; error: { kind: string } };
export type SourceUpdate = {
  status: "updated"; metadata: SourceMetadata; token: string;
  versions: Record<"source" | "favorites" | "runs" | "starts" | "replays", string>;
  view: SourceView; retryRequired: boolean;
  history: null | { favorites: HistorySlice<SourceFavoritePage>; runs: HistorySlice<RunPage>;
    starts: HistorySlice<StartingPage>; replays: HistorySlice<ReplayPage> };
};
export type SourceUpdateResponse = SourceUpdate
  | { status: "unchanged"; metadata: SourceMetadata; token: string }
  | { status: "context-changed"; metadata: SourceMetadata }
  | { status: "changing"; metadata: SourceMetadata };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string";
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(text);
const hash = (v: unknown): v is string => text(v) && /^[a-f0-9]{64}$/.test(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const maybeHash = (v: unknown) => v === null || hash(v);
const maybeText = (v: unknown) => v === null || text(v);
const mode = (v: unknown) => text(v) && ["normal", "unseal", "trueform"].includes(v);
const oneOf = (v: unknown, values: string[]) => text(v) && values.includes(v);
const time = (v: unknown) => text(v) && Number.isFinite(Date.parse(v));
const verification = (v: unknown) => object(v) && v.runtimeStateVerified === false && v.modeSwitchingVerified === false
  && v.sourceCoverage === "unknown" && v.nextTaskRequired === true;
const invalid = () => { throw new ApiError("invalid-response"); };
const fieldsMatch = (value: unknown, expected: Record<string, unknown>) => object(value)
  && Object.entries(expected).every(([key, item]) => value[key] === item);
function observation(v: unknown, scopeId: string) {
  if (v === null) return true;
  return object(v) && v.scopeId === scopeId && hash(v.observationId) && text(v.taskId) && hash(v.snapshotId)
    && maybeText(v.preparationId) && mode(v.preparedMode) && time(v.observedAt)
    && oneOf(v.status, ["matched-record", "not-matched-record", "unqualified-record", "unknown-record"])
    && strings(v.reasons) && Array.isArray(v.sources) && v.sources.every(s => object(s) && text(s.sourceId)
      && text(s.category) && text(s.expected) && text(s.recorded) && text(s.status))
    && object(v.conditions) && [v.conditions.codexVersion, v.conditions.model, v.conditions.reasoningEffort].every(maybeText)
    && maybeHash(v.conditions.executionPolicyDigest) && maybeHash(v.conditions.projectInstructionsDigest)
    && typeof v.conditions.memoryGuidanceRecorded === "boolean" && verification(v.verification);
}
function sourceView(value: unknown, metadata: SourceMetadata): value is SourceView {
  if (!object(value) || !object(value.guide) || !text(value.guide.id) || !text(value.guide.text)
    || !hash(value.guide.digest) || !text(value.guide.reviewedOn) || !strings(value.guide.references) || !hash(value.changeVersion)) return false;
  try { if (!sameSourceContext(validateSourceMetadata(value.metadata as SourceMetadata), metadata)) return false; } catch { return false; }
  const s = value.source;
  if (s === null) return metadata.workspace === null;
  if (!metadata.workspace || !object(s) || !mode(s.preparedMode) || !count(s.revision) || !object(s.registration)
    || !hash(s.registration.scopeId) || !hash(s.registration.normalId) || !hash(s.registration.activeNormalId)
    || !Array.isArray(s.registration.sources) || s.registration.sources.length > 33
    || !s.registration.sources.every(row => object(row) && text(row.id) && text(row.label) && text(row.path)
      && object(row.availability) && [row.availability.normal, row.availability.unseal, row.availability.trueform].every(v => typeof v === "boolean"))
    || !fieldsMatch(s.context, metadata.context)
    || !(s.conflict === null || object(s.conflict) && text(s.conflict.kind)) || !object(s.recovery)
    || typeof s.recovery.pending !== "boolean" || !maybeHash(s.recovery.lastCheckpointId) || !strings(s.recovery.argv)
    || !(s.preparation === null || object(s.preparation) && text(s.preparation.id) && time(s.preparation.preparedAt))
    || !maybeText(s.observationIssue) || !observation(s.observation, s.registration.scopeId) || !verification(s.verification)) return false;
  return true;
}
function page(value: unknown, key: string, valid: (row: unknown) => boolean) {
  return object(value) && Array.isArray(value[key]) && value[key].length <= 20 && value[key].every(valid) && maybeHash(value.nextCursor);
}
function favoritePage(value: unknown) {
  return page(value, "favorites", f => object(f) && hash(f.favoriteId) && hash(f.normalId) && mode(f.preparedMode)
    && text(f.name) && count(f.revision) && typeof f.needsAdaptation === "boolean");
}
function runPage(value: unknown, scopeId: string) {
  return page(value, "runs", r => {
    try {
      if (!object(r) || r.scopeId !== scopeId || !hash(r.runId) || !hash(r.reviewId) || !time(r.capturedAt)
        || !maybeText(r.title) || !maybeHash(r.previousRunId) || r.measurementKind !== "observational" || !object(r.collectedOn)
        || ![r.collectedOn.platform, r.collectedOn.kernelRelease, r.collectedOn.architecture, r.collectedOn.nodeVersion].every(text)
        || !object(r.source) || !maybeText(r.source.issue) || !verification(r.verification)) return false;
      validateMeasurement(r.measurement); validateAssessment(r.assessment);
      const acceptance = deriveAcceptance(r.assessment);
      if (!fieldsMatch(r.acceptance, acceptance)) return false;
      const a = r.source.association, o = r.source.observation;
      if (a !== null && (!object(a) || a.scopeId !== scopeId || !mode(a.preparedMode) || !hash(a.snapshotId)
        || !hash(a.normalId) || !count(a.revision) || !maybeText(a.preparationId) || a.coverage !== "initial-turn-only")) return false;
      return o === null || object(o) && hash(o.observationId) && time(o.observedAt) && strings(o.reasons)
        && oneOf(o.status, ["matched-record", "not-matched-record", "unqualified-record", "unknown-record"]);
    } catch { return false; }
  });
}
function startPage(value: unknown, scopeId: string) {
  return page(value, "starts", s => object(s) && s.scopeId === scopeId && hash(s.startId) && hash(s.reviewId)
    && time(s.frozenAt) && maybeText(s.title) && count(s.fileCount) && count(s.totalBytes) && count(s.absentCount)
    && count(s.requestBytes) && object(s.criteria) && Array.isArray(s.criteria.requirements) && Array.isArray(s.criteria.ratings)
    && s.criteria.requirements.every(r => object(r) && text(r.id) && text(r.label) && typeof r.critical === "boolean")
    && s.criteria.ratings.every(r => object(r) && [r.id, r.label, r.lowAnchor, r.highAnchor].every(text))
    && object(s.criteria.budget) && count(s.criteria.budget.maxAttempts) && count(s.criteria.budget.maxTurnsPerAttempt)
    && (s.criteria.budget.maxRecordedTokens === null || count(s.criteria.budget.maxRecordedTokens))
    && object(s.selection) && strings(s.selection.additionalPaths) && object(s.conditions)
    && oneOf(s.inputIntegrity, ["verified", "not-rechecked"]));
}
function slice<T>(value: unknown, valid: (data: unknown) => boolean): HistorySlice<T> {
  if (object(value) && value.data === null && object(value.error) && text(value.error.kind) && /^[a-z][a-z0-9-]{0,80}$/.test(value.error.kind))
    return { data: null, error: { kind: value.error.kind } };
  if (object(value) && value.error === null && valid(value.data)) return { data: value.data as T, error: null };
  return { data: null, error: { kind: "invalid-response" } };
}
export function validateSourceUpdate(value: unknown, accepted: SourceView, after?: string): SourceUpdateResponse {
  if (!object(value)) return invalid();
  const metadata = validateSourceMetadata(value.metadata as SourceMetadata);
  if (value.status === "context-changed") return { status: "context-changed", metadata };
  if (!sameSourceContext(metadata, accepted.metadata)) throw new ApiError("gui-source-context-changed");
  if (value.status === "changing") return { status: "changing", metadata };
  if (value.status === "unchanged") {
    if (!after || value.token !== after) return invalid();
    return { status: "unchanged", metadata, token: after };
  }
  const rawVersions = value.versions;
  if (value.status !== "updated" || !hash(value.token) || !object(rawVersions)
    || Object.keys(rawVersions).length !== 5 || !["source", "favorites", "runs", "starts", "replays"].every(k => hash(rawVersions[k]))
    || !sourceView(value.view, metadata) || value.view.changeVersion !== rawVersions.source
    || value.view.source?.registration.scopeId !== accepted.source?.registration.scopeId) return invalid();
  const versions = rawVersions as SourceUpdate["versions"];
  if (!value.view.source) {
    if (value.history !== null) return invalid();
    return { status: "updated", metadata, token: value.token, versions, view: value.view, history: null, retryRequired: false };
  }
  if (!object(value.history)) return invalid();
  const scope = value.view.source.registration.scopeId;
  const rows = { favorites: slice<SourceFavoritePage>(value.history.favorites, favoritePage),
    runs: slice<RunPage>(value.history.runs, data => runPage(data, scope)),
    starts: slice<StartingPage>(value.history.starts, data => startPage(data, scope)),
    replays: slice<ReplayPage>(value.history.replays, data => validReplayResponse("replays", data, scope)) };
  return { status: "updated", metadata, token: value.token, versions, view: value.view, history: rows,
    retryRequired: Object.values(rows).some(row => row.error !== null) };
}
export async function readSourceUpdate(api: Api, accepted: SourceView, after?: string) {
  await api.connect();
  const params = new URLSearchParams({ launchId: accepted.metadata.launchId, contextId: accepted.metadata.contextId, ...(after ? { after } : {}) });
  return validateSourceUpdate(await api.get<unknown>("/sources/updates?" + params), accepted, after);
}
export function canAcceptSourceUpdate(before: SourceView, current: SourceView | null, beforeGeneration: number, currentGeneration: number) {
  return !!current && beforeGeneration === currentGeneration && sameSourceContext(before.metadata, current.metadata)
    && before.source?.registration.scopeId === current.source?.registration.scopeId;
}
export function mergeHistoryRows<T>(existing: T[], incoming: T[], key: keyof T): T[] {
  const ids = new Set(incoming.map(row => row[key]));
  return [...incoming, ...existing.filter(row => !ids.has(row[key]))];
}
