# Build cards and X sharing

Agreed direction recorded on 2026-09-06. The maintainer approved making it easy to post an adopted original form to X, with Unharness free to use and no recurring operator service expense. Card rendering, candidate selection, and sharing are not implemented. This does not change the Codex-first delivery order or require an Unharness cloud service.

## The flow to share

Complete a comparable trial → meet an appearance-change condition → optionally create candidates → select and save one → preview a build card → save the image and open X's composer with editable text.

The adopted [appearance rule](personalization.md#choosing-a-form-and-limiting-remakes) is three candidates followed by one final choice. Creating or sharing art is optional. The user can save a card with prepared artwork too, but only a qualifying, evidence-backed result receives an achievement claim.

## The card

Lead with the selected entity and its loadout so the discovery is worth showing. Keep a short, readable record of what was learned:

- the user's chosen display name and selected form;
- the tested mode or favorite and app/model conditions;
- the task type, comparison scope, and a compact benefit statement supported by the recorded result;
- relevant quality/acceptance and efficiency observations, with run counts and the baseline needed to interpret a change;
- the observation date and whether the evidence is historical or current for the referenced configuration;
- an optional personal note and Unharness attribution.

Render values and captions from the comparison record. Generated artwork must not supply the numbers. A percentage improvement identifies its baseline and metric; unknown values are omitted or marked unknown, and samples remain explicitly labeled. Don't collapse independent quality and resource measurements into an invented strength score. If the selected public fields no longer support an achievement claim, simplify or omit that claim.

The export preview lets the user select public fields and edit display names. Do not automatically include private project names, local paths, raw instructions, memory, conversations, or secret configuration values. The exported card is an immutable view of its selected appearance and evidence; later runs do not rewrite a card already exported.

A card image is not a restorable favorite. A separately selected, sanitized configuration recipe may help others reproduce a comparison, but portable compatibility and permitted content must be checked. The base sharing flow does not upload that recipe or private evidence to a public host.

Start with a readable PNG and editable post text. A short release animation or before/after clip can be explored later. Keep useful conditions legible at a typical social-feed size; provide a text description of the image for the user to use as alt text.

## Initial X handoff

Offer an export preview with actions to save the card image and open X's posting screen. Pre-fill only the text, optional `#Unharness` hashtag, and an explicitly selected public URL. The author edits the draft, attaches the saved image, and posts in X. Provide copy-text/save-image fallbacks if opening the composer is blocked. Never put a local file path or the local app's URL into the public URL field.

[X's Web Intent documentation](https://docs.x.com/x-for-websites/post-button/guides/web-intent) lists text, URL, hashtag, and related-account parameters; it provides no local-image attachment parameter. Therefore the basic intent handoff cannot preattach the exported PNG. [The Web Intents overview](https://docs.x.com/x-for-websites/web-intents/overview) describes this route without a separate developer app authorization, although the author still uses their X account to publish.

The initial UX must say that the image is saved for attachment, not claim that an image-bearing post is already prepared inside X. Opening the composer is not evidence of a successful post; don't show “Posted” or invent a post URL from that action. A later integration may investigate media-aware OS/browser sharing only where it preserves the cost boundary and passes real macOS/Windows validation. A paid X API or hosted media service is not a dependency of the agreed flow. Do not promise automatic attachment on both operating systems before that work.

Only an explicit share action opens X. Adopting an appearance, completing a benchmark, or asking an AI to save a favorite does not publish or silently open a posting flow. No real post, account connection, or public upload was performed while recording this proposal.
