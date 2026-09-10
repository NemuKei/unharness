import { validAppearanceRecipe } from './appearances.ts';
import type { AppearanceRecipe, AppearanceTreatment } from './appearances';
import type { ColorMatrix } from 'pixi.js';

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
export function appearanceDrawing(recipe: AppearanceRecipe, treatment: AppearanceTreatment) {
  if (!validAppearanceRecipe(recipe) || !['neutral', 'good', 'bad'].includes(treatment)) throw new Error('appearance-render-invalid');
  const colors = recipe.palette.colors, gain = treatment === 'bad' ? 0.90 : treatment === 'good' ? 1.35 : 1.20;
  const core = rgb(colors.core), metal = rgb(treatment === 'bad' ? '#906b68' : colors.metal);
  const matrix = core.flatMap(c => [0.2126 * c * gain, 0.7152 * c * gain, 0.0722 * c * gain, 0, 0]);
  matrix.push(0, 0, 0, 1, 0);
  const metalMatrix = [0, 1, 2].flatMap(channel => [0, 1, 2, 3, 4].map(i => i === channel ? 0.84 + metal[channel] * 0.16 : 0));
  metalMatrix.push(0, 0, 0, 1, 0);
  const jitter = (slot: number) => parseInt(recipe.seed.slice(slot * 2, slot * 2 + 2), 16) % 5 - 2;
  const lines: number[][] = [];
  for (const side of [-1, 1]) {
    const x = side * (46 + jitter(0)), y = -71 + jitter(1);
    if (recipe.details === 'filament') {
      lines.push([x, y - 38, x + side * 12, y - 15, x + side * 18, y + 14]);
      lines.push([x - side * 4, y - 29, x + side * 8, y - 8]);
    } else if (recipe.details === 'forked-light') {
      lines.push([x, y + 19, x + side * 3, y - 3, x + side * 18, y - 22]);
      lines.push([x + side * 3, y - 3, x - side * 8, y - 24]);
      lines.push([side * 24, 21 + jitter(2), side * 36, 39, side * 30, 58]);
    } else {
      for (const shift of [-26, 10]) lines.push([x, y + shift - 8, x + side * 6, y + shift,
        x, y + shift + 10, x - side * 6, y + shift, x, y + shift - 8]);
    }
  }
  return { matrix: matrix as ColorMatrix, metalMatrix: metalMatrix as ColorMatrix, lines, detailColor: parseInt((treatment === 'bad' ? '#ce8d7a' : colors.light).slice(1), 16),
    accentColor: parseInt((treatment === 'bad' ? '#bf7568' : colors.light).slice(1), 16),
    accentAlpha: treatment === 'neutral' ? 0 : treatment === 'bad' ? 0.58 : 0.48 };
}
