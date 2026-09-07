import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { sourcePanels, buildCels } from '../src/scene-cels.ts';
import { sourceArms, coreBounds, coreMask, coreNucleus, WORLD } from '../src/scene-parts.ts';

test('the active cel recipe matches its retained source art and empty background', async () => {
  const base = new URL('../assets/', import.meta.url);
  const recipe = JSON.parse(await readFile(new URL('hangar-v4.json', base), 'utf8'));
  assert.equal(recipe.worldSize, WORLD);
  for (const asset of [recipe.source, recipe.emptyPlate]) {
    assert.equal(basename(asset.file), asset.file);
    const png = await readFile(new URL(asset.file, base));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), asset.width);
    assert.equal(png.readUInt32BE(20), asset.height);
    assert.equal(createHash('sha256').update(png).digest('hex'), asset.sha256);
  }
  assert.equal(recipe.source.width, WORLD * 3);
  assert.equal(recipe.source.height, WORLD);
  assert.ok(recipe.emptyPlate.originalFloorFromY > 0 && recipe.emptyPlate.originalFloorFromY < WORLD);
});

test('hardware masks stay inside source coordinates and retain the cel part order', () => {
  for (const panel of sourcePanels) for (const point of panel.points) {
    assert.ok(point.x >= 0 && point.x <= WORLD && point.y >= 0 && point.y <= WORLD);
  }
  for (const arm of sourceArms) {
    for (const polygon of [arm.polygon, arm.solid]) {
      assert.ok(polygon.length >= 6 && polygon.length % 2 === 0);
      assert.ok(polygon.every(value => Number.isFinite(value) && value >= 0 && value <= WORLD));
    }
  }
  assert.deepEqual(sourceArms.map(arm => [arm.side, arm.group]), buildCels()[0].arms.map(arm => [arm.side, arm.group]));
  for (let index = 0; index < coreMask.length; index += 2) {
    assert.ok(coreMask[index] >= coreBounds.x && coreMask[index] <= coreBounds.x + coreBounds.width);
    assert.ok(coreMask[index + 1] >= coreBounds.y && coreMask[index + 1] <= coreBounds.y + coreBounds.height);
  }
  assert.ok(coreNucleus.x > coreBounds.x && coreNucleus.x < coreBounds.x + coreBounds.width);
  assert.ok(coreNucleus.y > coreBounds.y && coreNucleus.y < coreBounds.y + coreBounds.height);
});
