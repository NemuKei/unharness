// Run separately: node --disallow-code-generation-from-strings web/checks/pixi-csp.check.mjs
// This frontend check needs installed packages; the ordinary Node runtime suite does not.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
await import("../src/pixi-csp.ts");
const pixiLib = dirname(fileURLToPath(import.meta.resolve("pixi.js")));
const { AbstractRenderer } = await import(
  pathToFileURL(
    resolve(pixiLib, "rendering/renderers/shared/system/AbstractRenderer.mjs"),
  )
);
assert.doesNotThrow(
  () => AbstractRenderer.prototype._unsafeEvalCheck.call({}),
  "Pixi must initialize when dynamic code generation is blocked",
);
const { GlUniformGroupSystem } = await import(
  pathToFileURL(
    resolve(pixiLib, "rendering/renderers/gl/shader/GlUniformGroupSystem.mjs"),
  )
);
assert.equal(
  GlUniformGroupSystem.prototype._generateUniformsSync.name,
  "generateUniformsSyncPolyfill",
  "Shader uniform setup must use the static CSP polyfill",
);
console.log(
  "PASS: Pixi renderer guard and uniform synchronizer use the CSP-compatible path.",
);
