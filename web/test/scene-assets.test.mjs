import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

test('the local rig recipe matches its retained images and confines each armor mask to its half', async () => {
  const base = new URL('../assets/', import.meta.url);
  const recipe = JSON.parse(await readFile(new URL('hangar-v2.json', base), 'utf8'));
  for (const asset of Object.values(recipe.assets)) {
    assert.equal(basename(asset.file), asset.file);
    const png = await readFile(new URL(asset.file, base));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), asset.width);
    assert.equal(png.readUInt32BE(20), asset.height);
    assert.equal(createHash('sha256').update(png).digest('hex'), asset.sha256);
    const [x0, y0, x1, y1] = asset.bounds;
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= asset.width && y1 <= asset.height);
    assert.ok(x1 > x0 && y1 > y0);
  }
  const capsule = recipe.assets.capsule;
  const width = capsule.bounds[2] - capsule.bounds[0];
  const height = capsule.bounds[3] - capsule.bounds[1];
  const split = Math.floor(width / 2);
  for (const [side, vertices] of [['left', capsule.leftMask], ['right', capsule.rightMask]]) {
    assert.ok(vertices.length >= 6 && vertices.length % 2 === 0);
    assert.ok(vertices.every(Number.isFinite));
    for (let index = 0; index < vertices.length; index += 2) {
      const [x, y] = vertices.slice(index, index + 2);
      assert.ok(x >= -split && x <= width - split);
      assert.ok(side === 'left' ? x <= 0 : x >= 0);
      assert.ok(Math.abs(y) <= height / 2);
    }
    assert.ok(vertices.some((x, index) => index % 2 === 0 && x === 0));
  }
});
