import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

test('the active reference recipe preserves the approved image and confines frames and light samples', async () => {
  const base = new URL('../assets/', import.meta.url);
  const recipe = JSON.parse(await readFile(new URL('hangar-v3.json', base), 'utf8'));
  const asset = recipe.source;
  assert.equal(basename(asset.file), asset.file);
  const png = await readFile(new URL(asset.file, base));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), asset.width);
  assert.equal(png.readUInt32BE(20), asset.height);
  assert.equal(createHash('sha256').update(png).digest('hex'), asset.sha256);
  assert.deepEqual(recipe.frames.map(frame => frame.case), ['baseline', 'manual-only', 'fixed-only']);
  for (const [index, frame] of recipe.frames.entries()) {
    assert.equal(frame.x, index * recipe.worldSize);
    assert.equal(frame.y, 0);
    assert.equal(frame.width, recipe.worldSize);
    assert.equal(frame.height, recipe.worldSize);
    assert.ok(frame.x + frame.width <= asset.width && frame.y + frame.height <= asset.height);
    const [x, y, width, height] = frame.light;
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0);
    assert.ok(x + width <= frame.width && y + height <= frame.height);
  }
});
