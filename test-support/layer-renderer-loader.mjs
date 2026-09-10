// Only this test process uses GPU/DOM doubles. Browser tests use actual Pixi.
import { readFile } from 'node:fs/promises';
const moduleText = source => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
export async function resolve(specifier, context, next) {
  if (specifier === 'pixi.js') return { url: new URL('./layer-pixi-double.mjs', import.meta.url).href, shortCircuit: true };
  if (specifier.endsWith('/pixi-csp') || specifier === './pixi-csp') return moduleText('export {};');
  if (specifier.endsWith('.png')) return moduleText(`export default ${JSON.stringify(specifier)};`);
  if (specifier === './appearance-drawing') return moduleText('export const appearanceDrawing = () => ({matrix: [], metalMatrix: [], lines: [], accentAlpha: 0});');
  if (specifier.endsWith('.json') && !context.importAttributes?.type)
    return moduleText('export default ' + await readFile(new URL(specifier, context.parentURL), 'utf8') + ';');
  if (specifier.startsWith('.') && !/\.[a-z]+$/.test(specifier)) return next(specifier + '.ts', context);
  return next(specifier, context);
}
