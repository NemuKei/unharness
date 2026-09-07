import type { FixtureController } from "../useFixtureController";
import { conditions, shortId } from "../types";
import type { Application } from "../types";
const sourceLabels: Record<string, string> = {
  "project-instructions": "プロジェクトの指示",
  "fixed-override": "固定指示の優先ファイル",
  "diagnostic-skill": "検証用Skill",
  "skill-policy": "Skillの自動選択設定",
};

export function PlanSection({
  controller,
}: {
  controller: Pick<
    FixtureController,
    | "selected"
    | "condition"
    | "plan"
    | "planning"
    | "busy"
    | "canChange"
    | "choose"
    | "mutate"
  >;
}) {
  const {
    selected,
    condition,
    plan,
    planning,
    busy,
    canChange,
    choose,
    mutate,
  } = controller;
  return (
    <section className="control-section plan-section">
      <div className="section-heading">
        <h2>変更計画</h2>
        <span>選択した保存版</span>
      </div>
      {selected ? (
        <p className="selected-name">
          {selected.name || conditions[selected.case].label}{" "}
          <code title={selected.favoriteId}>
            {shortId(selected.favoriteId)}
          </code>
        </p>
      ) : (
        <p className="muted">下の確認条件か、お気に入りを選択してください。</p>
      )}
      <dl className="source-list">
        <div>
          <dt>検証用Skill</dt>
          <dd>{condition.skill}</dd>
        </div>
        <div>
          <dt>追加の指示</dt>
          <dd>{condition.procedure}</dd>
        </div>
        <div>
          <dt>固定指示</dt>
          <dd>維持</dd>
        </div>
      </dl>
      <p className="tiny">
        上記は選択条件の予定です。個人設定・管理ポリシー・権限は変更しません。
      </p>
      <div className="plan-detail" aria-live="polite">
        {planning ? (
          <p>変更計画を読み込んでいます…</p>
        ) : plan ? (
          <>
            <p>
              {plan.changedSources.length
                ? "変更する検証用ファイル"
                : "設定内容の差分なし。次のタスク向けに準備を更新します。"}
            </p>
            {plan.changedSources.length > 0 && (
              <ul>
                {plan.changedSources.map((source) => (
                  <li key={source}>{sourceLabels[source] ?? source}</li>
                ))}
              </ul>
            )}
            <code title={plan.planId}>計画 {shortId(plan.planId)}</code>
          </>
        ) : selected ? (
          <p>適用前に変更計画を再確認してください。</p>
        ) : null}
      </div>
      {selected && !plan && !planning && (
        <button
          className="secondary wide"
          disabled={!canChange}
          onClick={() => void choose(selected)}
        >
          変更計画を確認
        </button>
      )}
      <button
        className="primary wide"
        disabled={
          !canChange ||
          !selected ||
          !plan ||
          planning ||
          plan.target.id !== selected.favoriteId
        }
        onClick={() =>
          selected &&
          plan &&
          void mutate<Application>(
            "/apply",
            { favoriteId: selected.favoriteId, planId: plan.planId },
            "選択した保存版の設定を準備しました。新しいローカルタスクで記録を確認してください。",
          )
        }
      >
        <span aria-hidden="true">›</span>{" "}
        {busy === "/apply" ? "設定を準備中…" : "この条件を準備する"}
      </button>
    </section>
  );
}
