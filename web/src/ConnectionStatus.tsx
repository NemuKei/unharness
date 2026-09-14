import { text as t } from './locale.ts';
import type { ConnectionSnapshot } from "./connection";
export const connectionLabel = (view: ConnectionSnapshot) => ({ disconnected: t("未接続", "Disconnected"), pairing: t("接続待ち", "Connecting"), connected: t("接続中", "Connected"),
  expired: t("接続期限切れ", "Connection expired"), incompatible: t("更新が必要", "Update required"), unknown: t("接続状態は未確認", "Connection unknown") })[view.phase];
export function ConnectionStatus({ view }: { view: ConnectionSnapshot }) {
  return <div className={`public-connection-status is-${view.phase}`} role="status"><span className="connection-dot" aria-hidden="true"/>
    <span>{view.connection ? `${t("このPC", "This computer")} · ${view.connection.target.application === "codex" ? "Codex" : "Claude Code"} / ` : ""}{connectionLabel(view)}</span>
  </div>;
}
