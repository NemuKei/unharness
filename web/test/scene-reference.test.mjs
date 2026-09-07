import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceField, referenceLayers, updateReferencePositions } from '../src/scene-reference.ts';

const side = 49;
const fields = Array.from({ length: side * side }, (_, index) =>
  referenceField(index % side * 724 / (side - 1), Math.floor(index / side) * 724 / (side - 1)));
const positions = new Float32Array(fields.length * 2);

test('each settled reference keeps every source coordinate unchanged with effects off', () => {
  for (let frame = 0; frame < 3; frame++) {
    assert.deepEqual(referenceLayers(frame), [{ frame, alpha: 1 }]);
    updateReferencePositions(fields, positions, frame, frame, 47, false);
    fields.forEach((field, index) => {
      assert.equal(positions[index * 2], Math.fround(field.x));
      assert.equal(positions[index * 2 + 1], Math.fround(field.y));
    });
  }
});

test('transitions use adjacent source states and never expose the opposite end portrait', () => {
  for (const release of [0.4, 0.6, 1.4, 1.6]) {
    const layers = referenceLayers(release);
    assert.equal(layers.length, 2);
    assert.equal(layers[0].frame, Math.floor(release));
    assert.equal(layers[0].alpha, 1);
    assert.equal(layers[1].frame, Math.ceil(release));
    assert.ok(layers[1].alpha > 0 && layers[1].alpha < 1);
  }
  assert.deepEqual(referenceLayers(0.2), [{ frame: 0, alpha: 1 }]);
  assert.deepEqual(referenceLayers(1.8), [{ frame: 2, alpha: 1 }]);
});

test('visible scene meshes retain their boundaries and do not fold during travel or idle motion', () => {
  const area = (a, b, c) => (positions[b * 2] - positions[a * 2]) * (positions[c * 2 + 1] - positions[a * 2 + 1])
    - (positions[b * 2 + 1] - positions[a * 2 + 1]) * (positions[c * 2] - positions[a * 2]);
  for (let step = 0; step <= 40; step++) {
    const release = step / 20;
    for (const { frame } of referenceLayers(release)) {
      for (const time of [0, 2, 7, 13]) {
        updateReferencePositions(fields, positions, frame, release, time, true);
        fields.forEach((field, index) => {
          if (field.x === 0 || field.x === 724 || field.y === 0 || field.y === 724) {
            assert.equal(positions[index * 2], Math.fround(field.x));
            assert.equal(positions[index * 2 + 1], Math.fround(field.y));
          }
        });
        for (let y = 0; y < side - 1; y++) for (let x = 0; x < side - 1; x++) {
          const a = y * side + x;
          assert.ok(area(a, a + 1, a + side) > 0, `first triangle at ${frame}/${release}/${time}/${x}/${y}`);
          assert.ok(area(a + 1, a + side + 1, a + side) > 0, `second triangle at ${frame}/${release}/${time}/${x}/${y}`);
        }
      }
    }
  }
});

test('idle motion moves the entity while effects off keeps the same static reference', () => {
  for (const frame of [0, 1, 2]) {
    updateReferencePositions(fields, positions, frame, frame, 0, true);
    const before = positions.slice();
    updateReferencePositions(fields, positions, frame, frame, 2, true);
    assert.notDeepEqual(positions, before);
    updateReferencePositions(fields, positions, frame, frame, 2, false);
    const staticPose = positions.slice();
    updateReferencePositions(fields, positions, frame, frame, 200, false);
    assert.deepEqual(positions, staticPose);
  }
});
