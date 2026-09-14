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

Type/CSP, both product builds and the separate guided build pass. The final
combined run completed **1,366 tests: 1,365 passed, 0 failed, 1 skipped** (the
explicitly unqualified-platform guard) in 594 seconds. It includes the real
controllers, saved-version/recovery regressions and built Chrome checks for the
published entry, language/selection retention, clipboard fallback, source review,
artwork and independent recovery. The late-response test fixes the client in a
stale view while asserting that a second client's changed mode cannot be copied
into a handoff; background invalidation has its separate regression coverage.

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

## Full-distribution native update

On macOS 26.6.2 with native Codex CLI 0.153.4, a new isolated profile installed
the complete 0.0.9 distribution, saved synthetic Normal and prepared TRUEFORM.
Its source adapter was hermetic and handled the native TOML layout; no model
turn or personal profile was used. Native source replacement installed the full
0.0.10 candidate and removed the old cache while its previous MCP was still open.
The independent old recovery copy still passed full file verification.

The new packaged MCP started with version 0.0.10 and 66 tools, including
`check_updates`. Original Normal and prepared selected sources remained. Codex's
new marketplace path appeared as an expected retained-only conflict. Reviewing
and accepting that exact change recorded a new active Normal without changing
managed files; the original Normal remained immutable. Restoring Normal kept the
approved new marketplace source and exactly restored the selected sources.
Unrelated configuration values, the fixture comment and file metadata were
preserved. Reinstalling from the preserved 0.0.9 source also succeeded.

Before the catalog was deployed, the real fixed-URL check returned `unavailable`,
not current. This is native installation/MCP and synthetic registered-source
qualification. Host-selected fresh Desktop tasks and a user-profile update were
not performed by this check.

## Published distribution

The [0.0.10 Mac preview](https://github.com/NemuKei/unharness/releases/tag/v0.0.10)
was published on 2026-09-14 at 04:32:16 UTC. Its clean source is
`6ca76702fefc867a66416c8fa434256e99025d0c`. Assembly and standard Mac ZIP extraction
verified all 7,534 indexed files and executable modes.

- Archive: 106,252,502 bytes.
- SHA256: `6cb6b171af3f3f2c84aa923f65d72e96fa5978f88ea16a3e6271bacda2c364bd`.
- Distribution ID: `1cdca75fa41f38ee7d43f54aeb017d77647dad617dbcece4ca1794436f52a200`.

The final extracted archive passed the full native update/retention/rollback
sequence above. An anonymous HTTPS download matched its exact bytes/digest and
sidecar; the public tag resolves to the stated source. The static release catalog
now records that verified archive. The public site deployment remains a separate
step until its served assets are checked.

The earlier user-confirmed Mac prefill is documented in
[the concept evidence](../guided-entry-preview.md). A fresh native Desktop task
and the maintainer's personal installation were not changed by this release.
