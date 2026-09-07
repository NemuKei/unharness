import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

test("source actions retain the UI accepted metadata after failed reads and never retry uncertain writes", async (t) => {
  const { Api } = await import("../src/api.ts");
  const { sourceOperation, readSourceState } = await import(
    "../src/source-operations.ts"
  );
  let metadata = {
    kind: "user-sources",
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
