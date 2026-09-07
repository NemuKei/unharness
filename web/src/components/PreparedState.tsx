import type { FixtureController } from "../useFixtureController";
import { conditions, shortId } from "../types";

export function PreparedState({
  controller,
}: {
  controller: Pick<
    FixtureController,
    "state" | "connected" | "busy" | "refresh"
  >;
}) {
  const { state, connected, busy, refresh } = controller;
  return (
    <section className="control-section">
      <p className="eyebrow">準備状態</p>
      <div className="current-heading">
        <h2>
          {state?.current
            ? conditions[state.current.case].label
            : "状態を確認中"}
        </h2>
        <span className={connected ? "connection" : "connection disconnected"}>
          {connected ? "接続中" : "未接続"}
        </span>
      </div>
      <p className="muted">
        {state?.current
          ? `準備版 ${state.current.revision} · 設定 ${shortId(state.current.configurationDigest)}`
          : "検証用の設定だけを読み取ります。"}
      </p>
      <p className="boundary">
        {!state?.application
          ? "この起動ではまだ適用していません。"
          : state.applicationCurrent
            ? "設定の読み戻しは一致。新しいタスクで記録の確認が必要です。"
            : "適用後に準備状態が変わっています。再度、変更計画を確認してください。"}
      </p>
      {state?.conflict && (
        <p role="alert" className="error">
          検証環境に競合があります（{state.conflict}
          ）。外部の変更を確認してください。
        </p>
      )}
      <button
        className="text-button"
        disabled={!!busy}
        onClick={() => void refresh()}
      >
        ↻ 状態を再取得
      </button>
    </section>
  );
}
