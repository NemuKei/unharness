# Local fixture GUI

This development interface connects the shared [loadout service](loadouts.md) to a browser with PixiJS artwork. It operates only on a generated, owned Codex fixture. Personal settings, full product modes, automatic task dispatch and performance comparisons are outside this slice. The [GUI contract](spec-gui.md) defines the evidence and HTTP boundaries.

## Build and start

Use Node.js 24+ in the checkout on either target OS:

```text
npm ci --ignore-scripts
npm run check
npm run build
npm run gui
```

Open the loopback URL printed by the last command. It creates a fresh private workspace below `.unharness/` with a record store, a synthetic desktop fixture and three saved conditions. The server uses an available port on `127.0.0.1`; it is not exposed to the LAN. The launch output includes local paths and `resumeArgv`: an argument array beginning with the absolute CLI entrypoint, intended to be passed to Node without a shell. Keep that output locally.

Each demo launch creates another workspace. To resume an existing store and its registered scope after stopping the server, use the store and scope values from the previous output while in the checkout:

```text
node bin/unharness.mjs gui --store "<store>" --scope "<scopeId>"
```

For programmatic resumption, pass `resumeArgv` as separate Node arguments (for example, `spawn(process.execPath, resumeArgv)` in Node). Do not join or evaluate the JSON array as shell text. This preserves Windows backslashes, spaces and metacharacters in paths. A failed setup retains allowlisted recovery coordinates when available; it does not delete a partial fixture or its store.

Add `--port <port>` when a fixed local port is useful. A demo can use an existing parent directory with `gui --demo --parent "<directory>"`. Use `gui --help` for the current syntax. Closing a browser tab does not restore or remove the fixture; stop the server in its terminal when finished. Favorites/checkpoints remain on disk.

## Save, apply and restore

1. Select a saved condition. The artwork is a preview; selecting it requests a change plan without applying it.
2. Review the changed sources and exact favorite version, then apply that version. The core captures the pre-change checkpoint and performs guarded restoration.
3. Read the prepared configuration separately from task confirmation. The three conditions are baseline, manual-only and fixed-only in the synthetic fixture; fixed-only does not establish complete TRUEFORM.
4. Save the current prepared configuration, optionally giving it a name. Saving preserves the versioned content; selecting a different preview does not change what gets saved.
5. Use the primary undo for the currently accepted application's pre-change checkpoint, or expand recovery history to choose an older checkpoint. A successful restore moves the preview back to that condition. Inspect conflicts instead of replacing independent edits. The original [CLI recovery](loadouts.md#recover-without-the-ai) remains available when the GUI or AI is unavailable.

Favorite/checkpoint histories use cursor pages. Continue loading when a page has a next cursor, including a page with no matching entries for the selected scope. Reopening the browser retains the server's active application. Restarting the server requires applying a saved version again to establish a fresh observation boundary; immutable application/observation records remain in the core store.

## Read the real project's sources

The optional **このPCのCodex設定** panel uses a different, explicitly selected context from the fixture controls. Append `--inspect-cwd <project>` to the existing GUI resume arguments, or use `npm run gui -- --inspect-cwd .` for a fresh demo. The native executable can be selected with `--codex`; neither value can be supplied by browser requests.

Click **Codex設定を読み取る** to collect a dated source overview. Additional instructions, Skills and hooks are shown first; retained memory, integration and policy information are collapsed. Counts include provider items and are not a release set. The [inventory guide](source-inventory.md) explains what was read, what is unknown, and how reconnection presents a changed target before another read. No personal setting is changed or registered as a favorite.

## Check a fresh Codex task

Expand **開発用の確認** to see the generated project directory and the existing short READY request. These are diagnostic controls, not the intended everyday product workflow. Add that directory as a local Codex project, start a fresh local task there, and send the displayed request. The GUI does not dispatch it or choose an AI model.

Enter that task's UUID in the recording form. The server searches the standard local Codex session filenames for that ID only and uses the existing bounded record projection. It does not accept a browser-supplied file path or return raw chat text.

- `matched-record`: the qualified recording contains the expected fixture markers for the exact saved version/application.
- `not-matched-record`: the recording qualifies as a candidate but its fixture markers differ.
- `unqualified-record`: the recording is old, from another project, a known fork or otherwise does not meet the fresh-task boundary.

All three results leave full `runtimeStateVerified` and `modeSwitchingVerified` false. A match is evidence about recorded fixture input. The [first native Windows GUI observation](evidence/2026-09-07-windows-fresh-task.md) qualified as fresh but was `not-matched-record`: it does not confirm the baseline or establish why the Skill catalog/body were absent. The follow-up refresh and reapplication use a new receipt before another task. If settings changed since application, apply the intended saved version again before observing another fresh task. A stale restored Skill catalog is a known desktop limitation; [fixture refresh](desktop-observation.md) is an explicit diagnostic, not an automatic GUI guarantee.

## Display and data

With effects on, foreground parts float gently, light pulses and small particles drift against fixed architecture. Changing the preview draws an ordered sequence from the same armor and core: plates open around their seams, supports withdraw and the core rises. Direct changes, reverse travel and interrupted selections use the same cels. Effects off and reduced motion show the canonical selected cel; hidden tabs pause animation. The [bundled artwork](gui-artwork.md) and display preferences do not change a loadout, eligibility or verification status. Core controls remain usable if graphics initialization fails.

The fully released visual adds stronger white-blue radiance around the AI entity, with a slow pulse. This extra light follows the original lattice shape and is removed when effects are off or reduced motion is active.

Private workspace paths are shown locally for task creation and recovery. Source bodies, marker seeds and raw recordings are not API responses. The server validates its Host, origin, client header and per-launch token and serves only built UI assets. No cloud backend, runtime CDN, model API or X integration is required.

The GUI and its current evidence are development work. The [integrated Windows baseline](evidence/2026-09-07-windows-baseline.md) covers a normal-viewport in-app-browser smoke for select, apply, save, checkpoint restore and local artwork. The [first Windows fresh task](evidence/2026-09-07-windows-fresh-task.md) exercises UUID observation but does not match the baseline. Browser restart, effects-off, narrow layout and a matching fresh-task association remain unverified. Complete desktop mode support still needs verification under [the compatibility criteria](compatibility.md).
