import { ApiError } from "./api.ts";
import type { Api } from "./api";
import type { SourceMetadata, SourceView } from "./sources";
import { sourceHomeOf, sourceRuntimeOf } from "./sources.ts";
export function validateSourceMetadata(value: SourceMetadata): SourceMetadata {
  const context = value?.context as Record<string, unknown> | undefined;
  const string = (key: string) =>
    typeof context?.[key] === "string" && !!context[key];
  if (
    value?.kind !== "user-sources" ||
    !["codex", "claude"].includes(value.application) ||
    typeof value.applicationLabel !== "string" ||
    !value.applicationLabel ||
    typeof value.launchId !== "string" ||
    !value.launchId ||
    typeof value.contextId !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.contextId) ||
    !context ||
    !string("project") ||
    // Each application declares exactly its own launch identity fields.
    (value.application === "claude"
      ? context.application !== "claude" ||
        !string("claudeHome") ||
        !string("appBundle")
      : !string("codexHome") || !string("executable")) ||
    (value.workspace !== null &&
      (typeof value.workspace !== "string" || !value.workspace))
  )
    throw new ApiError("invalid-response");
  return value;
}
function sameSourceLocation(a: SourceMetadata, b: SourceMetadata) {
  return (
    a.launchId === b.launchId &&
    a.workspace === b.workspace &&
    a.application === b.application &&
    sourceHomeOf(a.context) === sourceHomeOf(b.context) &&
    a.context.project === b.context.project &&
    sourceRuntimeOf(a.context) === sourceRuntimeOf(b.context) &&
    Object.keys(a.context).length === Object.keys(b.context).length &&
    Object.entries(a.context).every(([key, value]) => value === (b.context as unknown as Record<string, unknown>)[key])
  );
}
export function sameSourceContext(a: SourceMetadata, b: SourceMetadata) {
  return a.contextId === b.contextId && sameSourceLocation(a, b);
}
export function sameSourcePlanContext(
  previous: Pick<SourceView, "metadata" | "source">,
  next: Pick<SourceView, "metadata" | "source">,
) {
  if (!sameSourceContext(previous.metadata, next.metadata)) return false;
  if (!previous.source || !next.source) return previous.source === next.source;
  return (
    previous.source.registration.scopeId ===
      next.source.registration.scopeId &&
    previous.source.registration.activeNormalId ===
      next.source.registration.activeNormalId &&
    previous.source.revision === next.source.revision
  );
}
export type EnrollmentTransition = { reviewId: string; nextScopeId: string };
// An explicitly reviewed enrollment changes scope on purpose. This does not
// authorize a different home, root, review, unrelated scope or later revision.
export function reviewedEnrollmentTransition(
  accepted: SourceView,
  review: EnrollmentTransition,
  response: { status: string; result?: unknown; state: SourceView },
): boolean {
  const before = accepted.source, after = response.state?.source;
  const result = response.result as Record<string, unknown> | null;
  const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  if (!before || !after || !result || typeof result !== 'object' || response.status !== 'completed'
    || !hash(review.reviewId) || !hash(review.nextScopeId) || review.nextScopeId === before.registration.scopeId) return false;
  try {
    const metadata = validateSourceMetadata(response.state.metadata);
    // contextId includes scopeId, so a legitimate child necessarily gets a
    // new contextId. Only this reviewed transition can accept that change.
    if (!sameSourceLocation(accepted.metadata, metadata) || metadata.contextId === accepted.metadata.contextId) return false;
  } catch { return false; }
  return result.adopted === true && result.reviewId === review.reviewId
    && result.scopeId === before.registration.scopeId && result.nextScopeId === review.nextScopeId
    && result.sourceFilesChanged === 0 && result.modeChangeRequired === true
    && Number.isSafeInteger(result.revision) && result.revision === before.revision + 1
    && after.revision === result.revision && after.registration.scopeId === review.nextScopeId
    && after.registration.rootScopeId === (before.registration.rootScopeId ?? before.registration.scopeId)
    && after.registration.previousScopeIds?.[0] === before.registration.scopeId
    && hash(result.nextNormalId) && after.registration.normalId === result.nextNormalId
    && after.registration.activeNormalId === result.nextNormalId && after.registration.modeChangeRequired === true
    && after.conflict === null && after.recovery?.pending === false;
}
export async function readSourceState(api: Api): Promise<SourceView> {
  await api.connect();
  const view = await api.get<SourceView>("/sources/state");
  validateSourceMetadata(view.metadata);
  return view;
}
export async function sourceOperation<T>(
  api: Api,
  accepted: SourceMetadata,
  action: string,
  input: object,
): Promise<
  | { status: "context-updated"; state: SourceView }
  | { status: "completed"; result: T; state: SourceView }
> {
  await api.connect();
  const metadata = validateSourceMetadata(
    await api.get<SourceMetadata>("/sources/metadata"),
  );
  if (!sameSourceContext(metadata, accepted)) {
    const state = await api.get<SourceView>("/sources/state");
    validateSourceMetadata(state.metadata);
    return { status: "context-updated", state };
  }
  // No reconnect or retry after POST. Retain the exact plan in the calling view
  // if transport fails; a later explicit refresh determines readback state.
  const response = await api.post<{ result: T; state: SourceView }>(
    "/sources/" + action,
    { ...input, launchId: metadata.launchId, contextId: metadata.contextId },
  );
  validateSourceMetadata(response.state.metadata);
  return { status: "completed", ...response };
}
