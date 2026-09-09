// Keep the offline frozen-restore guard independent of node_modules.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const source = join(root, 'node_modules/smol-toml');
const destination = join(root, 'src/vendor/smol-toml');
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
if (pkg.version !== '1.8.0' || pkg.license !== 'BSD-3-Clause') throw Error('Review the pinned TOML parser before updating its vendor files');
const names = ['parse.js', 'struct.js', 'extract.js', 'primitive.js', 'util.js', 'error.js', 'date.js'];
const manifest = { package: pkg.name, version: pkg.version, license: pkg.license,
  upstream: 'https://github.com/squirrelchat/smol-toml', files: {} };
const files = new Map();
for (const name of [...names, 'LICENSE']) {
  const content = await readFile(join(source, name === 'LICENSE' ? name : 'dist/' + name));
  files.set(name, content);
  manifest.files[name] = createHash('sha256').update(content).digest('hex');
}
files.set('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
if (process.argv.includes('--check')) {
  for (const [name, content] of files) {
    if (!(await readFile(join(destination, name))).equals(content)) throw Error('Vendored parser differs from the locked package: ' + name);
  }
  console.log('Vendored TOML parser matches the locked package');
} else {
  await mkdir(destination, { recursive: true });
  for (const [name, content] of files) await writeFile(join(destination, name), content);
  console.log('Copied the pinned TOML parser and license without source changes');
}
