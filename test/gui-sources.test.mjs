import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  realpath,
  rm,
  mkdir,
  writeFile,
  copyFile,
  chmod,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startGuiServer } from "../src/gui/server.mjs";
import { guiMain } from "../src/gui/cli.mjs";
import { createDemoWorkspace } from "../src/gui/controller.mjs";
import {
  createOwnedSourceProfile,
  readSourceProfileFiles,
} from "../src/sources/owned-profile.mjs";

async function setup(t, fixture = false) {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "unharness-source-http-")),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const executable = join(parent, "synthetic-codex.mjs");
  await copyFile(resolve("test-support/user-source-server.mjs"), executable);
  await chmod(executable, 0o700);
  const profile = await createOwnedSourceProfile({ parent, executable });
  const assetsDirectory = join(parent, "dist");
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, "index.html"), "<!doctype html>");
  const options = fixture
    ? { ...(await createDemoWorkspace({ parent })), inventory: { cwd: profile.context.project, executable: profile.context.executable } }
    : { manageSources: profile.context };
  const running = await startGuiServer({ ...options, assetsDirectory });
  t.after(() => running.close());
  const headers = { "X-Unharness-Client": "1", Origin: running.url };
  const request = async (path, body) => {
    const response = await fetch(running.url + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        ...headers,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  const bootstrap = await request("/bootstrap");
  headers["X-Unharness-Token"] = bootstrap.data.token;
  const metadata = fixture ? null : (await request("/sources/metadata")).data;
  const post = (action, input = {}, requestId = randomUUID()) =>
    request("/sources/" + action, {
      requestId,
      launchId: metadata?.launchId,
      contextId: metadata?.contextId,
      ...input,
    });
  return {
    profile,
    request,
    post,
    metadata,
    bootstrap,
    assetsDirectory,
    parent,
    url: running.url,
  };
}

test(
  "source management launch is isolated and binds registration to reviewed discovery and context",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const s = await setup(t);
    assert.equal(s.bootstrap.data.kind, "user-sources");
    assert.equal((await s.request("/state")).status, 404);
    assert.equal((await s.request("/sources/state")).data.source, null);
    assert.equal(
      (
        await s.post("register", {
          discoveryId: "a".repeat(64),
          instructionsOptional: true,
          selectedSkillIds: [],
          userAddedOptional: true,
          path: "/foreign",
        })
      ).status,
      400,
    );
    assert.equal(
      (await s.post("discover", { contextId: "foreign" })).data.error.kind,
      "gui-source-context-changed",
    );
    const discovery = (await s.post("discover")).data.result;
    assert.ok(discovery.discoveryId);
    assert.ok(
      !JSON.stringify(discovery).includes("User optional instructions"),
    );
    assert.equal(
      (
        await s.post("review", {
          sourceId: "f".repeat(64),
          discoveryId: discovery.discoveryId,
        })
      ).status,
      400,
    );
    const review = (
      await s.post("review", {
        sourceId: discovery.instructions.id,
        discoveryId: discovery.discoveryId,
      })
    ).data.result;
    assert.equal(typeof review.text, "string");
    const body = {
      discoveryId: discovery.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: discovery.skills
        .filter((x) => x.eligible)
        .map((x) => x.id),
      userAddedOptional: true,
    };
    assert.equal(
      (await s.post("register", { ...body, userAddedOptional: false })).data
        .error.kind,
      "optional-role-required",
    );
    const registration = await s.post("register", body);
    assert.equal(registration.status, 200, JSON.stringify(registration));
    assert.ok(registration.data.state.source.registration.normalId);
    assert.equal(
      registration.data.state.source.verification.runtimeStateVerified,
      false,
    );
    // Registering changes the accepted workspace; a stale browser must acknowledge it.
    assert.equal(
      (await s.post("plan", { mode: "unseal" })).data.error.kind,
      "gui-source-context-changed",
    );
    Object.assign(s.metadata, (await s.request("/sources/metadata")).data);
    const before = await readSourceProfileFiles(s.profile.context);
    for (const mode of ["unseal", "trueform", "normal"]) {
      const plan = (await s.post("plan", { mode })).data.result;
      const id = randomUUID();
      const applied = await s.post("apply", { planId: plan.planId }, id);
      assert.equal(applied.status, 200, JSON.stringify(applied));
      assert.equal(applied.data.state.source.preparedMode, mode);
      assert.deepEqual(
        await s.post("apply", { planId: plan.planId }, id),
        applied,
      );
      assert.equal(
        (await s.post("apply", { planId: "f".repeat(64) }, id)).data.error.kind,
        "gui-request-id-reused",
      );
    }
    assert.deepEqual(await readSourceProfileFiles(s.profile.context), before);
    const saved = (await s.post("save", { name: "" })).data.result;
    assert.equal(saved.preparedMode, "normal");
    const favoritePlan = (
      await s.post("favorite", { favoriteId: saved.favoriteId })
    ).data.result;
    assert.equal(favoritePlan.mode, "favorite");
    assert.equal(favoritePlan.preparedMode, "normal");
    assert.equal(
      (await s.post("apply", { planId: favoritePlan.planId })).status,
      200,
    );
    const state = (await s.request("/sources/state")).data;
    const undo = (
      await s.post("checkpoint", {
        checkpointId: state.source.recovery.lastCheckpointId,
      })
    ).data.result;
    assert.equal((await s.post("apply", { planId: undo.planId })).status, 200);
    assert.equal(
      (await s.post("recover")).data.result.status,
      "nothing-pending",
    );
  },
);

test("old fixture and optional read-only launches cannot reach source management routes", async (t) => {
  const s = await setup(t, true);
  for (const action of ["register", "apply", "discover"])
    assert.equal((await s.post(action)).status, 404);
  assert.equal((await s.request("/sources/metadata")).status, 404);
  assert.equal(
    (await s.request("/state")).data.controlScope,
    "owned-fixture-only",
  );
});

test("explicit management CLI accepts one context and emits resumable arguments without creating a fixture", async (t) => {
  const s = await setup(t);
  let summary;
  const argv = [
    "gui",
    "--manage-sources",
    "--codex-home",
    s.profile.context.codexHome,
    "--project",
    s.profile.context.project,
    "--codex",
    s.profile.context.executable,
  ];
  let running;
  const code = await guiMain(argv, {
    assetsDirectory: s.assetsDirectory,
    createDemo: () => assert.fail("no fixture"),
    createController: () => assert.fail("no fixture"),
    startServer: async (options) => {
      running = await startGuiServer(options);
      return running;
    },
    stdout: {
      write: (value) => {
        summary = JSON.parse(value);
      },
    },
    stderr: { write: (value) => assert.fail(value) },
  });
  t.after(() => running?.close());
  assert.equal(code, 0);
  assert.equal(summary.kind, "user-sources");
  assert.deepEqual(summary.resumeArgv.slice(1), argv);
});

test(
  "source HTTP guards auth, payload limits, foreign source IDs and offline reopening",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const s = await setup(t);
    const unauth = await fetch(s.url + "/api/sources/state");
    assert.equal(unauth.status, 403);
    const hostile = await fetch(s.url + "/api/sources/state", {
      headers: { "X-Unharness-Client": "1", Origin: "https://foreign.example" },
    });
    assert.equal(hostile.status, 403);
    const d = (await s.post("discover")).data.result;
    const register = await s.post("register", {
      discoveryId: d.discoveryId,
      instructionsOptional: true,
      selectedSkillIds: [],
      userAddedOptional: true,
    });
    assert.equal(register.status, 200);
    Object.assign(s.metadata, register.data.state.metadata);
    assert.equal(
      (await s.post("review", { sourceId: "instructions-" + "f".repeat(64) }))
        .status,
      400,
    );
    assert.equal(
      (await s.post("apply", { planId: "f".repeat(64), workspace: "/foreign" }))
        .status,
      400,
    );
    assert.equal(
      (await s.post("save", { name: "x".repeat(18000) })).status,
      413,
    );
    const { createSourceController } = await import("../src/gui/sources.mjs");
    await rename(
      s.profile.context.executable,
      s.profile.context.executable + ".unavailable",
    );
    assert.equal(
      (await s.post("discover")).data.error.kind,
      "discovery-failed",
    );
    const normal = (await s.post("plan", { mode: "normal" })).data.result;
    assert.equal(
      (await s.post("apply", { planId: normal.planId })).status,
      200,
    );
    assert.equal((await s.post("save")).status, 200);
    const reopened = await createSourceController(s.profile.context);
    assert.equal(
      (await reopened.state()).source.registration.normalId,
      register.data.state.source.registration.normalId,
    );
    assert.notEqual((await reopened.metadata()).launchId, s.metadata.launchId);
    await assert.rejects(
      reopened.execute("plan", {
        launchId: s.metadata.launchId,
        contextId: s.metadata.contextId,
        mode: "normal",
      }),
      { kind: "gui-source-context-changed" },
    );
  },
);

test("replaced source context directory is rejected before management", async (t) => {
  const s = await setup(t);
  await rename(
    s.profile.context.project,
    s.profile.context.project + "-previous",
  );
  await mkdir(s.profile.context.project);
  assert.equal(
    (await s.request("/sources/metadata")).data.error.kind,
    "gui-source-context-changed",
  );
  assert.equal(
    (await s.post("discover")).data.error.kind,
    "gui-source-context-changed",
  );
});
