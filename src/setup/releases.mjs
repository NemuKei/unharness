import { PRODUCT_VERSION_PATTERN } from './product-version.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';

export const RELEASE_CATALOG_URL = 'https://unharness.deltahelmlab.com/releases/macos-arm64.json';
const repository = 'https://github.com/NemuKei/unharness';
const LIMIT = 32768;
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join() === [...keys].sort().join();
const fail = () => { throw Error('release-catalog-invalid'); };
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const lines = value => Array.isArray(value) && value.length > 0 && value.length <= 8
  && value.every(line => typeof line === 'string' && line.length > 0 && line.length <= 500 && !/[\u0000-\u001f\u007f-\u009f]/.test(line));

export function parseReleaseCatalog(value) {
  if (!exact(value, ['kind', 'schemaVersion', 'platform', 'channel', 'release'])
    || value.kind !== 'unharness-release-catalog' || value.schemaVersion !== 1
    || value.platform !== 'darwin-arm64' || value.channel !== 'mac-preview') fail();
  const r = value.release;
  if (!exact(r, ['version', 'archiveUrl', 'archiveSha256', 'distributionId', 'sourceUrl', 'releaseUrl', 'publishedAt', 'changes'])
    || typeof r.version !== 'string' || !PRODUCT_VERSION_PATTERN.test(r.version)
    || r.archiveUrl !== `${repository}/releases/download/v${r.version}/unharness-${r.version}-macos-arm64.zip`
    || r.releaseUrl !== `${repository}/releases/tag/v${r.version}`
    || typeof r.sourceUrl !== 'string' || (!r.sourceUrl.startsWith(repository + '/tree/') || !/^[a-f0-9]{40}$/.test(r.sourceUrl.slice((repository + '/tree/').length)))
    || !digest(r.archiveSha256) || !digest(r.distributionId)
    || typeof r.publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.publishedAt) || !Number.isFinite(Date.parse(r.publishedAt))
    || !exact(r.changes, ['ja', 'en']) || !lines(r.changes.ja) || !lines(r.changes.en)) fail();
  return structuredClone(value);
}
function compare(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}
async function boundedBody(response) {
  if (!response.ok || response.redirected || !response.body
    || Number(response.headers.get('content-length')) > LIMIT) fail();
  const reader = response.body.getReader(), chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMIT) fail();
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function checkForUpdates(versions, { fetchImpl = fetch } = {}) {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetchImpl(RELEASE_CATALOG_URL, { method: 'GET', headers: { Accept: 'application/json' },
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const { release } = parseReleaseCatalog(parseStrictJson(await boundedBody(response)));
    const current = versions.running.version;
    let status = 'unknown';
    if (current && PRODUCT_VERSION_PATTERN.test(current) && versions.files.version) {
      const comparison = compare(current, release.version);
      status = versions.sameRootComparison === 'changed' ? 'reload-required' : comparison < 0 ? 'update-available' : comparison > 0 ? 'ahead' : 'current';
    }
    return { status, release, versions, checkedAt, catalogUrl: RELEASE_CATALOG_URL };
  } catch {
    return { status: 'unavailable', release: null, versions, checkedAt, catalogUrl: RELEASE_CATALOG_URL };
  }
}
