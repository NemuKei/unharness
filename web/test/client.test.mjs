import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

test("client authenticates requests and never retries an uncertain mutation", async (t) => {
  const { Api } = await import("../src/api.ts");
  let posts = 0;
  const server = createServer((req, res) => {
    assert.equal(req.headers["x-unharness-client"], "1");
    if (req.url === "/api/bootstrap")
      return res.end(JSON.stringify({ token: "test-token" }));
    assert.equal(req.headers["x-unharness-token"], "test-token");
    if (req.method === "POST") {
      posts++;
      req.destroy();
      return;
    }
    res.end(JSON.stringify({ current: null }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  await api.connect();
  assert.deepEqual(await api.get("/state"), { current: null });
  await assert.rejects(api.post("/save", { name: null }));
  assert.equal(posts, 1);
});

test("request generation rejects a late plan and invalidates an in-flight read", async () => {
  const { RequestGeneration } = await import("../src/api.ts");
  const generation = new RequestGeneration();
  const previousSelection = generation.next();
  const latestSelection = generation.next();
  assert.equal(generation.isCurrent(previousSelection), false);
  assert.equal(generation.isCurrent(latestSelection), true);
  generation.next();
  assert.equal(generation.isCurrent(latestSelection), false);
});

test("structured operation rejection stays connected; auth and uncertain replies require reconnect", async (t) => {
  const { Api } = await import("../src/api.ts");
  const { submitOperation } = await import("../src/operations.ts");
  let posts = 0;
  const server = createServer((req, res) => {
    if (req.url === "/api/bootstrap")
      return res.end(JSON.stringify({ token: "test-token" }));
    posts++;
    if (req.url === "/api/observe") {
      res.statusCode = 422;
      return res.end(
        JSON.stringify({ error: { kind: "current-session-unavailable" } }),
      );
    }
    if (req.url === "/api/apply") {
      res.statusCode = 409;
      return res.end(JSON.stringify({ error: { kind: "loadout-stale-plan" } }));
    }
    if (req.url === "/api/save") {
      res.statusCode = 403;
      return res.end(
        JSON.stringify({ error: { kind: "gui-request-forbidden" } }),
      );
    }
    if (req.url === "/api/invalid") return res.end("{}");
    req.destroy();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  await api.connect();
  for (const route of ["/observe", "/apply"]) {
    const result = await submitOperation(api, route, {});
    assert.equal(result.status, "rejected");
    assert.equal(result.connection, "connected");
    assert.doesNotMatch(result.notice, /未確認|確認できていません/);
  }
  for (const route of ["/save", "/invalid", "/disconnect"]) {
    const result = await submitOperation(api, route, {});
    assert.equal(result.connection, "unconfirmed");
    assert.equal(
      result.status,
      route === "/save" ? "auth-required" : "uncertain",
    );
  }
  assert.equal(posts, 5, "each mutation is sent exactly once");
});

test("failed checkpoint refresh retains confirmed application and its recovery receipt", async (t) => {
  const { Api } = await import("../src/api.ts");
  const { submitOperation, refreshCheckpointPage } = await import(
    "../src/operations.ts"
  );
  let posts = 0;
  const receipt = {
    applicationId: "a".repeat(64),
    checkpointId: "b".repeat(64),
  };
  const server = createServer((req, res) => {
    if (req.url === "/api/bootstrap")
      return res.end(JSON.stringify({ token: "test-token" }));
    if (req.method === "POST") {
      posts++;
      return res.end(
        JSON.stringify({
          result: receipt,
          state: { application: receipt, applicationCurrent: true },
        }),
      );
    }
    req.destroy();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  await api.connect();
  for (const route of ["/apply", "/restore-checkpoint"]) {
    const outcome = await submitOperation(api, route, {});
    assert.equal(outcome.status, "confirmed");
    const listing = await refreshCheckpointPage(api);
    assert.equal(listing.status, "stale");
    assert.match(listing.message, /一覧/);
    assert.doesNotMatch(listing.message, /操作の結果は未確認/);
    assert.deepEqual(outcome.response.result, receipt);
    assert.equal(outcome.response.state.applicationCurrent, true);
  }
  assert.equal(posts, 2, "a failed list refresh never repeats the mutation");
});

test("structured 500 mutation is uncertain and preserves its checkpoint without retry", async (t) => {
  const { Api } = await import("../src/api.ts");
  const { submitOperation } = await import("../src/operations.ts");
  let posts = 0;
  const checkpointId = "c".repeat(64);
  const server = createServer((req, res) => {
    if (req.url === "/api/bootstrap")
      return res.end(JSON.stringify({ token: "test-token" }));
    posts++;
    res.statusCode = 500;
    res.end(
      JSON.stringify({ error: { kind: "gui-operation-error", checkpointId } }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  await api.connect();
  const result = await submitOperation(api, "/apply", {});
  assert.equal(result.status, "uncertain");
  assert.equal(result.connection, "unconfirmed");
  assert.equal(result.checkpointId, checkpointId);
  assert.match(result.notice, /状態を再取得/);
  assert.match(result.message, /未確認/);
  assert.equal(posts, 1);
});

test("auxiliary auth, transport and invalid responses invalidate usability without changing confirmed receipts", async (t) => {
  const { Api } = await import("../src/api.ts");
  const { submitOperation, refreshCheckpointPage } = await import(
    "../src/operations.ts"
  );
  let failure = "forbidden";
  let posts = 0;
  const receipt = {
    applicationId: "a".repeat(64),
    checkpointId: "b".repeat(64),
  };
  const server = createServer((req, res) => {
    if (req.url === "/api/bootstrap")
      return res.end(JSON.stringify({ token: "test-token" }));
    if (req.method === "POST") {
      posts++;
      return res.end(
        JSON.stringify({
          result: receipt,
          state: { application: receipt, applicationCurrent: true },
        }),
      );
    }
    if (failure === "disconnect") return req.destroy();
    if (failure === "invalid") return res.end("{}");
    res.statusCode = failure === "forbidden" ? 403 : 409;
    res.end(
      JSON.stringify({
        error: {
          kind:
            failure === "forbidden"
              ? "gui-request-forbidden"
              : "loadout-incompatible-scope",
        },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const api = new Api(`http://127.0.0.1:${server.address().port}`);
  await api.connect();
  for (const route of ["/apply", "/restore-checkpoint"]) {
    const outcome = await submitOperation(api, route, {});
    assert.equal(outcome.status, "confirmed");
    for (failure of ["forbidden", "disconnect", "invalid", "rejected"]) {
      const listing = await refreshCheckpointPage(api);
      assert.equal(listing.status, "stale");
      assert.equal(
        listing.connection,
        failure === "rejected" ? "connected" : "unconfirmed",
      );
      assert.deepEqual(outcome.response.result, receipt);
      assert.equal(
        outcome.response.state.applicationCurrent,
        true,
        "original receipt is immutable evidence",
      );
      assert.doesNotMatch(listing.message, /操作の結果は未確認/);
    }
  }
  assert.equal(posts, 2, "no list failure repeats either mutation");
});
