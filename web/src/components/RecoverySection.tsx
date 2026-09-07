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
  } = controller;
  return (
    <section className="records-section">
      <div className="section-heading">
        <h2>変更前に戻す</h2>
        <span>自動保存された復帰点</span>
      </div>
      <p className="muted">
        復帰時も独立した編集を保護します。強制的な上書きは行いません。
      </p>
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
      {checkpoints.length ? (
        <ul className="record-list">
          {checkpoints.map((checkpoint) => (
            <li className="checkpoint-row" key={checkpoint.checkpointId}>
              <span className="record-name">
                {conditions[checkpoint.case].label}
                <small>
                  準備版 {checkpoint.capturedPreparation} ·{" "}
                  {shortId(checkpoint.checkpointId)}
                  {checkpoint.checkpointId === recoveryId
                    ? " · 直前の復帰点"
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
    </section>
  );
}
