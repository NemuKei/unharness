# Read-only Codex Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a read-only Codex inventory command and a reproducible Windows handoff without claiming desktop mode control.

**Architecture:** A narrow JSON-RPC client talks only to a fresh local Codex app-server. A pure projection constructs a safe report from known response shapes. The CLI owns argument parsing and optional report-file creation; no product configuration is edited.

**Tech Stack:** Node.js 24+, ES modules, `node:child_process`, `node:fs/promises`, `node:path`, `node:test`, `node:assert/strict`; no external dependencies.

**Spec:** [Read-only probe contract](../spec-probe.md), under the full [product contract](../spec.md).

## Global Constraints

- Node.js 24 or later, ES modules, standard library only. No package installation or API key is needed for the probe.
- Spawn a native executable with structured arguments and `shell: false`. Do not enable a shell to run Windows `.cmd` / `.bat` wrappers.
- Only `initialize`, `config/read`, `skills/list`, `hooks/list`, and `configRequirements/read` are allowed outbound requests; the sole allowed notification is `initialized` after initialization.
- No user configuration writes, new model tasks, daemon lifecycle actions, login, hook execution, or external tool calls.
- Never emit raw configuration, instructions, identities, paths, environment variables, remote error messages/data, or unknown fields.
- Connection surface is always `standalone-app-server`; desktop attachment, runtime-state verification, and mode-switch verification remain false; source coverage remains unknown.
- Windows must be verified on the Windows machine; synthetic portability tests are not that evidence.

---

### Task 1: Implement and test the read-only inventory command

**Files:**
- Create: `package.json`, `bin/unharness.mjs`.
- Create: `src/codex/rpc-client.mjs`, `src/codex/summarize.mjs`, `src/codex/probe.mjs`.
- Test: `test/rpc-client.test.mjs`, `test/summarize.test.mjs`, `test/probe-cli.test.mjs`.
- Test helper: `test/fixtures/codex-server.mjs`.

**Interfaces:**
- `createReadOnlyClient({ command, args, cwd, timeoutMs, maxResponseBytes })` returns `{ request(method, params), initialized(), close(), rejectedServerRequestCount }`. Default app-server arguments are supplied by the caller. `request` resolves a result or throws a local error with `kind` and optional numeric `rpcCode`. Never expose the remote message/data.
- `summarizeQuery(method, rawResult)` returns `{ status: "ok", summary }` or `{ status: "error", error: { kind: "invalid-response" } }`, using the fields in the probe spec.
- `collectProbe({ executable = "codex", executableArgs = [], cwd = process.cwd(), timeoutMs = 10000 })` returns the complete safe report. `executableArgs` is a structured programmatic prefix for launching the synthetic fixture with Node in tests; it is not a public CLI flag.
- The CLI accepts `inspect`, `--cwd`, `--codex`, `--output`, `--timeout-ms`, and `--help`. It prints one JSON report, optionally writes identical JSON to a new file, and uses the exit codes in the spec.
- `package.json` is private, named `unharness`, version `0.0.1`, `type: "module"`, with `engines.node: ">=24"`, `scripts.test: "node --test"`, and `scripts.inspect: "node bin/unharness.mjs inspect"`.

- [x] **Step 1: Add failing behavior tests.** Start with a pure projection test that would fail if unknown source content were copied:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeQuery } from '../src/codex/summarize.mjs';

test('reports known skill counts without leaking skill or error text', () => {
  const result = summarizeQuery('skills/list', { data: [{
    cwd: '/private/synthetic-user/project',
    skills: [{ name: 'SECRET_MARKER', path: '/private/SECRET_MARKER',
      description: 'SECRET_MARKER', scope: 'user', enabled: false,
      pluginId: 'SECRET_MARKER' }],
    errors: [{ message: 'SECRET_MARKER' }],
  }] });
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.disabled, 1);
  assert.equal(result.summary.errors, 1);
  assert.equal(JSON.stringify(result).includes('SECRET_MARKER'), false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});
```

Add the remaining tests specified by `docs/spec-probe.md`, testing actual returned behavior rather than source text. The synthetic server must run as a real Node child process and can emit response fragments, notifications, errors, oversized lines, or a requested early exit. Keep these controls in test fixtures, not production APIs.

- [x] **Step 2: Run the focused tests before implementation.** Use `node --test test/summarize.test.mjs` and the relevant transport/CLI test files. Record the missing implementation or expected assertion failure as RED evidence.

- [x] **Step 3: Implement the three boundaries and CLI.** The outbound boundary starts from a fixed allowlist:

```js
const READ_METHODS = new Set([
  'initialize', 'config/read', 'skills/list', 'hooks/list',
  'configRequirements/read',
]);
function assertReadMethod(method) {
  if (!READ_METHODS.has(method)) {
    const error = new Error('Request is not allowed by the read-only probe');
    error.kind = 'forbidden-method';
    throw error;
  }
}
```

Use monotonically increasing request IDs, bounded line buffering, per-request timers, fixed local error kinds, and a pending-request map. Ignore notifications as report data; reject server requests without servicing them. On close, end stdin and use a short fallback timeout to terminate only the owned child.

Build summaries field by field from validated containers. For absent/failed inventories return unknown/error rather than successful zero counts. The complete report must include the literal evidence-limit fields from the spec. Execute only `--version` and the fixed app-server sequence. Validate CLI flags and integer bounds before launching any child. Use `writeFile(..., { flag: "wx" })` for explicit output files.

- [x] **Step 4: Run focused checks and the full suite once.** `node --test`. Include transport allowlist, malformed/oversized output, timeout/exit cleanup, secret-marker projection, partial results, CLI output collision, and spaces/Unicode path cases. Record GREEN evidence.
- [x] **Step 5: Self-review and commit only this task's code/tests.** `git diff --check`, then stage the exact files above and commit with `feat: add read-only Codex inventory probe`.

### Task 2: Run the Mac probe and prepare Windows evidence handoff

**Files:**
- Create: `docs/codex-probe.md`, `docs/evidence/2026-09-06-codex-macos.md`.
- Modify: `README.md`, `README.ja.md`, `AGENTS.md`, `CONTRIBUTING.md`, `docs/status.md`, `docs/compatibility.md`.
- Local-only output: `local-evidence/macos-codex-probe.json` (ignored by Git).

**Interfaces:**
- Consumes the command and report from Task 1.
- Produces a sanitized written finding and identical Windows command instructions. It does not add new runtime behavior.

- [x] **Step 1: Run the real read-only Mac command.** `node bin/unharness.mjs inspect --cwd <Unharness checkout> --output local-evidence/macos-codex-probe.json`. Review the safe JSON and confirm the evidence-limit fields remain false/unknown even when all queries pass.
- [x] **Step 2: Document the observation and its limits.** Record CLI/app versions observed, the standalone nature of the connection, layer categories and inventory counts, and the missing active desktop control socket. Do not commit the raw local doctor/schema/probe files.
- [x] **Step 3: Write the Windows handoff.** Document Node 24+, opening the same repo in Windows Codex, running `node --test` and `node bin/unharness.mjs inspect --cwd . --output local-evidence/windows-codex-probe.json`, and using `--codex` with the native executable when needed. Request the safe report, exact source revision, desktop version, and native/WSL identity.
- [x] **Step 4: Update current-state Docs in both languages.** State that a working read-only probe is present while mode switching/UI/favorites/recovery and all Windows integration evidence remain incomplete.
- [x] **Step 5: Validate links, `git diff --check`, and record the change.** Commit the listed documentation with `docs: record Codex probe findings and Windows handoff`.

## Coverage review

Task 1 implements the probe contract only. Task 2 validates it against the Mac environment and prepares Windows execution. The broader product features remain in `docs/spec.md` and are explicitly not reported as complete by this plan. No code or docs from the archived incubator are modified.

## Completion notes

The read-only command, synthetic tests, real Mac run, and Windows handoff were completed. A shared owned-process shutdown helper was added during review to resolve the same timeout defect in the version and app-server paths. Windows runtime evidence is still pending and is not implied by plan completion. User requests for quantitative quality/efficiency and the pixel-art comparison view were recorded as future comparison requirements, with an explicitly sample-data image; no live measurement or grading RPC was added.
