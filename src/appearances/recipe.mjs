import { createHash } from 'node:crypto';
import { recordId } from '../core/local-store.mjs';
import { exactKeys } from '../comparisons/assessment.mjs';
import { fail } from '../sources/errors.mjs';

const invalid = () => fail('appearance-recipe-invalid');
const shape = (value, keys) => exactKeys(value, keys, [], 'appearance-recipe-invalid');
const seedPattern = /^[0-9a-f]{64}$/;
const details = ['filament', 'forked-light', 'facet-light'];
const modes = ['normal', 'unseal', 'trueform'];
const treatments = ['neutral', 'good', 'bad'];
const artPack = {
  version: 'hangar-v4-mechanical-cels',
  sourceSha256: 'c52d86961576963e0cfcec1bad915fa8510d622c7d3d83ddba35e6e44db224dc',
  backgroundSha256: '926a3ef15b4aa80c85571d6c1658719e30032b4fce95a9127e07cab91a90f062'
};
// Versioned content. Weights affect a new discovery only; saved colors are read
// from the recipe and never resolved again from a potentially newer catalog.
const palettes = [
  { id: 'ice', weight: 5, colors: { core: '#c9f9ff', light: '#79dce8', metal: '#6d919b', dark: '#243d4a' } },
  { id: 'dawn', weight: 3, colors: { core: '#fff1d4', light: '#f0c281', metal: '#97836b', dark: '#443a32' } },
  { id: 'iris', weight: 2, colors: { core: '#f1e7ff', light: '#b9a4ed', metal: '#8d809e', dark: '#3b334c' } }
];
function assertSeed(seed) { if (typeof seed !== 'string' || !seedPattern.test(seed)) invalid(); }
function draw(seed, domain, limit) {
  // Rejection sampling avoids modulo bias, including for small weighted tables.
  const ceiling = Math.floor(0x100000000 / limit) * limit;
  for (let counter = 0; ; counter++) {
    const bytes = createHash('sha256').update(`unharness-appearance-selector/v1:${seed}:${domain}:${counter}`).digest();
    const value = bytes.readUInt32BE(0);
    if (value < ceiling) return value % limit;
  }
}
function palette(seed, domain = 'palette') {
  let choice = draw(seed, domain, palettes.reduce((n, p) => n + p.weight, 0));
  for (const { weight, ...value } of palettes) {
    if (choice < weight) return structuredClone(value);
    choice -= weight;
  }
  invalid();
}
function build(seed, color, detail, origin) {
  return { schemaVersion: 1, selectorVersion: 'weighted-sha256/v1', rendererVersion: 'mechanical-appearance/v1',
    seed, origin, artPack: { ...artPack }, body: 'mechanical-lattice', palette: color, details: detail,
    modes: [...modes], treatments: [...treatments] };
}
export function discoverRecipe(seed) {
  assertSeed(seed);
  return build(seed, palette(seed), details[draw(seed, 'detail', details.length)], 'prepared');
}
export function candidateRecipes(seed, parentRecipe) {
  assertSeed(seed); validateRecipe(parentRecipe);
  const offset = draw(seed, 'candidate-detail-order', details.length);
  return [0, 1, 2].map(slot => {
    const childSeed = createHash('sha256').update(`unharness-candidate/v1:${seed}:${slot}`).digest('hex');
    const value = build(childSeed, palette(childSeed), details[(slot + offset) % details.length], 'original');
    value.body = parentRecipe.body;
    value.artPack = structuredClone(parentRecipe.artPack);
    return value;
  });
}
export function validateRecipe(value) {
  try {
    // Validate plain JSON before reading properties; imported recipes never run
    // getters, proxies or executable authoring code.
    recordId('observation', value);
    shape(value, ['schemaVersion', 'selectorVersion', 'rendererVersion', 'seed', 'origin', 'artPack', 'body', 'palette', 'details', 'modes', 'treatments']);
    assertSeed(value.seed);
    if (value.schemaVersion !== 1 || value.selectorVersion !== 'weighted-sha256/v1' || value.rendererVersion !== 'mechanical-appearance/v1'
      || !['prepared', 'original'].includes(value.origin) || value.body !== 'mechanical-lattice' || !details.includes(value.details)) invalid();
    shape(value.artPack, ['version', 'sourceSha256', 'backgroundSha256']);
    if (Object.keys(artPack).some(k => value.artPack[k] !== artPack[k])) invalid();
    shape(value.palette, ['id', 'colors']);
    if (typeof value.palette.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(value.palette.id)) invalid();
    shape(value.palette.colors, ['core', 'light', 'metal', 'dark']);
    if (Object.values(value.palette.colors).some(c => typeof c !== 'string' || !/^#[0-9a-f]{6}$/.test(c))) invalid();
    for (const [values, allowed] of [[value.modes, modes], [value.treatments, treatments]]) {
      if (!Array.isArray(values) || !values.length || values.length > allowed.length
        || new Set(values).size !== values.length || values.some(v => !allowed.includes(v))) invalid();
    }
    return structuredClone(value);
  } catch { invalid(); }
}
export function appearanceRecipeId(value) {
  return recordId('observation', { kind: 'unharness-appearance-recipe', recipe: validateRecipe(value) });
}
