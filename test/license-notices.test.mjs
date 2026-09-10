import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);

test('built notices retain the complete missing colord notice and other production licenses', async () => {
  const { dependencyNotices } = await import('../scripts/license-notices.mjs');
  const result = await dependencyNotices(root);
  assert.match(result.text, /Copyright \(c\) 2020 Vlad Shilov/);
  assert.match(result.text, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(result.text, /@pixi\/colord 2\.9\.6/);
  for (const name of ['react', 'react-dom', 'pixi.js', 'yaml', 'twitter-text']) {
    assert.ok(result.packages.some(pkg => pkg.name === name));
  }
  const original = await readFile(new URL('../packaging/licenses/pixi-colord-2.9.6-LICENSE.md', import.meta.url), 'utf8');
  assert.ok(result.text.includes(original));
  assert.ok(result.packages.every(pkg => pkg.notices.length > 0));
});

async function fixture(t, name, version, license) {
  const directory = await mkdtemp(join(tmpdir(), 'unharness-license-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const packagePath = 'node_modules/' + name;
  await mkdir(join(directory, packagePath), { recursive: true });
  await writeFile(join(directory, 'package-lock.json'), JSON.stringify({ packages: {
    '': { name: 'fixture' }, [packagePath]: { version, license: 'MIT' },
    'node_modules/development-only': { version: '1.0.0', dev: true },
  } }));
  await writeFile(join(directory, packagePath, 'package.json'), JSON.stringify({ name, version, license: 'MIT' }));
  if (license !== undefined) await writeFile(join(directory, packagePath, 'LICENSE'), license);
  return directory;
}

test('a missing notice is refused unless the exact reviewed package version has a fallback', async t => {
  const { dependencyNotices } = await import('../scripts/license-notices.mjs');
  const missing = await fixture(t, 'synthetic-library', '1.0.0');
  await assert.rejects(dependencyNotices(missing), /Missing license notice.*synthetic-library/);
  const newer = await fixture(t, '@pixi/colord', '99.0.0');
  await assert.rejects(dependencyNotices(newer), /Missing license notice.*@pixi\/colord/);
  const supported = await fixture(t, '@pixi/colord', '2.9.6');
  assert.match((await dependencyNotices(supported)).text, /Copyright \(c\) 2020 Vlad Shilov/);
});

test('empty license text and a package version outside the lockfile stop notice generation', async t => {
  const { dependencyNotices } = await import('../scripts/license-notices.mjs');
  const empty = await fixture(t, 'synthetic-library', '1.0.0', ' \n');
  await assert.rejects(dependencyNotices(empty), /Empty license notice/);
  const mismatch = await fixture(t, 'synthetic-library', '1.0.0', 'Synthetic license text');
  await writeFile(join(mismatch, 'node_modules/synthetic-library/package.json'), JSON.stringify({ name: 'synthetic-library', version: '2.0.0' }));
  await assert.rejects(dependencyNotices(mismatch), /Package version differs from lockfile/);
});

test('both production browser builds ship the full dependency notices', async t => {
  const { build } = await import('vite');
  const output = await mkdtemp(join(tmpdir(), 'unharness-license-build-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const original = await readFile(new URL('../packaging/licenses/pixi-colord-2.9.6-LICENSE.md', import.meta.url), 'utf8');
  for (const [name, configPath] of [['web', '../vite.config.mjs'], ['site', '../vite.site.config.mjs']]) {
    const { default: config } = await import(configPath);
    const outDir = join(output, name);
    await build({ ...config, configFile: false, logLevel: 'silent', root: fileURLToPath(new URL('../' + name, import.meta.url)),
      build: { ...config.build, outDir, emptyOutDir: true } });
    const notice = await readFile(join(outDir, 'THIRD_PARTY_NOTICES.txt'), 'utf8');
    assert.ok(notice.includes(original));
    assert.match(notice, /Copyright 2011 Twitter, Inc\./);
    assert.match(notice, /react-dom 19\./);
  }
});
