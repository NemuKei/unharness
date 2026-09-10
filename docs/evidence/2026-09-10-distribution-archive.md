# Mac distribution archive checkpoint

2026-09-10, macOS arm64, Node.js 24.20.0. This is an unpublished packaging checkpoint, not the final Mac release.

The [package builder](../plugin-package.md) assembled clean source `ba64cebbdc2a17179b13a6281668f75fb35dc668` as version `0.0.1`. Its distribution identity is `d6ea660b00ceaa04d3c9ffe701a5862f3d8754463963336291077ee2be305c10`, covering 7,396 regular files plus the manifest itself.

Apple's `ditto` created `unharness-0.0.1-macos-arm64.zip` with one `unharness/` root, without resource forks or extended-attribute metadata. The ZIP is 92,202,794 bytes; SHA256 is `28328782fcfcd43b128d8877c385aa2cb22914eecfc12480f72d18000cb4f563`. It contains 7,397 regular files. Entry names have no duplicates, traversal components, `.DS_Store` or `__MACOSX` payload. The two launch executables retain their executable bits.

A new directory was populated by ordinary ZIP extraction. The distribution reader verified the same complete manifest and identity afterward, including file contents and executable status. The extracted official Node binary passed strict code-signature verification, and the extracted bundled launcher returned its help successfully. Plugin validation and all three Skill validators passed on the extracted package.

The license audit found one missing upstream notice in the locked colord npm package. The [exact-version supplement](../dependency-notices.md) is now present in the package and in both browser builds. Type/CSP checks and both builds passed; eight notice/distribution checks passed with no skips, including two fresh real browser builds and rejection of missing, empty or wrong-version notices.

This does not test an Internet download, downloaded-file quarantine behavior, native installation of this ZIP, the public domain, or model-driven onboarding. The package still uses the earlier public-connection client; the v2 server/client integration will require a new final candidate. The source repository and archive remain private. Git history, publication targets and the final release artifacts require the maintainer's separate publication approval.
