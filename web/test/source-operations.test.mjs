import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

test("task observations render only for the current prepared snapshot", async () => {
  const {
    canObserveTask,
    currentTaskObservation,
    observationIssueText,
    taskObservationLabel,
    taskObservationNotice,
    taskObservationResponseNotice,
    validTaskId,
  } = await import("../src/sources.ts");
  const observation = {
    observationId: "a".repeat(64),
    taskId: "11111111-1111-4111-8111-111111111111",
    scopeId: "b".repeat(64),
    snapshotId: "c".repeat(64),
    preparationId: "d".repeat(32),
    preparedMode: "normal",
    observedAt: "2026-09-08T00:00:00Z",
    status: "matched-record",
    reasons: [],
    sources: [],
    conditions: {
      codexVersion: "0.153.4",
      model: "gpt-5",
      reasoningEffort: "high",
      executionPolicyDigest: null,
      projectInstructionsDigest: null,
      memoryGuidanceRecorded: false,
    },
    verification: {
      runtimeStateVerified: false,
      modeSwitchingVerified: false,
      sourceCoverage: "unknown",
      nextTaskRequired: true,
    },
  };
  const source = {
    preparation: {
      id: observation.preparationId,
      preparedAt: "2026-09-07T23:59:00Z",
    },
    observation,
  };
  assert.equal(currentTaskObservation(source, observation), observation);
  for (const changed of ["preparationId", "snapshotId", "observationId"]) {
    assert.equal(
      currentTaskObservation(source, { ...observation, [changed]: "f".repeat(changed === "preparationId" ? 32 : 64) }),
      null,
      changed,
    );
  }
  assert.equal(
    currentTaskObservation(
      { ...source, preparation: { ...source.preparation, id: "e".repeat(32) }, observation: null },
      observation,
    ),
    null,
    "another client's mode change makes the response historical",
  );
  assert.deepEqual(
    [
      "matched-record",
      "not-matched-record",
      "unqualified-record",
      "unknown-record",
    ].map(taskObservationLabel),
    [
      "選択範囲の記録が一致",
      "記録が一致しません",
      "この準備の確認に使えないタスク",
      "確認できません",
    ],
  );
  assert.equal(validTaskId(observation.taskId), true);
  assert.equal(validTaskId("not-a-uuid"), false);
  assert.equal(
    taskObservationNotice("matched-record"),
    "選択範囲の記録が一致。現在の準備に対応する記録です。",
  );
  for (const status of [
    "not-matched-record",
    "unqualified-record",
    "unknown-record",
  ]) {
    assert.equal(taskObservationNotice(status), taskObservationLabel(status));
  }
  assert.equal(canObserveTask(source), true);
  const legacyObservation = {
    ...observation,
    preparationId: null,
    status: "unknown-record",
    reasons: ["preparation-boundary-unavailable"],
  };
  for (const issue of [
    "preparation-boundary-unavailable",
    "preparation-metadata-invalid",
  ]) {
    const legacyState = {
      preparation: null,
      observation: legacyObservation,
      observationIssue: issue,
    };
    assert.equal(canObserveTask(legacyState), false, issue);
    assert.equal(
      taskObservationResponseNotice(legacyState, legacyObservation),
      observationIssueText(issue),
      issue,
    );
    assert.doesNotMatch(
      taskObservationResponseNotice(legacyState, legacyObservation),
      /確認後に準備状態が変わりました/,
      issue,
    );
  }
  for (const issue of [
    "source-conflict",
    "recovery-required",
    "observation-record-invalid",
  ]) {
    assert.equal(
      taskObservationResponseNotice(
        { ...source, observation: null, observationIssue: issue },
        observation,
      ),
      observationIssueText(issue),
      issue,
    );
  }
  assert.equal(
    taskObservationResponseNotice(
      {
        preparation: { id: "e".repeat(32), preparedAt: "2026-09-08T00:01:00Z" },
        observation: null,
        observationIssue: null,
      },
      observation,
    ),
    "確認後に準備状態が変わりました。現在の準備について、別の新しいタスクを確認してください。",
    "a real preparation change keeps the stale-response notice",
  );
});

test("source actions retain the UI accepted metadata after failed reads and never retry uncertain writes", async (t) => {
  const { Api } = await import("../src/api.ts");
  const { sourceOperation, readSourceState } = await import(
    "../src/source-operations.ts"
  );
  let metadata = {
    kind: "user-sources",
    application: "codex",
    applicationLabel: "Codex",
    launchId: "launch-one",
    contextId: "a".repeat(64),
    context: { codexHome: "/home", project: "/project", executable: "codex" },
    workspace: null,
  };
  let failMetadata = false,
    failWrite = false,
    posts = 0;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/bootstrap")
      return response.end(
        JSON.stringify({ token: "token", kind: "user-sources" }),
      );
    if (request.url === "/api/sources/metadata") {
      if (failMetadata) return request.destroy();
      return response.end(JSON.stringify(metadata));
    }
    if (request.url === "/api/sources/state")
      return response.end(
        JSON.stringify({ metadata, source: null, guide: {} }),
      );
    if (request.method === "POST") {
      posts += 1;
      let body = "";
      request.on("data", (c) => {
        body += c;
      });
      request.on("end", () => {
        const input = JSON.parse(body);
        assert.equal(input.launchId, metadata.launchId);
        assert.equal(input.contextId, metadata.contextId);
        if (failWrite) return request.destroy();
        response.end(
          JSON.stringify({
            result: {},
            state: { metadata, source: null, guide: {} },
          }),
        );
      });
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  const accepted = (await readSourceState(api)).metadata;
  assert.equal(
    (await sourceOperation(api, accepted, "discover", {})).status,
    "completed",
  );
  metadata = { ...metadata, launchId: "launch-two" };
  failMetadata = true;
  await assert.rejects(
    sourceOperation(api, accepted, "apply", { planId: "p" }),
    { kind: "connection-lost" },
  );
  failMetadata = false;
  const changed = await sourceOperation(api, accepted, "apply", {
    planId: "p",
  });
  assert.equal(changed.status, "context-updated");
  assert.equal(posts, 1);
  const second = changed.state.metadata;
  metadata = {
    ...metadata,
    context: { ...metadata.context, project: "/different" },
  };
  assert.equal(
    (await sourceOperation(api, second, "register", {})).status,
    "context-updated",
  );
  assert.equal(posts, 1);
  failWrite = true;
  await assert.rejects(
    sourceOperation(api, metadata, "apply", { planId: "p" }),
    { kind: "connection-lost" },
  );
  assert.equal(posts, 2, "one explicit request, no reconnect or retry");
  const valid = metadata;
  metadata = { ...metadata, context: null };
  await assert.rejects(sourceOperation(api, valid, "apply", {}), {
    kind: "invalid-response",
  });
  assert.equal(posts, 2);
});

test("source metadata admits each application's own launch identity and rejects a mixed one", async () => {
  const { validateSourceMetadata, sameSourceContext } = await import(
    "../src/source-operations.ts"
  );
  const base = {
    kind: "user-sources",
    launchId: "launch",
    contextId: "b".repeat(64),
    workspace: null,
  };
  const codex = {
    ...base,
    application: "codex",
    applicationLabel: "Codex",
    context: { codexHome: "/home", project: "/project", executable: "codex" },
  };
  const claude = {
    ...base,
    application: "claude",
    applicationLabel: "Claude Code",
    context: {
      application: "claude",
      claudeHome: "/home/.claude",
      project: "/project",
      appBundle: "/Applications/Claude.app",
    },
  };
  assert.equal(validateSourceMetadata(codex), codex);
  assert.equal(validateSourceMetadata(claude), claude);
  // Two applications never look like the same launch, and neither accepts the
  // other's identity fields.
  assert.equal(sameSourceContext(codex, claude), false);
  assert.equal(sameSourceContext(claude, { ...claude }), true);
  for (const invalid of [
    { ...claude, context: codex.context },
    { ...codex, context: claude.context },
    { ...claude, application: "codex" },
    { ...claude, applicationLabel: "" },
    { ...codex, application: "other" },
    { ...claude, context: { ...claude.context, appBundle: "" } },
  ])
    assert.throws(() => validateSourceMetadata(invalid), { kind: "invalid-response" });
});
