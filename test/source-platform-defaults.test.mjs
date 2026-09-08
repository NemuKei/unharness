import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('private default metadata is reproducible when the MCP host omits TMPDIR on Mac', { skip: process.platform !== 'darwin' }, async () => {
  const code = `import {defaultMetadata,canReproduceOwnership} from './src/sources/platform.mjs';
    const meta=await defaultMetadata();
    process.stdout.write(JSON.stringify({writable:canReproduceOwnership({meta}), own:meta.uid===process.geteuid(), group:meta.gid===process.getegid(), mode:meta.mode}));`;
  const { stdout } = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', code], { env: { PATH: process.env.PATH }, timeout: 5000 });
  assert.deepEqual(JSON.parse(stdout), { writable: true, own: true, group: true, mode: 0o600 });
});
