import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

function controllerView({
  revision = 3,
  launchId = "launch",
  scopeId = "b".repeat(64),
  activeNormalId = "d".repeat(64),
  conflict = null,
  pending = false,
} = {}) {
  return {
    metadata: {
      kind: "user-sources",
      launchId,
      contextId: "a".repeat(64),
      context: {
        codexHome: "/codex",
        project: "/project",
        executable: "/codex/bin",
      },
      workspace: "/workspace",
    },
    source: {
      context: {
        codexHome: "/codex",
        project: "/project",
        executable: "/codex/bin",
      },
      registration: {
        scopeId,
        normalId: "c".repeat(64),
        activeNormalId,
        sources: [],
      },
      preparedMode: "normal",
      revision,
      preparation: null,
      observation: null,
      observationIssue: null,
      conflict,
      recovery: { pending, lastCheckpointId: null, argv: [] },
      verification: {
        runtimeStateVerified: false,
        modeSwitchingVerified: false,
        sourceCoverage: "unknown",
        nextTaskRequired: true,
      },
    },
    guide: {
      id: "guide",
      text: "guide",
      digest: "e".repeat(64),
      reviewedOn: "2026-09-08",
      references: [],
    },
  };
}

function controllerState(view, { confirmed = true } = {}) {
  return {
    view,
    confirmed,
    plan: null,
    retainedPlan: null,
    favorites: [],
    cursor: null,
    error: "",
    notice: "状態を確認しました。",
  };
}

function sourcePlan(view, overrides = {}) {
  return {
    planId: "1".repeat(64),
    scopeId: view.source.registration.scopeId,
    mode: "unseal",
    preparedMode: "unseal",
    revision: view.source.revision,
    selectedIds: [],
    changedFiles: [],
    skillStates: [],
    guide: null,
    adaptation: null,
    retained: [],
    verification: view.source.verification,
    ...overrides,
  };
}

function retainedPlan(view, overrides = {}) {
  return {
    planId: "2".repeat(64),
    scopeId: view.source.registration.scopeId,
    revision: view.source.revision,
    preparedMode: view.source.preparedMode,
    previousNormalId: view.source.registration.activeNormalId,
    normalId: "f".repeat(64),
    managedFilesChanged: 0,
    changedCategories: ["Codex settings"],
    retained: [],
    verification: view.source.verification,
    ...overrides,
  };
}

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
    assert.ok(
      rendered.includes(
        "この計画で準備したあとに保存すると新しいお気に入り版になります",
      ),
    );
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

test("controller clears both cached plans after context, scope, revision, or active Normal changes", async () => {
  const { sourceControllerReducer } = await import(
    "../web/src/source-controller-state.ts"
  );
  const metadata = {
    kind: "user-sources",
    launchId: "launch",
    contextId: "a".repeat(64),
    context: { codexHome: "/codex", project: "/project", executable: "/codex/bin" },
    workspace: "/workspace",
  };
  const view = {
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
  const cached = {
    view,
    confirmed: true,
    plan: { planId: "plan" },
    retainedPlan: { planId: "retained-plan" },
    favorites: [{ favoriteId: "favorite" }],
    cursor: "cursor",
    error: "",
    notice: "変更内容を確認しました。",
  };
  const unchanged = sourceControllerReducer(cached, {
    type: "accept-view",
    view: structuredClone(view),
  });
  assert.equal(unchanged.plan, cached.plan);
  assert.equal(unchanged.retainedPlan, cached.retainedPlan);
  for (const mutate of [
    (next) => (next.metadata.launchId = "next-launch"),
    (next) => (next.source.registration.scopeId = "e".repeat(64)),
    (next) => (next.source.revision += 1),
    (next) => (next.source.registration.activeNormalId = "f".repeat(64)),
  ]) {
    const next = structuredClone(view);
    mutate(next);
    const accepted = sourceControllerReducer(cached, {
      type: "accept-view",
      view: next,
    });
    assert.equal(accepted.view, next);
    assert.equal(accepted.confirmed, true);
    assert.equal(accepted.plan, null);
    assert.equal(accepted.retainedPlan, null);
  }
});

test("controller atomically admits source and retained plans only in their valid response context", async () => {
  const { sourceControllerReducer } = await import(
    "../web/src/source-controller-state.ts"
  );
  const normalView = controllerView();
  const planned = sourcePlan(normalView);
  const sourceAccepted = sourceControllerReducer(controllerState(normalView), {
    type: "plan-response",
    response: { status: "completed", state: structuredClone(normalView), result: planned },
  });
  assert.equal(sourceAccepted.plan, planned);
  assert.equal(sourceAccepted.retainedPlan, null);
  assert.equal(sourceAccepted.confirmed, true);

  const conflictView = controllerView({ conflict: { kind: "source-conflict" } });
  const retained = retainedPlan(conflictView);
  const retainedAccepted = sourceControllerReducer(controllerState(conflictView), {
    type: "retained-plan-response",
    response: { status: "completed", state: structuredClone(conflictView), result: retained },
  });
  assert.equal(retainedAccepted.plan, null);
  assert.equal(retainedAccepted.retainedPlan, retained);
  assert.notEqual(
    retained.previousNormalId,
    retained.normalId,
    "the applicable Normal is the previous ID; the target ID is new",
  );
});

test("controller rejects plan results when the returned state is newer, foreign, pending, or no longer confirmed", async (t) => {
  const { sourceControllerReducer } = await import(
    "../web/src/source-controller-state.ts"
  );
  const definitions = [
    {
      name: "source plan",
      action: "plan-response",
      view: controllerView(),
      makePlan: sourcePlan,
      key: "plan",
    },
    {
      name: "retained plan",
      action: "retained-plan-response",
      view: controllerView({ conflict: { kind: "source-conflict" } }),
      makePlan: retainedPlan,
      key: "retainedPlan",
    },
  ];
  for (const definition of definitions) {
    await t.test(definition.name, () => {
      const stalePlan = definition.makePlan(definition.view);
      const newer = structuredClone(definition.view);
      newer.source.revision += 1;
      newer.source.registration.activeNormalId = "9".repeat(64);
      const stale = sourceControllerReducer(controllerState(definition.view), {
        type: definition.action,
        response: { status: "completed", state: newer, result: stalePlan },
      });
      assert.equal(stale.view, newer);
      assert.equal(stale.confirmed, true);
      assert.equal(stale[definition.key], null);
      assert.match(stale.notice, /状態が変わりました|もう一度確認/);

      const nextLaunch = controllerView({
        launchId: "next-launch",
        conflict: definition.view.source.conflict,
      });
      const launchChanged = sourceControllerReducer(controllerState(definition.view), {
        type: definition.action,
        response: {
          status: "completed",
          state: nextLaunch,
          result: definition.makePlan(nextLaunch),
        },
      });
      assert.equal(launchChanged[definition.key], null);

      const nextNormal = controllerView({
        activeNormalId: "7".repeat(64),
        conflict: definition.view.source.conflict,
      });
      const normalChanged = sourceControllerReducer(controllerState(definition.view), {
        type: definition.action,
        response: {
          status: "completed",
          state: nextNormal,
          result: definition.makePlan(nextNormal),
        },
      });
      assert.equal(normalChanged[definition.key], null);

      const pending = controllerView({
        conflict: definition.view.source.conflict,
        pending: true,
      });
      const pendingResult = sourceControllerReducer(controllerState(pending), {
        type: definition.action,
        response: {
          status: "completed",
          state: structuredClone(pending),
          result: definition.makePlan(pending),
        },
      });
      assert.equal(pendingResult[definition.key], null);

      const foreign = definition.makePlan(definition.view, {
        scopeId: "8".repeat(64),
      });
      const foreignResult = sourceControllerReducer(controllerState(definition.view), {
        type: definition.action,
        response: {
          status: "completed",
          state: structuredClone(definition.view),
          result: foreign,
        },
      });
      assert.equal(foreignResult[definition.key], null);

      const unconfirmed = sourceControllerReducer(
        controllerState(definition.view, { confirmed: false }),
        {
          type: definition.action,
          response: {
            status: "completed",
            state: structuredClone(definition.view),
            result: definition.makePlan(definition.view),
          },
        },
      );
      assert.equal(unconfirmed[definition.key], null);
    });
  }
});

test("post-accept favorites adopts completed and context-updated state before list handling", async () => {
  const { sourceControllerReducer } = await import(
    "../web/src/source-controller-state.ts"
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
  const view = {
    metadata,
    source: {
      registration: {
        scopeId: "b".repeat(64),
        normalId: "c".repeat(64),
        activeNormalId: "d".repeat(64),
        sources: [],
      },
      revision: 3,
    },
  };
  const cached = {
    view,
    confirmed: true,
    plan: { planId: "plan" },
    retainedPlan: { planId: "retained-plan" },
    favorites: [{ favoriteId: "old" }],
    cursor: "old-cursor",
    error: "",
    notice: "現在のCodex設定を記録しました。",
  };
  const completedView = structuredClone(view);
  completedView.source.revision += 1;
  const favorite = { favoriteId: "new" };
  const completed = sourceControllerReducer(cached, {
    type: "favorites-followup",
    response: {
      status: "completed",
      state: completedView,
      result: { favorites: [favorite], nextCursor: "next" },
    },
  });
  assert.equal(completed.view, completedView);
  assert.equal(completed.plan, null);
  assert.equal(completed.retainedPlan, null);
  assert.deepEqual(completed.favorites, [favorite]);
  assert.equal(completed.cursor, "next");

  const changedView = structuredClone(view);
  changedView.metadata.launchId = "new-launch";
  changedView.metadata.contextId = "e".repeat(64);
  changedView.source.registration.activeNormalId = "f".repeat(64);
  const changed = sourceControllerReducer(cached, {
    type: "favorites-followup",
    response: { status: "context-updated", state: changedView },
  });
  assert.equal(changed.view, changedView);
  assert.equal(changed.confirmed, true);
  assert.equal(changed.plan, null);
  assert.equal(changed.retainedPlan, null);
  assert.deepEqual(changed.favorites, []);
  assert.equal(changed.cursor, null);
  assert.match(changed.notice, /接続先が変わりました/);
});

test("a later rejected or uncertain action replaces the previous success notice", async () => {
  const { ApiError } = await import("../web/src/api.ts");
  const { sourceControllerReducer } = await import(
    "../web/src/source-controller-state.ts"
  );
  const reviewed = {
    view: null,
    confirmed: true,
    plan: null,
    retainedPlan: { planId: "retained-plan" },
    favorites: [],
    cursor: null,
    error: "",
    notice: "変更内容を確認しました。まだ設定は記録していません。",
  };
  for (const error of [
    new ApiError("source-conflict"),
    new ApiError("connection-lost", undefined, "uncertain"),
  ]) {
    const failed = sourceControllerReducer(reviewed, {
      type: "failed",
      error,
    });
    assert.equal(failed.confirmed, false);
    assert.notEqual(failed.notice, reviewed.notice);
    assert.equal(failed.notice, failed.error);
    assert.match(failed.notice, /完了できませんでした|結果は未確認/);
  }
});
