import type { FixtureController } from "../useFixtureController";
import type { Observation } from "../types";
const readyPrompt =
  "This is the read-only Unharness desktop fixture check. Do not call tools or read files. Reply exactly READY.";
const uuidPattern =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export function ObservationSection({
  controller,
}: {
  controller: Pick<
    FixtureController,
    | "state"
    | "connected"
    | "busy"
    | "copy"
    | "mutate"
    | "sessionId"
    | "setSessionId"
    | "canChange"
    | "observationText"
  >;
}) {
  const {
    state,
    connected,
    busy,
    copy,
    mutate,
    sessionId,
    setSessionId,
    canChange,
    observationText,
  } = controller;
  return (
    <section className="handoff-section">
      <div className="section-heading">
        <h2>新しいタスクで確かめる</h2>
        <span>Codex ローカルタスク</span>
      </div>
      <p className="muted">
        条件を準備した後、以下のプロジェクトで新しいローカルタスクを作成し、確認文を送ります。
      </p>
      <div className="handoff-grid">
        <div>
          <label htmlFor="project-path">検証用プロジェクト</label>
          <textarea
            id="project-path"
            readOnly
            rows={2}
            value={state?.project ?? ""}
          />
          <button
            className="text-button"
            disabled={!state?.project}
            onClick={() => state && void copy(state.project)}
          >
            プロジェクトの場所をコピー
          </button>
          <label htmlFor="ready-prompt">確認文</label>
          <textarea id="ready-prompt" readOnly rows={3} value={readyPrompt} />
          <button
            className="text-button"
            onClick={() => void copy(readyPrompt)}
          >
            確認文をコピー
          </button>
        </div>
        <div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (state?.application)
                void mutate<Observation>(
                  "/observe",
                  {
                    applicationId: state.application.applicationId,
                    sessionId: sessionId.trim(),
                  },
                  "選択したタスクの記録を確認しました。",
                );
            }}
          >
            <label htmlFor="session-id">作成したタスクのUUID</label>
            <input
              id="session-id"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              required
              pattern={uuidPattern}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
              disabled={!!busy}
            />
            <p className="tiny">
              ファイルパスではなく、確認に使ったタスクのIDを入力してください。
            </p>
            <button
              className="secondary wide"
              type="submit"
              disabled={
                !canChange ||
                !state?.application ||
                !state.applicationCurrent ||
                !sessionId.trim()
              }
            >
              {busy === "/observe" ? "記録を確認中…" : "このタスクの記録を確認"}
            </button>
          </form>
          <div className="observation">
            <h3>記録による確認</h3>
            <p>
              {state?.observation && (!state.applicationCurrent || !connected)
                ? "以前の準備状態についての記録です。"
                : ""}
              {observationText}
            </p>
            {state?.observation && (
              <code>{state.observation.fixtureMarkerCheck}</code>
            )}
            <p className="tiny">
              一致は、その記録内の検証用入力についての確認です。実行中のハーネス全体や完全なモード切替を保証しません。
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
