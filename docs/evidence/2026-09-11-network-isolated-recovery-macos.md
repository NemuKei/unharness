# Recovery with external networking denied

Date: 2026-09-11 (JST). This extends the [native v2 package sequence](2026-09-10-native-package-v2.md) using the same owned profile after native plugin removal. The independent copy is version `0.0.1+codex.20260910132826`, distribution `1bd57fa046b3bb05aa9dcddfa210b246806bc12da8befda55655c9902ca12e4d`. It predates the persistent-directory fix and uses its unchanged legacy records.

Only the test launcher and its child processes were sandboxed. The profile denies network operations except loopback binding, inbound traffic and outbound traffic. A control process served and fetched local HTTP successfully; a TCP connection to the reserved external test address `192.0.2.1:443` failed with `EPERM`. System networking, firewall settings and the maintainer's profile were not changed. The Codex browser itself remained outside that process sandbox.

The owned scope began at Normal revision 8. The current source service prepared TRUEFORM revision 9, keeping its legacy identity format. The saved recovery command then started the independent loopback server under the network restriction. In the actual Codex in-app browser, the screen read TRUEFORM, displayed the two Normal-restoration changes, accepted the explicit restore action, and displayed Normal with the fresh-task notice.

A separate readback under the same restriction verified Normal revision 10, no source conflict and no pending recovery. All six managed source locations plus the required project instruction matched the pre-test bytes/absence and supported metadata. The three-item artwork state and single favorite were exactly unchanged; the saved v2 setup ID was retained. No model, native plugin MCP or Codex configuration editor was needed for the restore/readback.

The first restricted launch returned `gui-launch-unconfirmed`; status subsequently confirmed that worker had stopped. A read-only foreground diagnostic then verified the recovery binding, package integrity, server startup and local HTML. The unchanged saved launcher succeeded on the next attempt. IPC also worked in an isolated control. The initial failure's cause remains undetermined; it is not evidence that the sandbox blocked IPC, and no launcher fix is claimed.

This qualifies the stated recovery operation and preserved data in that earlier copy. Actual Wi-Fi disconnection, a sandboxed browser, reboot/remount, and the final release package remain separate checks. The final package must repeat startup and recovery qualification; the first unconfirmed launch must not be hidden by the later success.
