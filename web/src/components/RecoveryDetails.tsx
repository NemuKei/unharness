import type { FixtureController } from "../useFixtureController";

export function RecoveryDetails({
  controller,
}: {
  controller: Pick<FixtureController, "state">;
}) {
  const { state } = controller;
  return (
    <section className="recovery-help">
      <h3>保存場所とCLIでの復旧</h3>
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
    </section>
  );
}
