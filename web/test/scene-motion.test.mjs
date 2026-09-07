import test from 'node:test';
import assert from 'node:assert/strict';
import { createReleaseMotion } from '../src/scene-motion.ts';

test('a mode change moves through intermediate poses and reaches its destination', () => {
  const motion = createReleaseMotion('baseline');
  motion.retarget('manual-only', 0);
  const middle = motion.sample(0.8);
  assert.ok(middle.release > 0 && middle.release < 1);
  assert.equal(middle.moving, true);
  assert.equal(motion.sample(5).release, 1);
  assert.equal(motion.sample(5).moving, false);
});

test('reverse and direct transitions start from the displayed release state', () => {
  const motion = createReleaseMotion('fixed-only');
  assert.equal(motion.sample(0).release, 2);
  motion.retarget('baseline', 0);
  const middle = motion.sample(1.2);
  assert.ok(middle.release > 1 && middle.release < 2);
  assert.equal(motion.sample(10).release, 0);
  motion.retarget('fixed-only', 10);
  assert.equal(motion.sample(10).release, 0);
  assert.equal(motion.sample(20).release, 2);
});

test('retargeting mid-transition preserves the exact visible pose without snapping', () => {
  const motion = createReleaseMotion('baseline');
  motion.retarget('fixed-only', 0);
  const before = motion.sample(0.9).release;
  motion.retarget('manual-only', 0.9);
  assert.equal(motion.sample(0.9).release, before);
  motion.retarget('baseline', 1.1);
  assert.ok(motion.sample(1.1).release > 0);
  assert.equal(motion.sample(8).release, 0);
});

test('reselecting the same target does not restart or lengthen the transition', () => {
  const motion = createReleaseMotion('baseline');
  motion.retarget('manual-only', 0);
  const before = motion.sample(0.7);
  motion.retarget('manual-only', 0.7);
  assert.deepEqual(motion.sample(0.7), before);
  assert.equal(motion.sample(1.8).moving, false);
});

test('effects off and initial load can settle directly on a stable canonical pose', () => {
  const motion = createReleaseMotion('baseline');
  motion.retarget('fixed-only', 0);
  motion.finish();
  assert.deepEqual(motion.sample(0), { release: 2, moving: false });
  assert.equal(motion.sample(100).release, 2);
  motion.retarget('manual-only', 100);
  motion.finish();
  assert.equal(motion.sample(100).release, 1);
});
