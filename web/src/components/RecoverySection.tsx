import type { FixtureController } from "../useFixtureController";
import { conditions, shortId } from "../types";
import type { Application } from "../types";

export function RecoverySection({
  controller,
}: {
  controller: Pick<
    FixtureController,
    | "checkpoints"
    | "recoveryId"
    | "canChange"
    | "mutate"
    | "checkpointCursor"
    | "connected"
    | "busy"
    | "loadMore"
    | "checkpointError"
    | "reloadCheckpoints"
    | "refresh"
    | "copy"
    | "state"
    | "applicationCurrent"
  >;
}) {
  const {
    checkpoints,
    recoveryId,
    canChange,
    mutate,
    checkpointCursor,
    connected,
    busy,
    loadMore,
    checkpointError,
    reloadCheckpoints,
    refresh,
    copy,
    state,
    applicationCurrent,
  } = controller;
  // The accepted application is authoritative across refreshes and clients.
  // A retained local failure receipt belongs in history, not in the primary undo.
  const currentUndoId = applicationCurrent
    ? state?.application?.checkpointId ?? null
    : null;
  return (
    <section className="records-section">
      <div className="section-heading">
        <h2>変更前に戻す</h2>
        <span>変更前の設定を呼び戻す</span>
      </div>
      <p className="muted">
        設定を変える前の状態を自動で残しています。
        別の編集とぶつかった場合は、確認するまで操作を止めます。
      </p>
      {currentUndoId ? (
        <button
          className="secondary undo-button"
          disabled={!canChange}
          onClick={() =>
            void mutate<Application>(
              "/restore-checkpoint",
              { checkpointId: currentUndoId },
              "変更前の設定を準備しました。実行中のタスクの状態は変わりません。",
            )
          }
        >
          直前の設定に戻す
        </button>
      ) : (
        <p className="tiny">
          この画面で設定を変更すると、直前に戻す操作がここに表示されます。
        </p>
      )}
      {checkpointError && (
        <div className="checkpoint-warning" role="alert">
          <p>{checkpointError}</p>
          {recoveryId && (
            <>
              <code className="recovery-reference">{recoveryId}</code>
              <button
                className="text-button"
                onClick={() => void copy(recoveryId)}
              >
                復帰点IDをコピー
              </button>
            </>
          )}
          <button
            className="text-button"
            disabled={!!busy}
            onClick={() => void (connected ? reloadCheckpoints() : refresh())}
          >
            {connected ? "復帰点の一覧を再取得" : "接続と状態を再取得"}
          </button>
        </div>
      )}
      <details className="history-details">
        <summary>保存されている復帰点を見る</summary>
        <p className="tiny">
          以前の復帰点を選んで戻すための一覧です。番号は各記録を見分ける識別子です。
        </p>
        {recoveryId && recoveryId !== currentUndoId && (
          <div className="retained-recovery">
            <p className="tiny">この画面で残した復帰点</p>
            <code className="recovery-reference">{recoveryId}</code>
            <button className="text-button" onClick={() => void copy(recoveryId)}>
              復帰点IDをコピー
            </button>
            <button
              className="secondary"
              disabled={!canChange}
              onClick={() => void mutate<Application>(
                "/restore-checkpoint",
                { checkpointId: recoveryId },
                "選んだ復帰点の設定を準備しました。",
              )}
            >
              この復帰点へ戻す
            </button>
          </div>
        )}
        {checkpoints.length ? (
          <ul className="record-list">
            {checkpoints.map((checkpoint) => (
              <li className="checkpoint-row" key={checkpoint.checkpointId}>
                <span className="record-name">
                  {conditions[checkpoint.case].label}
                  <small>
                    準備版 {checkpoint.capturedPreparation} ·{" "}
                    {shortId(checkpoint.checkpointId)}
                    {checkpoint.checkpointId === currentUndoId
                      ? " · 現在の変更前"
                      : ""}
                  </small>
                </span>
                <button
                  className="secondary"
                  disabled={!canChange}
                  onClick={() =>
                    void mutate<Application>(
                      "/restore-checkpoint",
                      { checkpointId: checkpoint.checkpointId },
                      "復帰点の設定を準備しました。実行中のタスクの状態は変わりません。",
                    )
                  }
                >
                  復帰する
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">
            条件を準備すると、変更前の設定がここに残ります。
          </p>
        )}
        {checkpointCursor && (
          <button
            className="secondary"
            disabled={!connected || !!busy}
            onClick={() => void loadMore("checkpoints")}
          >
            さらに復帰点を読み込む
          </button>
        )}
      </details>
    </section>
  );
}
