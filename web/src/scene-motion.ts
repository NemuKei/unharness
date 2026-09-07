import type { FixtureCase } from "./types";

const releaseLevel: Record<FixtureCase, number> = {
  baseline: 0,
  "manual-only": 1,
  "fixed-only": 2,
};
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => value * value * (3 - 2 * value);

/** Visual time only. This module has no configuration or verification authority. */
export function createReleaseMotion(initial: FixtureCase) {
  let from = releaseLevel[initial];
  let target = from;
  let startedAt = 0;
  let duration = 0;

  function sample(time: number) {
    const progress = duration === 0 ? 1 : clamp((time - startedAt) / duration);
    return {
      release: from + (target - from) * ease(progress),
      moving: progress < 1,
    };
  }

  return {
    sample,
    retarget(condition: FixtureCase, time: number) {
      const destination = releaseLevel[condition];
      if (destination === target) return;
      // Sample the displayed pose, not the previous target's canonical pose.
      from = sample(time).release;
      target = destination;
      startedAt = time;
      duration = Math.max(0.55, Math.abs(target - from) * 1.7);
    },
    finish() {
      from = target;
      duration = 0;
    },
  };
}
