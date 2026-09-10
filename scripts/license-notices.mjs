// Build-time only. Product use never fetches license text or reads the checkout.
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const colordNotice = new URL('../packaging/licenses/pixi-colord-2.9.6-LICENSE.md', import.meta.url);
const noticeName = /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i;

export async function dependencyNotices(root) {
  if (root instanceof URL) root = fileURLToPath(root);
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const packages = [];
  for (const [path, locked] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
    if (!path || locked.dev) continue;
    if (!/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(path)
      || path.split('/').some(part => part === '.' || part === '..')) throw Error('Unsupported dependency path in lockfile.');
    const directory = join(root, path);
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (pkg.version !== locked.version) throw Error('Package version differs from lockfile: ' + path);
    const notices = [];
    for (const name of (await readdir(directory)).filter(name => noticeName.test(name)).sort()) {
      const text = await readFile(join(directory, name), 'utf8');
      if (!text.trim()) throw Error('Empty license notice: ' + path + '/' + name);
      notices.push({ name, text });
    }
    // The published 2.9.6 tarball omits LICENSE.md. Preserve the exact tagged
    // upstream notice, without silently applying it to a future package version.
    if (!notices.length && pkg.name === '@pixi/colord' && pkg.version === '2.9.6') {
      const text = await readFile(colordNotice, 'utf8');
      if (createHash('sha256').update(text).digest('hex') !== '7613d4594ee8b6163926af3435dae61c9e3d5a27cd137bd76a543ba40002d8fc')
        throw Error('Reviewed colord license notice changed.');
      notices.push({ name: 'LICENSE.md', text, supplied: true });
    }
    if (!notices.length) throw Error('Missing license notice: ' + pkg.name + ' ' + pkg.version);
    packages.push({ name: pkg.name, version: pkg.version, license: pkg.license ?? locked.license ?? 'See included license text', path, notices });
  }
  const text = packages.map(pkg => `${pkg.name} ${pkg.version}\n${pkg.notices.map(notice => notice.text).join('\n')}`).join('\n\n-----\n\n');
  return { packages, text };
}

export function thirdPartyNotices() {
  return {
    name: 'unharness-license-notices',
    async generateBundle() {
      const { text } = await dependencyNotices(repository);
      const own = await readFile(join(repository, 'LICENSE'), 'utf8');
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source:
        'Unharness\n' + own + '\n\nApplication dependencies\nIndividual browser builds may use a subset.\n\n' + text + '\n' });
    },
  };
}
