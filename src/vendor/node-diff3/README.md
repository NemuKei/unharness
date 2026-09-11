# Offline frozen configuration merge

The unchanged `index.mjs` from [node-diff3](https://github.com/bhousel/node-diff3)
3.1.2 is bundled with its MIT license. It is the same implementation used by
the existing native-validated retained-settings merge. Frozen v3 restores use
it with the bundled typed TOML reader so Codex and `node_modules` are optional.

After `npm ci --ignore-scripts`, `node scripts/vendor-diff3.mjs --check` verifies
the upstream bytes. Regenerate only after reviewing the locked dependency.
Do not edit the vendor implementation directly.
