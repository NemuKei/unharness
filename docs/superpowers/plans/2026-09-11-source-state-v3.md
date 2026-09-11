# Source-state v3 implementation plan

The user adopted ordinary Skill disabled/manual/automatic states and optional
whole-plugin disablement on 2026-09-11. All goal-related implementation,
verification and publication gates are already authorized. Real registration
still requires an identified target and confirmed optional role. The normative
contract is [source states](../../spec-mode-inheritance.md).

After native testing, the maintainer accepted retaining official plugins and
completing the Mac version within the ordinary-Skill/instruction scope. The
[remote-plugin limit](../../evidence/2026-09-11-remote-plugin-control-limit.md)
supersedes whole-plugin OFF as a Mac completion gate. Keep its historical
records and synthetic implementation, reject unsupported forward writes, and
make the retained scope explicit in the GUI, AI guidance and release.

## Approach

Split at the existing application/core boundary. Keep v1/v2 resolvers and
records readable; implement v3 as an explicit contract. Ordinary Skill state
compilation and plugin enablement are separate adapter operations, joining at
the registered snapshot/transaction service. Plugin inventory is read-only and
never grants file-edit authority over provider caches.

Reusing v2's manual-only meaning would silently change old saved versions.
A separate plugin-only store would split Normal and recovery ownership.
A versioned successor registration using the existing snapshot transaction
preserves one source preparation and its independent offline recovery route.

## 1. Pure state contract

- [x] Add bounded v3 ordinary Skill states and strict upward inheritance.
- [x] Derive plugin Normal/disabled states from base and additional sets,
      separately checking listing, optionality and whole-plugin capability.
- [x] Test mixed states, empty sets, disabled Normal, explicit Skill enablement,
      unknown IDs/provenance, duplicates and required controls; retain v1/v2.

## 2. Native adapter boundaries

- [x] Qualify selected plugin enablement edits on owned 0.153.4 profiles;
      preserve unrelated parsed config/comments and original files.
- [x] Add bounded native plugin discovery/provenance capture with stable local
      identity and feature projection; reject unsupported/managed sources.
- [x] Compile mixed Skill states through existing policy/native config helpers.
- [x] Extend retained partitioning by registered plugin enabled fields only.

## 3. Versioned registration and saved setup

- [x] Add record-only plugin enrollment and successor Normal/scope.
- [x] Freeze v3 proposals, inventory and paired snapshots with a new writer
      fence and interrupted-adoption cancellation; test actual old writers.
- [x] Preserve initial Normal, v1/v2 presets and old favorites/comparisons;
      adapt later-registered plugins using their saved Normal values.
- [x] Cover pending recovery, independent edits, stale content/version,
      additions, missing packages and Node-only restoration.

## 4. Shared entry points and product UI

- [x] Extend CLI, strict MCP, local HTTP and the common controller without
      exposing private paths/config bodies or arbitrary write targets.
- [x] Keep the three-mode main screen; show ordinary Skill state details,
      inheritance and whole-plugin impact in setup/review and AI handoff.
- [x] Verify shared receipts, lost/duplicate responses, context changes,
      keyboard use, narrow layout and the built Chrome interface.

## 5. Immutable candidate and native finish

- [x] Build/install an immutable 0.0.3 candidate including the Desktop-origin fix.
- [ ] Install and qualify 0.0.4 with control preflight and retained-plugin guidance.
- [ ] Qualify real optional plugin registration/control, initial AI consultation,
      fresh model tasks, manual use, comparisons, favorites, local artwork and
      independent offline recovery through the GUI and AI entry points.
- [ ] Complete required regression/review and exact candidate installation;
      update both READMEs and current availability.
- [ ] Publish a new matching immutable archive/site version; preserve 0.0.1.

The active goal remains the complete Mac Codex product journey. Neither an
empty plugin selection nor a synthetic positive case closes plugin qualification.
Claude Code and Windows continue in their accepted later phases.
