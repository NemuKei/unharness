const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const windowWeight = (value: number, start: number, fullStart: number, fullEnd: number, end: number) =>
  smooth((value - start) / (fullStart - start)) * smooth((end - value) / (end - fullEnd));

export function referenceLayers(release: number) {
  const value = Math.max(0, Math.min(2, release));
  const frame = Math.floor(value);
  const fraction = value - frame;
  if (fraction === 0) return [{ frame, alpha: 1 }];
  const alpha = smooth((fraction - 0.3) / 0.4);
  if (alpha === 0) return [{ frame, alpha: 1 }];
  if (alpha === 1) return [{ frame: frame + 1, alpha: 1 }];
  return [{ frame, alpha: 1 }, { frame: frame + 1, alpha }];
}

/** Fields describe where the supplied painting can move, never replacement art. */
export function referenceField(x: number, y: number) {
  const dx = x - 362;
  const distance = Math.abs(dx);
  const inside = windowWeight(x, 75, 215, 509, 649) * windowWeight(y, 15, 140, 555, 709);
  const core = (1 - smooth((distance - 62) / 125)) * windowWeight(y, 15, 135, 495, 655);
  const armor = smooth((distance - 45) / 115) * inside;
  return { x, y, dx, inside, core, armor };
}
export type ReferenceField = ReturnType<typeof referenceField>;

/** At each canonical state with effects off this is exactly the source image. */
export function updateReferencePositions(
  fields: readonly ReferenceField[], output: Float32Array,
  frame: number, release: number, time: number, effects: boolean,
) {
  const current = releasePose(release);
  const source = releasePose(frame);
  const openDelta = current.open - source.open;
  const riseDelta = current.rise - source.rise;
  const openingStretch = (1 + current.open * 0.33) / (1 + source.open * 0.33) - 1;
  const bob = effects ? Math.sin(time * 0.85) * 4.5 : 0;
  const sway = effects ? Math.sin(time * 0.47) * 1.5 : 0;
  const breathe = effects ? Math.sin(time * 1.25) * 0.009 : 0;
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index];
    const idle = frame === 2 ? field.core : field.inside;
    const armorX = Math.sign(field.dx) * (36 * openDelta + 10 * riseDelta) * field.armor;
    const armorY = 68 * riseDelta * field.armor + (field.y - 375) * openingStretch * field.inside;
    output[index * 2] = field.x + armorX + sway * idle + field.dx * breathe * field.core;
    output[index * 2 + 1] = field.y + armorY - 64 * riseDelta * field.core + bob * idle;
  }
}
import { releasePose } from "./scene-motion.ts";
