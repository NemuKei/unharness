import type { FixtureController } from "../useFixtureController";

export function RecoveryDetails({
  controller,
}: {
  controller: Pick<FixtureController, "state">;
}) {
  const { state } = controller;
  return (
    <footer>
      <span>
        UNHARNESS <span className="muted">/ LOCAL FIXTURE GUI</span>
      </span>
      <details>
        <summary>AIを使わない復帰と保存先</summary>
        <p>
          CLIの loadouts checkpoints / restore-checkpoint
          からも復帰できます。同じ保存先と復帰点IDを指定してください。
        </p>
        <dl>
          <dt>保存先</dt>
          <dd>{state?.store ?? "未取得"}</dd>
          <dt>検証環境</dt>
          <dd>{state?.fixture ?? "未取得"}</dd>
          <dt>スコープ</dt>
          <dd>{state?.scopeId ?? "未取得"}</dd>
        </dl>
      </details>
    </footer>
  );
}
