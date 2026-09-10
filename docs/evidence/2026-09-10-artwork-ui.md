# Local artwork UI and card evidence

2026-09-10, macOS arm64, Node.js 24.20.0, locked dependencies and the built local/public interfaces. This extends the [local authoring and renderer evidence](2026-09-10-artwork-authoring.md).

## Automated checks

TypeScript, the existing strict Pixi CSP check and both builds pass on an exact staged export. Its combined export, appearance-card, appearance-UI, AI-update, public-entry/workbench, local-connection, comparison, replay and starting-condition suites pass **50 checks, 0 failures, 0 skips**. The count includes pure and HTTP checks as well as actual Chrome cases; it is not 50 native Desktop journeys. All 216 relative links in the changed Markdown documents resolve to tracked staged targets.

The tests cover empty-evidence creation prompts, clipboard-text refusal, narrow layout and Escape; entity and complete 13-part import; three real composed previews before saving; reload and old-version selection; one saved version after an accepted request loses its response; damaged-image isolation; rejection of a response that describes other requested parts; and unchanged registered source files. A read that crosses a same-port replacement cannot accept the new context. The earlier UI candidate fails that same delayed-bootstrap counterexample and posts reads into the replacement context; the corrected candidate keeps controls unconfirmed until explicit refresh. Existing user-initiated comparison/replay context-reset behavior stays intact.

The card cases decode the actual downloaded 1200×820 PNG, check public text and alt text, compare its SHA256 with the PNG bytes passed to the clipboard boundary, and verify the encoded X intent. Clipboard/popup failures, long Japanese drafts, canvas readback failure and narrow layout have explicit fallbacks. Automated clipboard and popup outcomes are synthetic adapters; they do not prove an actual OS clipboard write or an X upload. Screenshots and the exported synthetic card were inspected outside the repository.

## Actual Codex in-app browser

Codex desktop 26.903.61454 (8378), with native CLI 0.153.4, displayed the built interface at its natural 1280×720 viewport. The local server used a newly owned synthetic source profile and a standard-material layered version; this was not a personal configuration or a model task.

The real browser rendered the three-pose card with edited public text and saved `unharness-appearance.png`. The resulting file was 563,814 bytes, 1200×820 pixels, SHA256 `050beec29839ed27966c5ee30ea4c0825b2c6959acf176f161d931f6a4582484`; it was decoded and visually inspected. The PNG clipboard write completed in the page, and X opened with the exact editable confirmation text. X initially requested login, which the user completed. No post was submitted.

Automated paste could not use the page's OS clipboard image because Browser Use's virtual clipboard was empty. Computer Use separately refused control of the Codex app for safety reasons; no alternative native automation or security bypass was used. The user was asked to perform Command+V for the final attachment check. That attachment is not yet verified in this evidence record.

After these native card actions the owned source remained Normal at revision 0, with no conflict or pending recovery; artwork remained at its initial revision 1 with two items. Public HTTPS image permissions, a complete fresh native installation/authoring/comparison journey and the final public package remain separate work.
