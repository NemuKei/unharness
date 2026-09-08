import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { startGuiServer } from "../src/gui/server.mjs";
import * as service from "../src/sources/service.mjs";
import { createOwnedSourceProfile } from "../src/sources/owned-profile.mjs";

const assessment = {
  outcome: "accepted",
  provenance: "user",
  requirements: [
    { id: "usable", label: "回答を利用できる", critical: true, result: "pass" },
  ],
  ratings: [
    {
      id: "clarity",
      label: "明瞭さ",
      score: 4,
      lowAnchor: "判断できない",
      highAnchor: "そのまま使える",
      reason: "必要事項を確認できた",
    },
  ],
  note: "後から記録した評価",
};

async function setupHttp(t) {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "unharness-comparison-http-")),
  );
  t.after(() => rm(parent, { recursive: true, force: true }));
  const executable = join(parent, "synthetic-codex.mjs");
  await copyFile(resolve("test-support/user-source-server.mjs"), executable);
  await chmod(executable, 0o700);
  const profile = await createOwnedSourceProfile({ parent, executable });
  const discovery = await service.discoverUserSources(profile.context);
  const registered = await service.registerUserSources({
    context: profile.context,
    discoveryId: discovery.discoveryId,
    instructionsOptional: true,
    selectedSkillIds: [],
    userAddedOptional: true,
  });
  const assetsDirectory = join(parent, "dist");
  await mkdir(assetsDirectory);
  await writeFile(join(assetsDirectory, "index.html"), "<!doctype html>");
  const running = await startGuiServer({
    manageSources: profile.context,
    assetsDirectory,
  });
  t.after(() => running.close());
  const headers = { "X-Unharness-Client": "1", Origin: running.url };
  async function request(path, body, raw = false) {
    const response = await fetch(running.url + "/api" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...headers,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body:
        body === undefined ? undefined : raw ? body : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  const bootstrap = await request("/bootstrap");
  headers["X-Unharness-Token"] = bootstrap.data.token;
  const metadata = (await request("/sources/metadata")).data;
  const post = (action, input = {}, requestId = randomUUID()) =>
    request("/sources/" + action, {
      requestId,
      launchId: metadata.launchId,
      contextId: metadata.contextId,
      ...input,
    });
  return { profile, registered, request, post, metadata };
}

async function writeRecording(s) {
  const taskId = randomUUID();
  const timestamp = new Date().toISOString();
  const usage = {
    total_tokens: 100,
    input_tokens: 80,
    cached_input_tokens: 20,
    cache_write_input_tokens: 0,
    output_tokens: 20,
    reasoning_output_tokens: 5,
  };
  const records = [
    {
      type: "session_meta",
      payload: {
        id: taskId,
        timestamp,
        cwd: s.profile.context.project,
        originator: "Codex Desktop",
        thread_source: "user",
        cli_version: "0.153.4",
      },
    },
    {
      type: "event_msg",
      timestamp,
      payload: { type: "task_started", turn_id: "turn-1" },
    },
    {
      type: "turn_context",
      timestamp,
      payload: {
        cwd: s.profile.context.project,
        turn_id: "turn-1",
        model: "synthetic-model",
        effort: "high",
      },
    },
    {
      type: "world_state",
      payload: {
        full: true,
        state: {
          agents_md: {
            directory: s.profile.context.project,
            text: s.profile.originalFiles.instructions.text.trim(),
          },
          host_skills: {
            includeInstructions: true,
            body: "### Available skills\n",
          },
        },
      },
    },
    {
      type: "token_usage_record",
      timestamp,
      payload: {
        thread_id: taskId,
        session_id: taskId,
        root_turn_id: "turn-1",
        turn_id: "turn-1",
        response_id: "response-1",
        usage,
        turn_token_usage: usage,
        thread_token_usage: usage,
      },
    },
    {
      type: "event_msg",
      timestamp,
      payload: {
        type: "task_complete",
        turn_id: "turn-1",
        duration_ms: 1200,
        time_to_first_token_ms: 120,
        last_agent_message: "PRIVATE SYNTHETIC ANSWER",
      },
    },
  ];
  const directory = join(s.profile.context.codexHome, "sessions");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `rollout-${taskId}.jsonl`),
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  return taskId;
}

test(
  "comparison HTTP actions keep output private, deduplicate writes, and preserve source state",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const s = await setupHttp(t);
    const taskId = await writeRecording(s);
    const stateBefore = (await s.request("/sources/state")).data.source;

    const review = await s.post("review-run", { taskId });
    assert.equal(review.status, 200, JSON.stringify(review));
    assert.equal(review.data.result.measurementKind, "observational");
    assert.equal(
      JSON.stringify(review.data).includes("PRIVATE SYNTHETIC ANSWER"),
      false,
    );

    const saveRequestId = randomUUID();
    const saveBody = {
      reviewId: review.data.result.reviewId,
      title: "通常利用の記録",
      assessment,
    };
    const saved = await s.post("save-run", saveBody, saveRequestId);
    assert.equal(saved.status, 200, JSON.stringify(saved));
    assert.deepEqual(await s.post("save-run", saveBody, saveRequestId), saved);
    assert.equal(
      (await s.post("save-run", { ...saveBody, title: "別名" }, saveRequestId))
        .data.error.kind,
      "gui-request-id-reused",
    );

    const correction = await s.post("save-run", {
      ...saveBody,
      previousRunId: saved.data.result.runId,
      assessment: { ...assessment, provenance: "agent" },
    });
    assert.equal(correction.data.result.previousRunId, saved.data.result.runId);
    const history = await s.post("runs");
    assert.equal(history.data.result.runs.length, 2);
    const read = await s.post("run", { runId: saved.data.result.runId });
    assert.equal(read.data.result.runId, saved.data.result.runId);
    assert.equal(
      JSON.stringify(read.data).includes("PRIVATE SYNTHETIC ANSWER"),
      false,
    );
    const compare = await s.post("compare-runs", {
      runIds: [saved.data.result.runId],
    });
    assert.equal(compare.data.result.assessment, "neutral");
    assert.equal(compare.data.result.creationEligible, false);
    const output = await s.post("run-output", {
      runId: saved.data.result.runId,
    });
    assert.equal(output.data.result.text, "PRIVATE SYNTHETIC ANSWER");

    const plan = await s.post("plan", { mode: "unseal" });
    const applied = await s.post("apply", { planId: plan.data.result.planId });
    assert.equal(applied.data.state.source.preparedMode, "unseal");
    const beforeFavorite = applied.data.state.source;
    const favorite = await s.post("run-favorite", {
      runId: saved.data.result.runId,
      name: "履歴のNormal",
    });
    assert.equal(favorite.data.result.preparedMode, "normal");
    assert.equal(
      favorite.data.result.comparisonRunId,
      saved.data.result.runId,
    );
    assert.equal(favorite.data.state.source.revision, beforeFavorite.revision);
    assert.equal(
      (await s.request("/sources/state")).data.source.revision,
      beforeFavorite.revision,
    );
    assert.equal(stateBefore.registration.scopeId, beforeFavorite.registration.scopeId);
  },
);

test(
  "comparison HTTP rejects duplicate JSON keys and browser-supplied source identities",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const s = await setupHttp(t);
    const taskId = await writeRecording(s);
    const raw = JSON.stringify({
      requestId: randomUUID(),
      launchId: s.metadata.launchId,
      contextId: s.metadata.contextId,
      taskId,
    }).replace(`"taskId":"${taskId}"`, `"taskId":"${taskId}","taskId":"${randomUUID()}"`);
    const duplicate = await s.request("/sources/review-run", raw, true);
    assert.equal(duplicate.status, 400);
    assert.equal(duplicate.data.error.kind, "gui-invalid-request");
    for (const field of ["workspace", "path", "mode", "measurement", "source"]) {
      const rejected = await s.post("review-run", { taskId, [field]: "PRIVATE" });
      assert.equal(rejected.status, 400, field);
      assert.equal(rejected.data.error.kind, "gui-invalid-request", field);
    }
  },
);

function sourceView({
  launchId = "launch-a",
  contextId = "a".repeat(64),
  workspace = "/workspace",
  scopeId = "b".repeat(64),
  revision = 1,
  preparedMode = "normal",
  activeNormalId = "c".repeat(64),
} = {}) {
  return {
    metadata: {
      kind: "user-sources",
      launchId,
      contextId,
      workspace,
      context: {
        codexHome: "/codex",
        project: "/project",
        executable: "/codex/bin",
      },
    },
    source: {
      registration: {
        scopeId,
        normalId: activeNormalId,
        activeNormalId,
        sources: [],
      },
      revision,
      preparedMode,
    },
  };
}

test("comparison controller preserves history across mode changes and rejects stale auxiliary results", async () => {
  const {
    comparisonContextFor,
    comparisonContextKey,
    comparisonControllerReducer,
    initialComparisonControllerState,
  } = await import("../web/src/useComparisonController.ts");
  const initialView = sourceView();
  const context = comparisonContextFor(initialView);
  assert.equal(
    comparisonContextKey(initialView),
    comparisonContextKey(sourceView({ revision: 9, preparedMode: "trueform" })),
  );
  assert.notEqual(
    comparisonContextKey(initialView),
    comparisonContextKey(sourceView({ launchId: "launch-b" })),
  );
  assert.notEqual(
    comparisonContextKey(initialView),
    comparisonContextKey(sourceView({ scopeId: "8".repeat(64) })),
  );
  let state = comparisonControllerReducer(initialComparisonControllerState, {
    type: "source-view",
    view: initialView,
  });
  const review = {
    reviewId: "d".repeat(64),
    measurement: { taskId: randomUUID(), selectedTurnIds: ["turn-1"] },
  };
  state = comparisonControllerReducer(state, {
    type: "review-completed",
    requestContext: context,
    view: initialView,
    review,
  });
  state = comparisonControllerReducer(state, {
    type: "history-completed",
    requestContext: context,
    view: initialView,
    page: { runs: [{ runId: "e".repeat(64) }], nextCursor: null },
    append: false,
  });

  const modeChanged = sourceView({ revision: 2, preparedMode: "unseal" });
  state = comparisonControllerReducer(state, {
    type: "source-view",
    view: modeChanged,
  });
  assert.equal(state.review, review);
  assert.equal(state.runs.length, 1);

  const launchChanged = sourceView({
    launchId: "launch-b",
    contextId: "f".repeat(64),
  });
  state = comparisonControllerReducer(state, {
    type: "source-view",
    view: launchChanged,
  });
  assert.equal(state.review, null);
  assert.deepEqual(state.runs, []);

  state = comparisonControllerReducer(state, {
    type: "review-completed",
    requestContext: context,
    view: initialView,
    review,
  });
  assert.equal(state.review, null, "old launch result is not installed");
  const scopeChanged = sourceView({ scopeId: "9".repeat(64) });
  state = comparisonControllerReducer(state, {
    type: "source-view",
    view: scopeChanged,
  });
  assert.equal(state.context.scopeId, "9".repeat(64));
});

test("comparison controller retains confirmed saves when refresh fails and clears stale output/corrections", async () => {
  const {
    buildSaveRunInput,
    comparisonContextFor,
    comparisonControllerReducer,
    initialComparisonControllerState,
  } = await import("../web/src/useComparisonController.ts");
  const view = sourceView();
  const context = comparisonContextFor(view);
  let state = comparisonControllerReducer(initialComparisonControllerState, {
    type: "source-view",
    view,
  });
  const firstReview = { reviewId: "1".repeat(64), measurement: { taskId: randomUUID() } };
  const secondReview = { reviewId: "2".repeat(64), measurement: { taskId: randomUUID() } };
  const saved = {
    runId: "3".repeat(64),
    reviewId: firstReview.reviewId,
    previousRunId: null,
  };
  assert.deepEqual(
    buildSaveRunInput(
      { review: firstReview, correctionRun: saved },
      { title: "訂正版", assessment },
    ),
    {
      reviewId: firstReview.reviewId,
      previousRunId: saved.runId,
      title: "訂正版",
      assessment,
    },
  );
  state = comparisonControllerReducer(state, {
    type: "review-completed",
    requestContext: context,
    view,
    review: firstReview,
  });
  state = comparisonControllerReducer(state, {
    type: "save-completed",
    requestContext: context,
    view,
    run: saved,
  });
  state = comparisonControllerReducer(state, {
    type: "history-failed",
    message: "一覧を更新できませんでした",
  });
  assert.equal(state.lastSavedRun, saved);
  assert.match(state.error, /一覧/);

  state = comparisonControllerReducer(state, {
    type: "begin-correction",
    run: saved,
  });
  state = comparisonControllerReducer(state, {
    type: "output-completed",
    requestContext: context,
    view,
    output: { runId: saved.runId, available: true, text: "PRIVATE", reason: null },
  });
  state = comparisonControllerReducer(state, {
    type: "review-completed",
    requestContext: context,
    view,
    review: secondReview,
  });
  assert.equal(state.correctionRun, null);
  assert.equal(state.output, null);

  state = comparisonControllerReducer(state, {
    type: "operation-failed",
    operation: "save-run",
    disposition: "uncertain",
    message: "保存結果は未確認です",
  });
  assert.equal(state.uncertainOperation, "save-run");
  assert.equal(state.lastSavedRun, saved);
});

test("comparison chart starts at zero and unknown associations stay unknown", async () => {
  const {
    historicalMode,
    isComparisonMutation,
    reviewCutoffForTask,
    tokenBarPercent,
  } = await import(
    "../web/src/comparisons.ts"
  );
  assert.equal(tokenBarPercent(0, 200), 0);
  assert.equal(tokenBarPercent(100, 200), 50);
  assert.equal(tokenBarPercent(200, 200), 100);
  assert.equal(tokenBarPercent(null, 200), null);
  assert.equal(tokenBarPercent(0, 0), 0);
  assert.equal(historicalMode({ source: { association: null } }), null);
  assert.equal(
    historicalMode({
      source: { association: { preparedMode: "trueform" } },
    }),
    "trueform",
  );
  const reviewedTask = randomUUID();
  assert.equal(
    reviewCutoffForTask(
      { measurement: { taskId: reviewedTask } },
      reviewedTask,
      "turn-2",
    ),
    "turn-2",
  );
  assert.equal(
    reviewCutoffForTask(
      { measurement: { taskId: reviewedTask } },
      randomUUID(),
      "turn-2",
    ),
    undefined,
  );
  assert.deepEqual(
    [
      "review-run",
      "save-run",
      "runs",
      "run",
      "run-output",
      "compare-runs",
      "run-favorite",
    ].filter(isComparisonMutation),
    ["review-run", "save-run", "run-favorite"],
  );
});
