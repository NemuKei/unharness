# Native Codex Skill configuration comment preservation

Checked on 2026-09-08 JST on native macOS arm64, Darwin 25.6.0, Node 24.20.0 and Codex runtime 0.153.4. This is configuration preparation evidence, not a desktop-loaded mode result.

## Problem and change

The previous owned-copy editor replaced the complete `skills.config` array through `config/batchWrite`. The native serializer could discard comments even on unselected entries. The preservation guard correctly rejected that result, but it prevented preparation of otherwise usable configurations.

The editor now uses `skills/config/write` for each selected path that needs changing. Initialization and the sole user configuration layer must identify its newly created private profile before any write. A selected path with duplicate entries and at least one enabled entry uses the previous version-guarded array operation, because the native path operation changes only the first matching entry. Already-disabled selections are left untouched.

Complete parsed configuration equality, comment placement, numeric metadata restrictions, size limits, fixed private errors and child/profile cleanup remain required. Native edits that discard selected-entry inline comments are still rejected. The existing read-only client cannot call either write method.

## Checks

- The native regression failed with the previous editor and passed after the change. It covers leading array comments, selected metadata, untouched and already-disabled entry comments, already-disabled duplicate comments during another change, every enabled duplicate, appended paths, malformed input, quoted hashes and exact no-op bytes.
- Review found an unnecessary array edit when selected duplicates were already disabled. A native synthetic regression reproduced the rejection; restricting the fallback to duplicates that need a change resolved it.
- `node --test`: 265 passed, 1 platform skip. The first sandboxed run could not listen on loopback; rerunning the same suite with local networking permitted passed. Following the final duplicate-condition refinement, the affected transform/RPC tests passed 35/35 and the native regression passed again.
- `native-user-sources-check.mjs`: owned-profile mode/favorite/checkpoint loop, protected values and project contents, supported uid/gid/mode/xattr metadata, independent edits, unsupported metadata, and interrupted-operation recovery passed.
- `npm run check`, `npm run build`, and `git diff --check` passed. No frontend behavior changed.
- A private temporary copy of the maintainer's current TOML accepted a candidate Skill disablement while the original configuration remained byte-identical. No configuration contents, backup, paths, or task transcript are included here. The real sources remain unregistered and unmodified by this check.

Reproduce the native synthetic checks with an explicitly selected native executable:

```text
node test-support/native-source-transforms-check.mjs <native-codex-executable>
node test-support/native-user-sources-check.mjs <native-codex-executable>
```

All native writes in these checks target newly owned temporary profiles. No model task or desktop restart was requested. `runtimeStateVerified` and `modeSwitchingVerified` remain false; Windows qualification is unchanged.
