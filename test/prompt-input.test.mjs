import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPromptInput, summarizePromptInput } from '../src/codex/prompt-input.mjs';

const fixture = fileURLToPath(new URL('./fixtures/source-controls-cli.mjs', import.meta.url));

const markers = {
  fixed: 'REQUIRED_RED_17',
  procedure: 'OPTIONAL_BLUE_23',
  skillCatalog: 'CATALOG_GREEN_31',
  skillBody: 'BODY_AMBER_47',
  userPrompt: 'USER_VIOLET_59',
};

test('projects markers only from recognized input text fields', () => {
  const summary = summarizePromptInput([
    {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: 'REQUIRED_RED_17 USER_VIOLET_59' }],
      metadata: { ignored: 'CATALOG_GREEN_31 PRIVATE_TOKEN_71' },
    },
    {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'input_text', text: 'OPTIONAL_BLUE_23' }],
      id: 'BODY_AMBER_47',
    },
  ], markers);

  assert.deepEqual(summary, {
    fixed: true,
    procedure: true,
    skillCatalog: false,
    skillBody: false,
    userPrompt: true,
  });
});

test('rejects anything other than the known text-only message array', () => {
  assert.throws(
    () => summarizePromptInput({ text: 'REQUIRED_RED_17' }, markers),
    { kind: 'invalid-response' },
  );
  assert.throws(
    () => summarizePromptInput([
      { type: 'message', role: 'user', content: [{ type: 'output_text', text: 'REQUIRED_RED_17' }] },
    ], markers),
    { kind: 'invalid-response' },
  );
  assert.throws(
    () => summarizePromptInput([
      { type: 'message', role: 'tool', content: [{ type: 'input_text', text: 'REQUIRED_RED_17' }] },
    ], markers),
    { kind: 'invalid-response' },
  );
});

test('runs the fixed debug command and projects only recognized response text', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'prompt reader 日本語 '));
  try {
    const configOverride = 'skills.config=[{path="C:\\\\Probe 日本語\\\\SKILL.md",enabled=false}]';
    const result = await readPromptInput({
      executable: process.execPath,
      executableArgs: [fixture, '--scenario', 'static', '--response-text', 'REQUIRED_RED_17 BODY_AMBER_47 USER_VIOLET_59', '--metadata-marker', 'CATALOG_GREEN_31', '--expected-config', configOverride],
      cwd,
      timeoutMs: 1000,
      markers,
      configOverride,
    });
    assert.deepEqual(result, {
      fixed: true,
      procedure: false,
      skillCatalog: false,
      skillBody: true,
      userPrompt: true,
    });
    assert.equal(JSON.stringify(result).includes('PRIVATE_'), false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('returns fixed error kinds for unsuccessful and malformed commands', async () => {
  for (const [scenario, kind] of [['exit', 'process-exit'], ['malformed', 'invalid-response']]) {
    await assert.rejects(
      readPromptInput({
        executable: process.execPath,
        executableArgs: [fixture, '--scenario', scenario],
        cwd: process.cwd(),
        timeoutMs: 1000,
        markers,
      }),
      (error) => error?.kind === kind && !JSON.stringify(error).includes('PRIVATE_'),
    );
  }
  await assert.rejects(
    readPromptInput({
      executable: join(tmpdir(), 'missing-unharness-source-controls-executable'),
      cwd: process.cwd(),
      timeoutMs: 1000,
      markers,
    }),
    { kind: 'spawn-error' },
  );
});

test('bounds output and force-terminates children that ignore graceful shutdown', async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt reader cleanup '));
  try {
    for (const [scenario, kind] of [['timeout', 'timeout'], ['oversize', 'response-too-large']]) {
      const pidFile = join(root, `${scenario}.pid`);
      await assert.rejects(
        readPromptInput({
          executable: process.execPath,
          executableArgs: [fixture, '--scenario', scenario, '--pid-file', pidFile],
          cwd: root,
          timeoutMs: 100,
          markers,
        }),
        { kind },
      );
      const pid = Number(await readFile(pidFile, 'utf8'));
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
