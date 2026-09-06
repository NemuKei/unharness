# Architecture boundaries

This document records the agreed boundaries for implementation, not an implemented architecture. No language, framework, or transport details beyond the proposed AI connection have been locked in.

## Shared local core

The web UI and an MCP connection (tools an AI can call) invoke the same operations. The core owns configuration identities, source inventory, versioned favorites, mode policies, change plans, recovery records, experiment conditions, and operation state.

The AI translates a user's request into a registered operation. Filesystem discovery, configuration edits, and restoration are deterministic code. The core must also be callable without the AI so that disabling optional harness elements cannot remove the recovery mechanism.

The core publishes operation events. An open UI reflects them and can animate them; closing the UI or turning effects off cannot change the transaction.

## Application integration boundary

Codex and Claude Code each have an adapter responsible for:

- discovering applicable sources and their precedence;
- reporting what can be controlled and what can be verified;
- mapping the shared mode intent to application-specific settings;
- preparing and applying changes within the selected scope;
- arranging or explaining a fresh desktop task and any restart;
- verifying configuration and observable runtime state;
- restoring application-specific changes and reporting conflicts.

Keep app-specific flags, file formats, startup behavior, and runtime evidence out of shared favorite and comparison logic. Do not simulate Claude Code support with a renamed Codex adapter or by assuming CLI behavior matches the desktop app.

An adapter capability report must distinguish controllable, observable, unsupported, and unknown. An unsupported required part of Zero prevents claiming that Zero has been applied.

## OS boundary

macOS and Windows differ in path handling, home and application-data discovery, environment inheritance, process launch, filesystem locking, permissions, links, and replacement semantics. Keep these operations behind a small tested boundary.

Do not construct Windows commands by translating a shell string intended for macOS. Use structured arguments and platform-aware filesystem/process APIs where possible. Preserve original content and encoding where restoration depends on exact bytes; account for line endings and Unicode paths.

Test spaces and non-ASCII names in paths. Record whether the application executes natively on Windows or inside WSL; these have different filesystems and runtime configurations.

## State and persistence

Keep these responsibilities distinct:

- **Favorite:** a named, versioned selection of managed items and their states.
- **Recovery snapshot:** the state required to reverse a specific change without overwriting unrelated edits.
- **Experiment record:** a reference to the exact loadout version, starting conditions, outputs, and observations.
- **Display preferences:** effects and appearance; these do not participate in loadout meaning.

A stale plan cannot silently overwrite newer settings. Changes need an operation identity and concurrency control. A process crash must leave enough information to diagnose and recover a partially applied operation.

The application-specific payload remains identifiable even when a favorite is moved to another OS or app. Missing items, path relocation, content changes, and different capability sets require an explicit compatibility result.

## Common review questions

Can a second entry point duplicate a pending operation? Can an update to a source change a saved favorite? Can a pending next-task setting be mistaken for an active task? Can recovery overwrite someone else's edit? Can a stopped skill take away the only recovery path? These are shared contract questions and must remain covered when adding either application.
