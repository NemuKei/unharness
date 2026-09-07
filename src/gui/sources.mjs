import { createHash, randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import * as service from "../sources/service.mjs";
import { getMinimalGuide } from "../sources/guide.mjs";

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
  apply: [["planId"], []],
  save: [[], ["name"]],
  favorites: [[], ["after"]],
  favorite: [["favoriteId"], []],
  checkpoint: [["checkpointId"], []],
  recover: [[], []],
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
  ])
    if (Object.hasOwn(input, key) && !id(input[key]))
      fail("gui-invalid-request");
  if (Object.hasOwn(input, "sourceId") && !sourceId(input.sourceId))
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
    Object.hasOwn(input, "mode") &&
    !["normal", "unseal", "trueform"].includes(input.mode)
  )
    fail("gui-invalid-request");
  return { requestId, input: { launchId, contextId, ...input } };
}

export async function createSourceController(context) {
  // The service locator validates canonical roots without native discovery.
  context = { ...context, executable: context.executable ?? "codex" };
  let located = await service.locateUserSources({ context });
  const launchId = randomUUID();
  const roots = [context.codexHome, context.project];
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
    const contextId = createHash("sha256")
      .update(JSON.stringify({ context, workspace }))
      .digest("hex");
    return { kind: "user-sources", launchId, contextId, context, workspace };
  }
  async function state() {
    const meta = await metadata();
    return {
      metadata: meta,
      source: located
        ? await service.userSourceState({ workspace: located.workspace })
        : null,
      guide: getMinimalGuide(),
    };
  }
  return {
    metadata,
    state,
    async execute(
      action,
      { launchId: acceptedLaunch, contextId: acceptedContext, ...input },
    ) {
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
      if (action === "review") {
        if (input.discoveryId !== undefined) fail("gui-invalid-request");
        return service.reviewUserSource({ workspace, ...input });
      }
      if (action === "plan")
        return service.planUserMode({ workspace, ...input });
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
      fail("gui-invalid-request");
    },
  };
}
