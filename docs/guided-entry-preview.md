# Guided entry: interactive screen concept

This local prototype combines the agreed AI navigation, GitHub entrance and
Japanese/English UI. It is a review surface, not the published product or an
implementation of automatic updates.

## Open the concept

Use the repository's locked dependencies and Node.js 24+:

~~~text
npm ci --ignore-scripts
npm run check
npm run build:guided-preview
npm run preview:guided
~~~

The preview binds to loopback. Its separate entry is prototype/index.html,
with UI in web/src/prototype/. Build output is ignored under
local-evidence/guided-preview-build/. Normal local and public production builds
do not include this entry.

## Review the journey

1. **Introduction:** the existing world, artwork and renderer remain. The main
   action opens an AI-guided sample; installation and already-installed use
   have separate entrances. Header links expose the guide, installation,
   language and the actual public GitHub repository.
2. **First time:** review synthetic source groups, confirm the sample targets,
   keep sample Normal and inspect TRUEFORM/UNSEAL suggestions. Preview selection
   and the sample prepared mode are different states.
3. **Update available:** the sample starts at 0.0.8 and offers the published
   0.0.9 changes. Deferring keeps the earlier sample version. Continuing shows
   preparation, the remaining reload/runtime check, then a simulated completion.
4. **Already set up:** keep sample Normal and go directly to previewing and
   preparing a mode. The optional Skill-content review stays separate.
5. **Installation:** show the qualified Apple Silicon Mac/Codex target, copy an
   installation request and continue to the first-time guide. The copied request
   carries the release URL, digest, distribution identity and source from the
   existing siteConfig; platform limitations remain visible.

Language changes preserve the current page, sample stage, confirmation,
selected and prepared modes, and appearance. Only the language preference
persists across reloads, under a prototype-specific browser key. Reloading
starts a fresh sample rather than claiming persistent configuration state.

## Real and simulated actions

All state shown in the concept is synthetic. There is no local configuration
controller, pairing, WebMCP registration, update download, model invocation,
source registration or saved-data write. The static entry restricts script and
connection origins to itself. Its persistent concept banner identifies this
boundary throughout the flow.

GitHub, published download and release links are real. Clipboard operations are
real and include a selectable fallback. Copying never sends the request. The
next-task request explicitly tells the receiving AI to read real state first,
because this concept did not prepare a mode.

The existing Hangar component accepts an optional locale; its Japanese
default and renderer lifecycle are unchanged. Appearance selection and effects
remain independent from sample mode preparation.

## Before product integration

- Implement authoritative installed/running-version reporting and bounded
  update discovery before making live update claims.
- Qualify the update, reload/restart and new-task handoff against the actual
  Codex version; changing files alone is not runtime verification.
- Route state-based suggestions through existing management/setup operations.
  Preserve registration, conflict, saved-version and independent recovery rules.
- Keep Skill-content editing separate from source usage and provider updates.
- Translate the remaining real connected/local product screens and handoffs
  before claiming full English product support.
- Keep the approved public build and Mac package unchanged until their separate
  release/deployment step is requested.

The reference was the [Akari Video public demo](https://akari.video/#demo):
clear source/language links and an understandable request-to-result
demonstration. No artwork, source code, installation script or policy was
copied from that product.

## Verification checkpoint

On 2026-09-14, type/CSP checks, the separate prototype build and both existing
production builds passed. The existing public-entry browser regression checks
also passed. In the actual in-app browser, the first-time confirmation gate,
Normal/preview/prepared-state separation, update deferral, reload/completion
steps, returning flow, language and appearance retention, English installation
request, clipboard success and Escape dismissal were checked. Layout was
inspected at 1440px, 651px and 390px without horizontal overflow. No browser
errors or warnings were reported for the exercised flow. Clipboard failure
handling is present but was not forced in this checkpoint.
