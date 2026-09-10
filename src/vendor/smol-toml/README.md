# Offline TOML reader

The unchanged parsing files from [smol-toml](https://github.com/squirrelchat/smol-toml) 1.8.0 are bundled under its BSD-3-Clause license. The frozen configuration guard must run with Node.js even when Codex, YAML and `node_modules` are unavailable. This parser only reads saved TOML; native Codex still validates and prepares configuration edits.

The package is pinned in the development dependencies. After `npm ci --ignore-scripts`, run `node scripts/vendor-toml.mjs --check` to verify the exact upstream bytes. Regenerate with `node scripts/vendor-toml.mjs` only after reviewing a dependency update. `manifest.json` records each copied file's SHA-256. Do not edit the vendor files directly.
