import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVersionReporter } from '../src/setup/product-version.mjs';
import { checkForUpdates, parseReleaseCatalog, RELEASE_CATALOG_URL } from '../src/setup/releases.mjs';

const release = version => ({ version,
  archiveUrl: `https://github.com/NemuKei/unharness/releases/download/v${version}/unharness-${version}-macos-arm64.zip`,
  archiveSha256: 'a'.repeat(64), distributionId: 'b'.repeat(64),
  sourceUrl: 'https://github.com/NemuKei/unharness/tree/' + 'c'.repeat(40),
  releaseUrl: `https://github.com/NemuKei/unharness/releases/tag/v${version}`,
  publishedAt: '2026-09-14T00:00:00Z', changes: { ja: ['起動の案内を改善。'], en: ['Improved startup guidance.'] } });
const catalog = version => ({ kind: 'unharness-release-catalog', schemaVersion: 1,
  platform: 'darwin-arm64', channel: 'mac-preview', release: release(version) });
const identity = version => ({ version, distributionId: null, sourceRevision: null, evidence: 'development-metadata' });
const versions = version => ({ running: identity(version), files: identity(version), sameRootComparison: 'match',
  hostSelection: 'unknown', freshTaskLoading: 'unknown' });
const reply = version => async () => Response.json(catalog(version));

test('numeric versions distinguish updates, current releases and newer local installations', async () => {
  for (const [local, remote, expected] of [['0.0.9', '0.0.10', 'update-available'], ['0.0.10', '0.0.10', 'current'], ['0.0.10', '0.0.9', 'ahead']]) {
    const result = await checkForUpdates(versions(local), { fetchImpl: reply(remote) });
    assert.equal(result.status, expected);
    assert.equal(result.release.version, remote);
    assert.equal(result.checkedAt.length, 24);
  }
});

test('update lookup requests only the fixed public catalog, with no private state or version', async () => {
  const calls = [];
  const result = await checkForUpdates(versions('0.0.9'), { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json(catalog('0.0.10'));
  } });
  // Assert outside the dependency: production intentionally catches transport
  // exceptions, which must not swallow a failed privacy-boundary assertion.
  assert.equal(result.status, 'update-available');
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, RELEASE_CATALOG_URL);
  assert.equal(options.redirect, 'error');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.method, 'GET');
  assert.equal(options.body, undefined);
  assert.deepEqual(options.headers, { Accept: 'application/json' });
  assert.ok(options.signal instanceof AbortSignal);
});

test('offline, invalid, oversized and redirected responses cannot become latest-version claims', async () => {
  const cases = [async () => { throw Error('private details'); }, async () => new Response('not json'),
    async () => new Response('x'.repeat(40000)), async () => Response.json(catalog('0.0.10'), { status: 302 }),
    async () => new Response('{}', { status: 404 }), async () => Response.json({ ...catalog('0.0.10'), extra: 'ignored?' })];
  for (const fetchImpl of cases) {
    const result = await checkForUpdates(versions('0.0.9'), { fetchImpl });
    assert.equal(result.status, 'unavailable');
    assert.equal(result.release, null);
    assert.ok(!JSON.stringify(result).includes('private details'));
  }
});

test('catalog rejects changed owner, credentials, query routing and untrusted archive/source paths', () => {
  for (const [key, value] of [['archiveUrl', 'https://example.invalid/install.zip'],
    ['archiveUrl', release('0.0.10').archiveUrl + '?redirect=evil'],
    ['sourceUrl', 'https://github.com/NemuKei/unharness/tree/main'],
    ['sourceUrl', 'https://githubXcom/NemuKei/unharness/tree/' + 'c'.repeat(40)],
    ['releaseUrl', 'https://github.com/other/unharness/releases/tag/v0.0.10'],
    ['version', '0.0.10;curl'], ['archiveSha256', 'a'.repeat(63)]]) {
    const valueToRead = catalog('0.0.10'); valueToRead.release[key] = value;
    assert.throws(() => parseReleaseCatalog(valueToRead));
  }
});

test('version reporter keeps the running identity while rereading changed installation files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'unharness-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const save = version => writeFile(join(root, 'package.json'), JSON.stringify({ name: 'unharness', version }));
  await save('0.0.9');
  const reporter = await createVersionReporter(root);
  assert.equal((await reporter.read()).sameRootComparison, 'match');
  await save('0.0.10');
  const changed = await reporter.read();
  assert.equal(changed.running.version, '0.0.9');
  assert.equal(changed.files.version, '0.0.10');
  assert.equal(changed.sameRootComparison, 'changed');
  assert.equal(changed.hostSelection, 'unknown');
  assert.equal(changed.freshTaskLoading, 'unknown');
  assert.equal((await checkForUpdates(changed, { fetchImpl: reply('0.0.10') })).status, 'reload-required');
  assert.equal((await (await createVersionReporter(root)).read()).running.version, '0.0.10');
  await writeFile(join(root, 'package.json'), '{"name":"someone-else","version":"0.0.10"}');
  assert.equal((await reporter.read()).files.version, null);
  assert.equal((await reporter.read()).sameRootComparison, 'unavailable');
});

test('unknown runtime versions never suggest installing or downgrading', async () => {
  const unknown = versions(null);
  assert.equal((await checkForUpdates(unknown, { fetchImpl: reply('0.0.10') })).status, 'unknown');
});


test('distribution identity matches the package verifier and does not claim full integrity', async t => {
  const root = await mkdtemp(join(tmpdir(), 'unharness-distribution-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'unharness', version: '0.0.10' }));
  const manifest = { kind: 'unharness-distribution', schemaVersion: 1, version: '0.0.10',
    platform: 'darwin-arm64', sourceRevision: 'c'.repeat(40), sourceDirty: false, runtime: {}, files: [] };
  await writeFile(join(root, 'distribution.json'), JSON.stringify(manifest));
  const version = (await (await createVersionReporter(root)).read()).running;
  assert.equal(version.distributionId, createHash('sha256').update(JSON.stringify(manifest)).digest('hex'));
  assert.equal(version.evidence, 'distribution-metadata');
  assert.equal(version.integrityVerified, undefined);
});


test('the production catalog validates against the native update contract', async () => {
  const { readFile } = await import('node:fs/promises');
  const saved = JSON.parse(await readFile('site/public/releases/macos-arm64.json', 'utf8'));
  assert.deepEqual(parseReleaseCatalog(saved), saved);
});


test('malformed metadata cannot become a usable local version through string coercion', async t => {
  const root = await mkdtemp(join(tmpdir(), 'unharness-malformed-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'unharness', version: ['0.0.10'] }));
  assert.equal((await createVersionReporter(root)).running.evidence, 'unavailable');
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'unharness', version: '0.0.10' }));
  await writeFile(join(root, 'distribution.json'), JSON.stringify({ kind: 'unharness-distribution', schemaVersion: 1,
    version: '0.0.10', platform: 'darwin-arm64', sourceRevision: ['c'.repeat(40)], sourceDirty: false, files: [] }));
  assert.equal((await createVersionReporter(root)).running.evidence, 'unavailable');
});
