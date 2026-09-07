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

/** The core can rise only after the shell is open; reversing uses the same path. */
export function releasePose(release: number) {
  const open = ease(clamp(release));
  const rise = ease(clamp(release - 1));
  return {
    open,
    rise,
    shellX: 72 * open + 38 * rise,
    shellY: 112 * rise,
    shellRotation: 0.08 * open + 0.32 * rise,
    shellScale: 1 - 0.17 * rise,
    coreY: 0 - 125 * rise,
    coreScale: 1 + 0.1 * rise,
    coreOpacity: open,
    haloOpacity: 0.18 * open + 0.58 * rise,
  };
}
