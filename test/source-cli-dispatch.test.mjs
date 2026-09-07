import test from "node:test";
import assert from "node:assert/strict";
import { sourcesMain } from "../src/sources/cli.mjs";
test("source CLI rejects inherited operation names without output or dispatch", async () => {
  for (const command of [
    "toString",
    "constructor",
    "__proto__",
    "hasOwnProperty",
  ]) {
    let stdout = "",
      stderr = "";
    assert.equal(
      await sourcesMain(["sources", command, "--json", "{}"], {
        stdout: {
          write: (value) => {
            stdout += value;
          },
        },
        stderr: {
          write: (value) => {
            stderr += value;
          },
        },
      }),
      2,
    );
    assert.equal(stdout, "");
    assert.deepEqual(JSON.parse(stderr), {
      error: { kind: "invalid-request" },
    });
  }
});
