# Build cards and X sharing

Sharing direction recorded on 2026-09-06 and refined on 2026-09-09 for freely selected layered artwork. The maintainer approved making it easy to post an adopted original form to X, with Unharness free to use and no recurring operator service expense. Card rendering and sharing remain planned work; reusable artwork packs and public discovery are later design work after local creation/save/reuse. This does not change the Codex-first delivery order or require an Unharness cloud service.

## The flow to share

Select prepared artwork or a locally saved original → preview an appearance card → optionally add a separately supported comparison summary → copy its PNG to the clipboard and open X's composer with editable text and a configured public link → paste and post in X.

The [appearance contract](personalization.md#creation-and-revisions) allows voluntary creation, revision and selection without performance gates or a fixed candidate count. An appearance-only card needs no comparison. Any optional performance claim still requires applicable evidence; artwork itself never supplies that claim.

## The card

An appearance-only card leads with the composed artwork and optional public name/author attribution. It does not require a loadout, task or performance record. If the user chooses to include a comparison, add a short, readable record of what was learned:

- the user's chosen display name and selected form;
- the tested mode or favorite and app/model conditions;
- the task type, comparison scope, and a compact benefit statement supported by the recorded result;
- relevant quality/acceptance and efficiency observations, with run counts and the baseline needed to interpret a change;
- the observation date and whether the evidence is historical or current for the referenced configuration;
- an optional personal note and Unharness attribution.

Render values and captions from the comparison record. Generated artwork must not supply the numbers. A percentage improvement identifies its baseline and metric; unknown values are omitted or marked unknown, and samples remain explicitly labeled. Don't collapse independent quality and resource measurements into an invented strength score. If the selected public fields no longer support an achievement claim, simplify or omit that claim.

The export preview lets the user select public fields and edit display names. Do not automatically include private project names, local paths, raw instructions, memory, conversations, or secret configuration values. The exported card is an immutable view of its selected appearance and evidence; later runs do not rewrite a card already exported.

An appearance can come from the reusable collection. The chosen artwork is independent of the assessment. A current-result card reports that result in separate numbers/text, including adverse or unknown outcomes, without forcing a different image. A historical card identifies the selected result's historical context and does not certify the current loadout. Unmatched everyday runs must not be presented as a controlled performance improvement.

A card image is not a restorable favorite. A separately selected, sanitized configuration recipe may help others reproduce a comparison, but portable compatibility and permitted content must be checked. The base sharing flow does not upload that recipe or private evidence to a public host.

Start with a readable PNG and editable post text. A short release animation or before/after clip can be explored later. Keep useful conditions legible at a typical social-feed size; provide a text description of the image for the user to use as alt text.

## Later reusable artwork sharing

After local creation, import and reuse work, consider a pack containing the selected entity, restraint and background images, template version, placement data, author information and declared reuse conditions. Let a recipient inspect and preview it before saving a local copy. Unknown templates or missing assets do not authorize replacing the recipient's current work.

Keep image/card sharing separate from reusable parts and from a possible public gallery. A gallery, public hosting, submission handling and running costs need their own later decision. Packs must not contain executable code, Skill bodies, private harness configuration, memory, raw chats, credentials or local paths. Image cards and future pack metadata can include a small reviewed author/site attribution; the actual name and URL must be supplied before publication.

## Initial X handoff

The maintainer accepted the earlier feasibility limits and chose a primary action such as “画像をコピーしてXへ”. The intended supported-browser flow is:

1. Prepare the card PNG locally while showing the export preview, before the share click.
2. On the user's click, copy the PNG image bytes to the clipboard and open X's posting screen with the editable template text and Unharness's public OSS URL.
3. Let the author paste the image with Command+V on macOS or Ctrl+V on Windows, edit the text/alt text as desired, and publish in X.

The clipboard contains the image, not the filename or image URL. Pass the post text and repository URL as encoded Web Intent parameters; do not follow the image write with a text-clipboard write that would replace it. Keep image-copy and composer-opening outcomes separate. Show “画像をコピーしました。Xで貼り付けてください” only after the clipboard write succeeds, and never describe the image as already attached inside X.

Keep “画像を保存” as a local fallback for unsupported clipboard access, permission denial, or a failed paste. If composer opening is blocked, preserve the prepared card and provide an explicit open-X link. A separate copy-text fallback is available when requested, with clear behavior that it replaces clipboard content. Do not automatically overwrite the copied image to provide that fallback.

Browser clipboard writing requires a supported secure context and applicable interaction/permission conditions. [Clipboard.write](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write) supports PNG data on supporting browsers, and [window.open](https://developer.mozilla.org/en-US/docs/Web/API/Window/open) is subject to user-gesture and popup rules. Pre-rendering alone does not guarantee both operations succeed in one click: implementation must verify activation/focus behavior, asynchronous completion, and fallback behavior in the supported browsers on both OSes. An AI request can prepare the share preview; it must not claim that a background request performed a browser clipboard write without observing the actual result.

## Template text and public links

Use a short editable template, for example:

```text
Unharnessでハーネスを試着。
今回の装備：{公開用の装備名}
{共有する比較結果・任意}

無料OSS：{公開リポジトリURL}
#Unharness
```

These braces describe template fields, not text to ship unchanged. Include only selected public names and a benefit statement justified by the exported comparison. Omit optional empty lines and keep the actual composed post within X's current text limit, accounting for URLs and hashtags. Keep the OSS link in the default public-release template while allowing the author to edit the final draft.

The canonical public repository URL belongs to project release metadata. Development has a private Git remote, but no public repository URL has been selected for the release. Do not expose the private remote as a public sharing destination or populate the template with a local path. Until an approved public URL is available, omit that line from usable drafts and identify the missing release metadata in development. Never use the local app's location as a default sharing URL.

[X's Web Intent documentation](https://docs.x.com/x-for-websites/post-button/guides/web-intent) lists text, URL, hashtag, and related-account parameters; it provides no local-image attachment parameter. Therefore the basic intent handoff cannot preattach the exported PNG. [The Web Intents overview](https://docs.x.com/x-for-websites/web-intents/overview) describes this route without a separate developer app authorization, although the author still uses their X account to publish.

The clipboard route still requires the author to paste the image inside X; the Web Intent does not attach it. Opening the composer is not evidence of a successful post; don't show “Posted” or invent a post URL from that action. A paid X API, media-upload service, or Unharness-operated server is not needed for the agreed flow. Clipboard writing and paste into X remain real macOS/Windows/browser acceptance checks, not completed support claims.

Only an explicit share action opens X. Adopting an appearance, completing a benchmark, or asking an AI to save a favorite does not publish or silently open a posting flow. No real post, account connection, or public upload was performed while recording this proposal.
