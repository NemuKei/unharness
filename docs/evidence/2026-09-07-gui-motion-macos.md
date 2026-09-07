# Local GUI motion and control clarity — macOS

Date: 2026-09-07. This follows the [first GUI check](2026-09-07-local-gui-macos.md).

## Scope

The built local GUI used the same registered synthetic store and fixture. The revision adds a layered scene, continuous idle motion, directional transitions and clearer lower controls. It does not extend configuration-management scope or desktop support.

## Automated checks

- `node --test`: 156 passed, zero failures or skips.
- `npm run check`: TypeScript and the strict-CSP Pixi check passed.
- `npm run build`: production build passed.
- Motion tests cover canonical poses, opening before lift, reverse order, retargeting from an intermediate pose, repeated selection and immediate settling.
- Asset checks verify retained source hashes, dimensions, crop bounds and mask confinement.

Independent review identified a stale local checkpoint in the primary undo after another client applied settings, and a lazy-load cancellation edge case. Both were corrected and reviewed again. The full checks above ran after those fixes.

The final full run also included the parallel Windows test-harness/documentation changes through `7f20f98`. All 156 tests passed on the Mac after integration, and the type/CSP check and build passed again. The served GUI source and asset hashes were unchanged by that integration.

## In-app browser observations

The built loopback GUI was exercised on the Mac in Codex's in-app browser.

| Check | Observed result |
| --- | --- |
| Idle scene | The body floats, light/charge and particles move, and exposed forms pulse with rotating halos. |
| Forward and reverse changes | The armor opens before the core rises; returning lowers and closes the same layers. |
| Rapid retargeting | Fixed → Manual → Normal selections remained in the transition state and settled at Normal without resetting through a separate portrait. |
| Recovery preview | Applying Manual and restoring its pre-change checkpoint returned the prepared condition and preview to Normal. |
| Two clients | Client A applied Manual; client B applied Fixed. After A refreshed, its primary undo returned to Manual, using B's pre-change checkpoint. |
| Browser reload | The accepted application and primary undo remained available while the same server stayed running. |
| Effects off | The actual Pixi ticker reported stopped and the selected pose remained visible. |
| Reduced motion | Emulating `prefers-reduced-motion: reduce` displayed the static-motion label and stopped the ticker. Removing the override resumed it. |
| Lower controls | Favorites and undo remained visible. The task UUID field was hidden initially and accessible after expanding development details. |
| Layout | The scene and lower controls were inspected at 1280 × 900 and 390 × 844. At the narrow width, document width remained 390 pixels with development details both closed and open. |

Screenshots were inspected during the session. Browser emulation and viewport overrides were reset. The fixture was returned to baseline, and the retained preview was left with effects on.

The final reload attached the canvas and started its ticker without an application exception. One inline-style CSP rejection came from Codex's `browser-page-preload.js` code, identified from its debugger stack/source, rather than the served application bundle. The app's strict policy was retained.

## Evidence boundary

These are source/test and local browser observations. Full `runtimeStateVerified` and `modeSwitchingVerified` remain false. This motion pass did not perform a new real desktop task, personal-setting control or Windows verification. The parallel [Windows GUI and source checks](2026-09-07-windows-baseline.md) and [first fresh-task observation](2026-09-07-windows-fresh-task.md) were retained during integration; they exercised the earlier scene. The hidden-tab pause is implemented through visibility events and active visual time; this pass did not measure background resource use or long-session performance.
