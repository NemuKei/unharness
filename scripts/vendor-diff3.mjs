// Copy the already locked merge implementation for Node-only frozen restores.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = join(root, 'node_modules/node-diff3'), destination = join(root, 'src/vendor/node-diff3');
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (pkg.version !== '3.1.2' || pkg.license !== 'MIT') throw Error('Review the pinned merge dependency before updating its vendor files');
const manifest = { package: pkg.name, version: pkg.version, license: pkg.license,
  upstream: 'https://github.com/bhousel/node-diff3', files: {} };
const files = new Map();
for (const name of ['index.mjs', 'LICENSE.md']) {
  const content = await readFile(join(source, name));
  files.set(name, content);
  manifest.files[name] = createHash('sha256').update(content).digest('hex');
}
files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
if (process.argv.includes('--check')) {
  for (const [name, content] of files)
    if (!(await readFile(join(destination, name))).equals(content)) throw Error('Vendored merge differs from the locked package: ' + name);
  console.log('Vendored merge matches the locked package');
} else {
  await mkdir(destination, { recursive: true });
  for (const [name, content] of files) await writeFile(join(destination, name), content);
  console.log('Copied the pinned merge implementation and license without source changes');
}
