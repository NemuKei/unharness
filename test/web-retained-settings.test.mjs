import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

test("retained review renders private-record-only disclosure and explicit acceptance", async (t) => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const { RetainedReview } = await vite.ssrLoadModule(
    "/src/components/RetainedReview.tsx",
  );
  const rendered = renderToStaticMarkup(
    createElement(RetainedReview, {
      plan: {
        planId: "a".repeat(64),
        scopeId: "b".repeat(64),
        revision: 4,
        preparedMode: "unseal",
        previousNormalId: "c".repeat(64),
        normalId: "d".repeat(64),
        managedFilesChanged: 0,
        changedCategories: ["Codex settings"],
        retained: ["memory and task continuity"],
        verification: {
          runtimeStateVerified: false,
          modeSwitchingVerified: false,
          sourceCoverage: "unknown",
          nextTaskRequired: true,
        },
      },
      disabled: false,
      onAccept() {},
    }),
  );
  assert.ok(rendered.includes("現在の設定を引き継ぐ"));
  assert.ok(rendered.includes("管理対象ファイルは変更しません"));
  assert.ok(rendered.includes("選択した指示・Skillは登録済みの内容を維持"));
  assert.ok(rendered.includes("古い保存版はそのまま残ります"));
  assert.ok(rendered.includes("Codex settings"));
  assert.ok(!rendered.includes("memory and task continuity"));
});

test("adapted favorite and checkpoint reviews name current common settings and a new favorite version", async (t) => {
  const vite = await createServer({
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });
  t.after(() => vite.close());
  const { RestoreAdaptationNotice } = await vite.ssrLoadModule(
    "/src/components/RetainedReview.tsx",
  );
  for (const [sourceType, label] of [
    ["favorite", "お気に入り"],
    ["checkpoint", "復帰点"],
  ]) {
    const rendered = renderToStaticMarkup(
      createElement(RestoreAdaptationNotice, {
        adaptation: {
          kind: "retained-settings",
          sourceType,
          sourceId: "e".repeat(64),
          previousNormalId: "f".repeat(64),
          normalId: "0".repeat(64),
        },
      }),
    );
    assert.ok(rendered.includes("現在の共通設定を維持して準備"));
    assert.ok(rendered.includes(label));
    assert.ok(rendered.includes("保存すると新しいお気に入り版になります"));
  }
});

test("an uncertain retained acceptance is sent once with only the accepted context and plan", async () => {
  const { ApiError } = await import("../web/src/api.ts");
  const { sourceOperation } = await import(
    "../web/src/source-operations.ts"
  );
  const metadata = {
    kind: "user-sources",
    launchId: "launch",
    contextId: "a".repeat(64),
    context: {
      codexHome: "/codex",
      project: "/project",
      executable: "/codex/bin",
    },
    workspace: "/workspace",
  };
  const posts = [];
  const api = {
    async connect() {},
    async get(route) {
      assert.equal(route, "/sources/metadata");
      return metadata;
    },
    async post(route, body) {
      posts.push({ route, body });
      throw new ApiError("connection-lost", undefined, "uncertain");
    },
  };
  await assert.rejects(
    sourceOperation(api, metadata, "accept-retained", {
      planId: "b".repeat(64),
    }),
    { kind: "connection-lost", disposition: "uncertain" },
  );
  assert.deepEqual(posts, [
    {
      route: "/sources/accept-retained",
      body: {
        planId: "b".repeat(64),
        launchId: metadata.launchId,
        contextId: metadata.contextId,
      },
    },
  ]);
});

test("cached plans are stale after context, scope, revision, or active Normal changes", async () => {
  const { sameSourcePlanContext } = await import(
    "../web/src/source-operations.ts"
  );
  const metadata = {
    kind: "user-sources",
    launchId: "launch",
    contextId: "a".repeat(64),
    context: { codexHome: "/codex", project: "/project", executable: "/codex/bin" },
    workspace: "/workspace",
  };
  const state = {
    metadata,
    source: {
      registration: {
        scopeId: "b".repeat(64),
        normalId: "c".repeat(64),
        activeNormalId: "d".repeat(64),
        sources: [],
      },
      revision: 2,
    },
  };
  assert.equal(sameSourcePlanContext(state, structuredClone(state)), true);
  for (const mutate of [
    (next) => (next.metadata.launchId = "next-launch"),
    (next) => (next.source.registration.scopeId = "e".repeat(64)),
    (next) => (next.source.revision += 1),
    (next) => (next.source.registration.activeNormalId = "f".repeat(64)),
  ]) {
    const next = structuredClone(state);
    mutate(next);
    assert.equal(sameSourcePlanContext(state, next), false);
  }
});
