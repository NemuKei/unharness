import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lstat } from 'node:fs/promises';
import { distributionFile, distributionIdentity } from './distribution.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const PRODUCT_VERSION_PATTERN = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;
const hash = /^[a-f0-9]{64}$/;
const unavailable = () => ({ version: null, distributionId: null, sourceRevision: null, evidence: 'unavailable' });
async function identity(directory) {
  try {
    const pkg = parseStrictJson((await distributionFile(join(directory, 'package.json'), { textLimit: 16384 })).text);
    if (pkg.name !== 'unharness' || typeof pkg.version !== 'string' || !PRODUCT_VERSION_PATTERN.test(pkg.version)) return unavailable();
    const manifestPath = join(directory, 'distribution.json');
    const exists = await lstat(manifestPath).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
    if (!exists) return { version: pkg.version, distributionId: null, sourceRevision: null, evidence: 'development-metadata' };
    const manifestFile = await distributionFile(manifestPath, { textLimit: 4 * 1024 * 1024 });
    const manifest = parseStrictJson(manifestFile.text);
    if (manifest.kind !== 'unharness-distribution' || manifest.schemaVersion !== 1 || manifest.version !== pkg.version
      || manifest.platform !== 'darwin-arm64' || typeof manifest.sourceDirty !== 'boolean'
      || !Array.isArray(manifest.files) || manifest.sourceRevision !== null
        && (typeof manifest.sourceRevision !== 'string' || !/^[a-f0-9]{40}$/.test(manifest.sourceRevision))) return unavailable();
    // Identity of the indexed metadata only. Full archive/file verification is
    // still required by installation and recovery; status does not repeat it.
    const distributionId = distributionIdentity(manifest);
    if (!hash.test(distributionId)) return unavailable();
    return { version: pkg.version, distributionId, sourceRevision: manifest.sourceRevision,
      evidence: 'distribution-metadata', sourceDirty: manifest.sourceDirty };
  } catch { return unavailable(); }
}

export async function createVersionReporter(directory = root) {
  const running = Object.freeze(await identity(directory));
  return { running, async read() {
    const files = await identity(directory);
    return { running, files,
      sameRootComparison: running.version && files.version ? (JSON.stringify(running) === JSON.stringify(files) ? 'match' : 'changed') : 'unavailable',
      hostSelection: 'unknown', freshTaskLoading: 'unknown' };
  } };
}
