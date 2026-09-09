import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, realpath, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'unharness-distribution-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ['bin', 'runtime/bin', 'skills/unharness', '.codex-plugin', 'dist', 'scripts']) await mkdir(join(root, path), { recursive: true });
  const portable = { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'unharness', version: '0.0.1', license: 'MIT' };
  for (const [path, content] of Object.entries({ 'plugin.json': JSON.stringify(portable),
    '.codex-plugin/plugin.json': JSON.stringify({ name: 'unharness', version: '0.0.1', license: 'MIT' }),
    'package.json': JSON.stringify({ name: 'unharness', version: '0.0.1', license: 'MIT', type: 'module' }),
    'mcp.json': '{}', 'LICENSE': 'Synthetic product license', 'runtime/LICENSE': 'Synthetic runtime license',
    'runtime/bin/node': 'SYNTHETIC RUNTIME, NOT EXECUTABLE', 'bin/unharness.mjs': '// synthetic entry point',
    'scripts/unharness': '#!/bin/sh\nexit 0\n', 'dist/index.html': '<!doctype html><title>Fixture</title>',
    'skills/unharness/SKILL.md': '---\nname: unharness\ndescription: Synthetic fixture\n---\n' }))
    await writeFile(join(root, path), content, { mode: ['scripts/unharness', 'runtime/bin/node'].includes(path) ? 0o755 : 0o644 });
  return root;
}

test('distribution integrity covers runtime, UI and every bundled file without source data', async t => {
  const { indexDistribution, readDistribution } = await import('../src/setup/distribution.mjs');
  const root = await fixture(t);
  const indexed = await indexDistribution(root, { platform: 'darwin-arm64', sourceRevision: '1'.repeat(40), sourceDirty: true });
  const read = await readDistribution(root);
  assert.equal(read.id, indexed.id);
  assert.equal(read.manifest.version, '0.0.1');
  assert.equal(read.manifest.runtime.version, '24.20.0');
  assert.ok(read.manifest.files.some(file => file.path === 'runtime/bin/node' && file.executable));
  assert.ok(!JSON.stringify(read.manifest).includes('Synthetic product license'));
  const original = await readFile(join(root, 'distribution.json'));
  await assert.rejects(indexDistribution(root, { platform: 'darwin-arm64', sourceRevision: '1'.repeat(40), sourceDirty: true }));
  assert.deepEqual(await readFile(join(root, 'distribution.json')), original);
});

test('modified, extra, missing and symlinked bundle contents are refused', async t => {
  const { indexDistribution, readDistribution } = await import('../src/setup/distribution.mjs');
  for (const change of ['modified', 'extra', 'missing', 'symlink']) {
    const root = await fixture(t);
    await indexDistribution(root, { platform: 'darwin-arm64', sourceRevision: null, sourceDirty: true });
    if (change === 'modified') await writeFile(join(root, 'runtime/bin/node'), 'CHANGED');
    if (change === 'extra') await writeFile(join(root, 'bin/extra.mjs'), '// extra');
    if (change === 'missing') await rm(join(root, 'LICENSE'));
    if (change === 'symlink') {
      await rm(join(root, 'dist/index.html'));
      await symlink(join(root, 'LICENSE'), join(root, 'dist/index.html'));
    }
    await assert.rejects(readDistribution(root), { kind: 'distribution-invalid' }, change);
  }
});

test('mixed plugin versions, private payloads and unsupported manifest versions are refused', async t => {
  const { indexDistribution, readDistribution } = await import('../src/setup/distribution.mjs');
  const root = await fixture(t);
  await writeFile(join(root, '.codex-plugin/plugin.json'), '{"name":"unharness","version":"9.9.9","license":"MIT"}');
  await assert.rejects(indexDistribution(root, { platform: 'darwin-arm64', sourceRevision: null, sourceDirty: true }), { kind: 'distribution-invalid' });
  const privateRoot = await fixture(t); await writeFile(join(privateRoot, '.env'), 'PRIVATE=fixture');
  await assert.rejects(indexDistribution(privateRoot, { platform: 'darwin-arm64', sourceRevision: null, sourceDirty: true }), { kind: 'distribution-invalid' });
  const valid = await fixture(t); await indexDistribution(valid, { platform: 'darwin-arm64', sourceRevision: null, sourceDirty: true });
  const manifest = JSON.parse(await readFile(join(valid, 'distribution.json'), 'utf8'));
  manifest.schemaVersion = 99;
  await writeFile(join(valid, 'distribution.json'), JSON.stringify(manifest));
  await assert.rejects(readDistribution(valid), { kind: 'distribution-invalid' });
});
