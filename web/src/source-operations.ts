import { ApiError } from "./api.ts";
import type { Api } from "./api";
import type { SourceMetadata, SourceView } from "./sources";
export function validateSourceMetadata(value: SourceMetadata): SourceMetadata {
  if (
    value?.kind !== "user-sources" ||
    typeof value.launchId !== "string" ||
    !value.launchId ||
    typeof value.contextId !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.contextId) ||
    !value.context ||
    ["codexHome", "project", "executable"].some(
      (key) =>
        typeof value.context[key as keyof SourceMetadata["context"]] !==
          "string" || !value.context[key as keyof SourceMetadata["context"]],
    ) ||
    (value.workspace !== null &&
      (typeof value.workspace !== "string" || !value.workspace))
  )
    throw new ApiError("invalid-response");
  return value;
}
export function sameSourceContext(a: SourceMetadata, b: SourceMetadata) {
  return (
    a.launchId === b.launchId &&
    a.contextId === b.contextId &&
    a.workspace === b.workspace &&
    a.context.codexHome === b.context.codexHome &&
    a.context.project === b.context.project &&
    a.context.executable === b.context.executable
  );
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
