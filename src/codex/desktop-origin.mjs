// Recorded origin formats corroborated with the local desktop app. This is
// format recognition, not an attachment or cryptographic provenance claim.
// The newer name is qualified only for the exact observed native agent route.
export function recordedDesktopOrigin(meta) {
  return meta?.originator === 'Codex Desktop' || Boolean(meta
    && meta.originator === 'codex_work_desktop'
    && meta.source === 'vscode'
    && meta.cli_version === '0.153.4'
    && meta.thread_source === 'agent_created_thread');
}
