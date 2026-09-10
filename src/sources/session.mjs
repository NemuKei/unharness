import { createHash, randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import * as service from "./service.mjs";
import { getMinimalGuide } from "./guide.mjs";

const HASH = /^[a-f0-9]{64}$/;
const fail = (kind) => {
  throw Object.assign(new Error(kind), { kind });
};
const sourceId = (value) =>
  typeof value === "string" &&
  /^(instructions|skill)-[a-f0-9]{64}$/.test(value);
const id = (value) => typeof value === "string" && HASH.test(value);
const fields = {
  discover: [[], []],
  review: [["sourceId"], ["discoveryId"]],
  register: [
    [
      "discoveryId",
      "instructionsOptional",
      "selectedSkillIds",
      "userAddedOptional",
    ],
    [],
  ],
  plan: [["mode"], ["selectedIds"]],
  "plan-retained": [[], []],
  "accept-retained": [["planId"], []],
  setup: [[], []],
  "review-setup": [["proposal"], []],
  "apply-setup": [["reviewId"], []],
  "enrollment-inventory": [[], []],
  "review-candidate": [["discoveryId", "sourceId"], []],
  "review-enrollment": [["discoveryId", "additions"], []],
  "apply-enrollment": [["reviewId"], []],
  apply: [["planId"], []],
  save: [[], ["name"]],
  favorites: [[], ["after"]],
  favorite: [["favoriteId"], []],
  checkpoint: [["checkpointId"], []],
  recover: [[], []],
  observe: [["taskId"], []],
  "review-run": [["taskId"], ["throughTurnId"]],
  "save-run": [["reviewId", "assessment"], ["title", "previousRunId"]],
  runs: [[], ["after"]],
  run: [["runId"], []],
  "run-output": [["runId"], []],
  "compare-runs": [["runIds"], []],
  "run-favorite": [["runId"], ["name"]],
  "review-start": [["declaration"], ["additionalPaths"]],
  "save-start": [["reviewId"], []],
  start: [["startId"], []],
  starts: [[], ["after"]],
  "review-replay": [["startId"], []],
  "prepare-replay": [["reviewId"], []],
  "handoff-replay": [["attemptId"], []],
  replay: [["attemptId"], []],
  replays: [[], ["after"]],
  "cancel-replay": [["attemptId"], []],
  "observe-replay": [["attemptId", "taskId"], []],
  "save-replay-result": [["resultReviewId", "assessment"], ["previousResultId"]],
  "replay-result": [["resultId"], []],
  "open-replay": [["attemptId"], []],
  "compare-replays": [["resultIds"], []],
  "replay-favorite": [["resultId"], ["name"]],
  appearance: [[], ["after"]],
  artwork: [[], ["after"]],
  "artwork-item": [["itemId"], []],
  "discover-appearance": [[], ["expectedStateId"]],
  "select-appearance": [["itemId", "expectedStateId"], []],
  "name-appearance": [["itemId", "expectedStateId", "name"], []],
  "use-appearance-evidence": [["startId", "expectedStateId"], []],
  "evaluate-appearance": [["startId"], []],
  "original-candidates": [["achievementId"], []],
  "recover-appearance": [[], []],
  "appearance-item": [["itemId"], []],
  "review-appearance-import": [["importId", "expectedStateId", "manifest", "files"], []],
  "read-appearance-import": [["reviewId"], []],
  "save-appearance-import": [["reviewId", "expectedStateId"], []],
  "prepare-appearance-authoring": [["creationId", "baseItemId"], []],
  "read-appearance-authoring": [["authoringId"], []],
  "review-authored-appearance": [["authoringId", "importId", "expectedStateId", "name", "author", "partIds"], []],
};
export function sourceRequestShape(body, action) {
  const schema = Object.hasOwn(fields, action) ? fields[action] : null;
  if (!schema || !body || typeof body !== "object" || Array.isArray(body))
    fail("gui-invalid-request");
  const { requestId, launchId, contextId, ...input } = body;
  if (
    typeof requestId !== "string" ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestId) ||
    typeof launchId !== "string" ||
    typeof contextId !== "string"
  )
    fail("gui-invalid-request");
  const [required, optional] = schema;
  if (
    required.some((key) => !Object.hasOwn(input, key)) ||
    Object.keys(input).some((key) => ![...required, ...optional].includes(key))
  )
    fail("gui-invalid-request");
  for (const key of [
    "discoveryId",
    "planId",
    "favoriteId",
    "checkpointId",
    "after",
    "reviewId",
    "previousRunId",
    "runId",
    "startId",
    "attemptId",
    "resultReviewId",
    "resultId",
    "previousResultId",
    "itemId", "expectedStateId", "achievementId", "candidateId", "authoringId", "baseItemId",
  ])
    if (Object.hasOwn(input, key) && !id(input[key])
      && !(key === 'expectedStateId' && input[key] === null && ['review-appearance-import', 'save-appearance-import', 'review-authored-appearance'].includes(action))
      && !(key === 'baseItemId' && input[key] === null && action === 'prepare-appearance-authoring'))
      fail("gui-invalid-request");
  for (const key of ['importId', 'creationId']) if (Object.hasOwn(input, key) && (typeof input[key] !== 'string'
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(input[key]))) fail('gui-invalid-request');
  if (
    Object.hasOwn(input, "taskId") &&
    (typeof input.taskId !== "string" ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.taskId))
  )
    fail("gui-invalid-request");
  if (Object.hasOwn(input, "sourceId") && !sourceId(input.sourceId))
    fail("gui-invalid-request");
  if (
    Object.hasOwn(input, "throughTurnId") &&
    (typeof input.throughTurnId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(input.throughTurnId))
  )
    fail("gui-invalid-request");
  if (
    Object.hasOwn(input, "runIds") &&
    (!Array.isArray(input.runIds) ||
      input.runIds.length < 1 ||
      input.runIds.length > 3 ||
      input.runIds.some((value) => !id(value)) ||
      new Set(input.runIds).size !== input.runIds.length)
  )
    fail("gui-invalid-request");
  if (Object.hasOwn(input, "resultIds") && (!Array.isArray(input.resultIds) || input.resultIds.length < 1 || input.resultIds.length > 3
    || input.resultIds.some(value => !id(value)) || new Set(input.resultIds).size !== input.resultIds.length)) fail("gui-invalid-request");
  if (
    Object.hasOwn(input, "assessment") &&
    (!input.assessment ||
      typeof input.assessment !== "object" ||
      Array.isArray(input.assessment))
  )
    fail("gui-invalid-request");
  if (Object.hasOwn(input, "declaration") && (!input.declaration || typeof input.declaration !== "object" || Array.isArray(input.declaration)))
    fail("gui-invalid-request");
  if (Object.hasOwn(input, "proposal") && (!input.proposal || typeof input.proposal !== "object" || Array.isArray(input.proposal)))
    fail("gui-invalid-request");
  if (Object.hasOwn(input, "additions") && (!Array.isArray(input.additions) || !input.additions.length || input.additions.length > 32))
    fail("gui-invalid-request");
  if (Object.hasOwn(input, "additionalPaths") && (!Array.isArray(input.additionalPaths) || input.additionalPaths.length > 2048
    || input.additionalPaths.some(path => typeof path !== "string" || Buffer.byteLength(path) > 1024)))
    fail("gui-invalid-request");
  for (const key of ["selectedSkillIds", "selectedIds"])
    if (
      Object.hasOwn(input, key) &&
      (!Array.isArray(input[key]) ||
        input[key].length > 33 ||
        input[key].some((value) => !sourceId(value)) ||
        new Set(input[key]).size !== input[key].length)
    )
      fail("gui-invalid-request");
  for (const key of ["instructionsOptional", "userAddedOptional"])
    if (Object.hasOwn(input, key) && typeof input[key] !== "boolean")
      fail("gui-invalid-request");
  if (
    Object.hasOwn(input, "name") &&
    (typeof input.name !== "string" ||
      input.name.length > 120 ||
      /[\u0000-\u001f]/.test(input.name))
  )
    fail("gui-invalid-request");
  if (
    Object.hasOwn(input, "title") &&
    (typeof input.title !== "string" ||
      !input.title.trim() ||
      input.title.length > 120 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(input.title))
  )
    fail("gui-invalid-request");
  if (
    Object.hasOwn(input, "mode") &&
    !["normal", "unseal", "trueform"].includes(input.mode)
  )
    fail("gui-invalid-request");
  return { requestId, input: { launchId, contextId, ...input } };
}

export async function createSourceController(input, { workspace: selectedWorkspace, launchId = randomUUID() } = {}) {
  if (typeof launchId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(launchId)) fail("gui-invalid-request");
  // The service locator validates canonical roots without native discovery.
  const { applicationFor } = await import("../apps/index.mjs");
  const app = applicationFor(input);
  const context =
    app.id === "codex"
      ? { ...input, executable: input.executable ?? "codex" }
      : input;
  let located = await service.locateUserSources({ context });
  if (selectedWorkspace !== undefined && (!located || located.workspace !== selectedWorkspace)) fail("source-session-changed");
  let pinnedScope = located?.rootScopeId ?? null;
  let pinnedWorkspace = located?.workspace ?? null;
  const roots = [app.home(context), context.project, ...(pinnedWorkspace === null ? [] : [pinnedWorkspace])];
  const identities = await Promise.all(roots.map((path) => lstat(path)));
  async function metadata() {
    for (let index = 0; index < roots.length; index++) {
      const now = await lstat(roots[index]);
      if (
        !now.isDirectory() ||
        now.isSymbolicLink() ||
        now.dev !== identities[index].dev ||
        now.ino !== identities[index].ino
      )
        fail("gui-source-context-changed");
    }
    located = await service.locateUserSources({ context });
    const workspace = located?.workspace ?? null;
    if (pinnedWorkspace !== null && (workspace !== pinnedWorkspace || located?.rootScopeId !== pinnedScope)) fail("gui-source-context-changed");
    if (pinnedWorkspace === null && located) {
      const candidate = located, identity = await lstat(candidate.workspace);
      if (pinnedWorkspace === null) {
        roots.push(candidate.workspace);
        identities.push(identity);
        pinnedWorkspace = candidate.workspace;
        pinnedScope = candidate.rootScopeId;
      } else if (pinnedWorkspace !== candidate.workspace || pinnedScope !== candidate.rootScopeId) fail("gui-source-context-changed");
    }
    const contextId = createHash("sha256")
      .update(JSON.stringify({ context, workspace, scopeId: located?.scopeId ?? null }))
      .digest("hex");
    return { kind: "user-sources", application: app.id, applicationLabel: app.label, launchId, contextId, context, workspace };
  }
  async function state() {
    const meta = await metadata();
    const { sourceChangeVersion } = await import("./updates.mjs");
    const before = await sourceChangeVersion(meta);
    const source = located ? await service.userSourceState({ workspace: located.workspace }) : null;
    const after = await sourceChangeVersion(meta);
    return {
      metadata: meta,
      source,
      changeVersion: before === after ? before : null,
      guide: getMinimalGuide(),
    };
  }
  return {
    metadata,
    state,
    async image(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).length !== 4 || !['launchId', 'contextId', 'referenceId', 'assetId'].every(key => Object.hasOwn(input, key))
        || ![input.contextId, input.referenceId, input.assetId].every(id)) fail('gui-invalid-request');
      const meta = await metadata();
      if (input.launchId !== meta.launchId || input.contextId !== meta.contextId || !meta.workspace) fail('gui-source-context-changed');
      const image = await service.readUserAppearanceImage({ workspace: meta.workspace, referenceId: input.referenceId, assetId: input.assetId });
      const after = await metadata();
      if (after.contextId !== meta.contextId || after.workspace !== meta.workspace) fail('gui-source-context-changed');
      return image;
    },
    async updates(input) {
      if (!input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).some(k => !["launchId", "contextId", "after"].includes(k))
        || typeof input.launchId !== "string" || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.launchId)
        || !id(input.contextId) || input.after !== undefined && !id(input.after)) fail("gui-invalid-request");
      const meta = await metadata();
      if (input.launchId !== meta.launchId || input.contextId !== meta.contextId) return { status: "context-changed", metadata: meta };
      const { readSourceUpdates } = await import("./updates.mjs");
      return readSourceUpdates({ metadata: meta, readState: state, readMetadata: metadata, after: input.after });
    },
    async execute(
      action,
      { launchId: acceptedLaunch, contextId: acceptedContext, ...input },
    ) {
      sourceRequestShape({ requestId: randomUUID(), launchId: acceptedLaunch, contextId: acceptedContext, ...input }, action);
      const meta = await metadata();
      if (
        acceptedLaunch !== meta.launchId ||
        acceptedContext !== meta.contextId
      )
        fail("gui-source-context-changed");
      if (action === "discover") return service.discoverUserSources(context);
      if (action === "register") {
        if (located) fail("profile-owned");
        return service.registerUserSources({ context, ...input });
      }
      if (action === "review" && !located)
        return service.reviewDiscoveredUserSource({ context, ...input });
      if (!located) fail("workspace-invalid");
      const workspace = located.workspace;
      if (Object.hasOwn(service.SETUP_OPERATIONS, action))
        return service.SETUP_OPERATIONS[action]({ workspace, ...input });
      if (Object.hasOwn(service.ENROLLMENT_OPERATIONS, action))
        return service.ENROLLMENT_OPERATIONS[action]({ workspace, ...input });
      if (Object.hasOwn(service.APPEARANCE_OPERATIONS, action))
        return service.APPEARANCE_OPERATIONS[action]({ workspace, ...input });
      if (action === "review") {
        if (input.discoveryId !== undefined) fail("gui-invalid-request");
        return service.reviewUserSource({ workspace, ...input });
      }
      if (action === "plan")
        return service.planUserMode({ workspace, ...input });
      if (action === "plan-retained")
        return service.planUserRetainedSettings({ workspace });
      if (action === "accept-retained")
        return service.acceptUserRetainedSettings({ workspace, ...input });
      if (action === "apply")
        return service.applyUserPlan({ workspace, ...input });
      if (action === "save") {
        const current = await service.userSourceState({ workspace });
        return service.saveUserFavorite({
          workspace,
          name:
            input.name?.trim() ||
            `${current.preparedMode} · ${current.revision}`,
        });
      }
      if (action === "favorites")
        return service.listUserFavorites({ workspace, ...input });
      if (action === "favorite")
        return service.planUserFavorite({ workspace, ...input });
      if (action === "checkpoint")
        return service.planUserCheckpoint({ workspace, ...input });
      if (action === "recover")
        return service.recoverUserSources({ workspace });
      if (action === "observe")
        return service.observeUserTask({ workspace, taskId: input.taskId });
      if (action === "review-run")
        return service.reviewUserRun({ workspace, ...input });
      if (action === "save-run")
        return service.saveUserRun({ workspace, ...input });
      if (action === "runs")
        return service.listUserRuns({ workspace, ...input });
      if (action === "run")
        return service.readUserRun({ workspace, ...input });
      if (action === "run-output")
        return service.readUserRunOutput({ workspace, ...input });
      if (action === "compare-runs")
        return service.compareUserRuns({ workspace, ...input });
      if (action === "run-favorite")
        return service.saveUserRunFavorite({ workspace, ...input });
      if (action === "review-start") return service.reviewUserStart({ workspace, ...input });
      if (action === "save-start") return service.saveUserStart({ workspace, ...input });
      if (action === "start") return service.readUserStart({ workspace, ...input });
      if (action === "starts") return service.listUserStarts({ workspace, ...input });
      if (action === "review-replay") return service.reviewUserReplay({ workspace, ...input });
      if (action === "prepare-replay") return service.prepareUserReplay({ workspace, ...input });
      if (action === "handoff-replay") return service.handoffUserReplay({ workspace, ...input });
      if (action === "replay") return service.readUserReplay({ workspace, ...input });
      if (action === "replays") return service.listUserReplays({ workspace, ...input });
      if (action === "cancel-replay") return service.cancelUserReplay({ workspace, ...input });
      if (action === "observe-replay") return service.observeUserReplay({ workspace, ...input });
      if (action === "save-replay-result") return service.saveUserReplayResult({ workspace, ...input });
      if (action === "replay-result") return service.readUserReplayResult({ workspace, ...input });
      if (action === "open-replay") return service.openUserReplay({ workspace, ...input });
      if (action === "compare-replays") return service.compareUserReplayResults({ workspace, ...input });
      if (action === "replay-favorite") return service.saveUserReplayFavorite({ workspace, ...input });
      fail("gui-invalid-request");
    },
  };
}
