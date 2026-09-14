# Guided product entry — 2026-09-14

Scope: the accepted bilingual entrance, synthetic guided demo, real registered
workbench, local recovery and read-only update discovery. No personal profile
or public deployment is changed by the local checks below.

## Implementation and browser checks

The shared entry constructs a Codex draft with only `mode=codex` and `prompt`.
Multilingual URL round-trips preserve reserved characters. The startup request
branches from actual installation state; missing tools do not imply uninstalled.
Language is independent of mode, reviewed plans, source IDs and entered artwork
text. The real public connection and operation controller remain in place.

Type/CSP, both product builds and the separate guided build pass. Built Chrome
checks cover the published-entry contract, language/selection retention, clipboard
fallback, local source review and independent recovery. The focused 107-case run
passed 105; the remaining accessibility selector and stale-client test timing
were corrected and both passed on recheck. The full final run is still pending.

Reviewed screenshots include the English local mode/plan at 1440×1050, comparison
history at 390×844, and independent recovery at 390px. The original artwork and
prepared/preview distinction remain visible. No horizontal overflow was found.

An independent code review found a test assertion inside the fake fetch callback
that production intentionally catches. The request URL/options are now captured
there and asserted outside the catch boundary. The update tests also reject
malformed version/source metadata rather than accepting string coercion.

The first combined run exposed lost spaces in translated labels and an unsupported
local language query. Original label spacing was restored. The local server now
accepts only the two display-language queries on its HTML root. Successful v2
redemption advertises support in a response header, so older installed servers
keep query-free local links. Late advertisements cannot affect another connection.

## Native source replacement observation

Codex CLI 0.153.4 was exercised with two minimal metadata-only releases in a new
synthetic profile. Registering another local path under the same marketplace
name failed; installing again still returned the old version. Removing that
source registration, adding the selected replacement and installing returned the
new version. The new install deleted the old cache. Re-registering the preserved
old source restored the old version, with unrelated fixture configuration intact.
No real profile, credentials, model calls or user records were used. This is
source/cache evidence, not full-distribution or Desktop update qualification.

## Publication boundary

The published catalog remains 0.0.9 until a verified replacement archive is
published. A source build is not a new installed MCP, a fresh-task Skill check,
a native draft handoff or a deployed HTTPS page. The earlier user-confirmed
Mac prefill is documented in [the concept evidence](../guided-entry-preview.md).
