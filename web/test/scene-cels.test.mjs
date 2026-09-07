import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCels, selectCel, sourcePanels, CELS_PER_STAGE } from '../src/scene-cels.ts';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

test('every cel reuses rigid original armor pieces without stretching their 3D edges', () => {
  const cels = buildCels();
  assert.equal(cels.length, CELS_PER_STAGE * 2 + 1);
  for (const cel of cels) for (const [index, panel] of cel.panels.entries()) {
    const source = sourcePanels[index].points;
    assert.equal(panel.id, sourcePanels[index].id);
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      assert.ok(Math.abs(distance(panel.world[a], panel.world[b]) - distance(source[a], source[b])) < 1e-7);
    }
    panel.world.forEach((point, vertex) => assert.ok(Math.abs(distance(point, panel.backWorld[vertex]) - 16) < 1e-7));
    const [a, b, c] = panel.screen;
    assert.ok(Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) > 50);
  }
});

test('the sequence opens in stages before retracting the supports and lifting the core', () => {
  const cels = buildCels();
  const closed = cels[0];
  const opening = cels[12];
  const open = cels[CELS_PER_STAGE];
  const released = cels[CELS_PER_STAGE * 2];
  assert.equal(closed.core.alpha, 0);
  assert.equal(closed.panels[0].angle, 0);
  assert.notEqual(cels[4].panels[0].screen[0].x, closed.panels[0].screen[0].x);
  assert.ok(opening.panels[0].angle > opening.panels[2].angle);
  assert.ok(opening.core.alpha > 0);
  assert.equal(open.core.y, 375);
  assert.equal(open.arms[0].retreat, 0);
  assert.equal(released.core.y, 315);
  assert.ok(released.arms.every(arm => arm.retreat > 150));
});

test('closed cel maps each source triangle back to its original image coordinates', () => {
  const closed = buildCels()[0];
  closed.panels.forEach((panel, index) => panel.screen.forEach((point, vertex) => {
    assert.ok(Math.abs(point.x - sourcePanels[index].points[vertex].x) < 1e-9);
    assert.ok(Math.abs(point.y - sourcePanels[index].points[vertex].y) < 1e-9);
  }));
});

test('forward, reverse and interrupted travel select the same exact cel at the same position', () => {
  const cels = buildCels();
  const forward = Array.from({ length: 49 }, (_, index) => selectCel(cels, index / 24));
  const reverse = Array.from({ length: 49 }, (_, index) => selectCel(cels, (48 - index) / 24)).reverse();
  assert.deepEqual(forward, reverse);
  assert.equal(selectCel(cels, 0), cels[0]);
  assert.equal(selectCel(cels, 1), cels[24]);
  assert.equal(selectCel(cels, 2), cels[48]);
});
