import type { ConnectionSnapshot } from "./connection";
export const connectionLabel = (view: ConnectionSnapshot) => ({ disconnected: "未接続", pairing: "接続待ち", connected: "接続中",
  expired: "接続期限切れ", incompatible: "更新が必要", unknown: "接続状態は未確認" })[view.phase];
export function ConnectionStatus({ view }: { view: ConnectionSnapshot }) {
  return <div className={`public-connection-status is-${view.phase}`} role="status"><span className="connection-dot" aria-hidden="true"/>
    <span>{view.connection ? `このPC・${view.connection.target.application === "codex" ? "Codex" : "Claude Code"} ／ ` : ""}{connectionLabel(view)}</span>
  </div>;
}
