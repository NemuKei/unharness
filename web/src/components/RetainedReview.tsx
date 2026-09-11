import type { RetainedPlan, SourcePlanAdaptation } from "../sources";

export function RetainedReview({
  plan,
  disabled,
  onAccept,
}: {
  plan: RetainedPlan;
  disabled: boolean;
  onAccept: () => void;
}) {
  return (
    <section className="retained-review" aria-label="現在の設定の変更確認">
      <h3>現在の設定の変更</h3>
      <p>
        現在のCodex設定を新しいNormal版として記録します。管理対象ファイルは変更しません。
      </p>
      <ul className="source-changes">
        {plan.changedCategories.map((category) => (
          <li key={category}>{category}</li>
        ))}
      </ul>
      <p className="muted">
        選択した指示・Skillは登録済みの内容を維持し、古い保存版はそのまま残ります。
      </p>
      <button className="primary" disabled={disabled} onClick={onAccept}>
        現在の設定を引き継ぐ
      </button>
    </section>
  );
}

export function RestoreAdaptationNotice({
  adaptation,
}: {
  adaptation: SourcePlanAdaptation;
}) {
  const sourceLabel =
    adaptation.sourceType === "favorite" ? "お気に入り" : adaptation.sourceType === "setup" ? "解除設定" : "復帰点";
  if (adaptation.kind === "directory-rebind") return <div className="restore-adaptation" role="note">
    <strong>再確認した場所へ保存内容を準備</strong>
    <p>{sourceLabel}の指示・Skillを、現在確認した場所へ戻します。現在の共通設定を維持し、
      元の保存版と過去の確認記録はそのまま残します。</p>
  </div>;
  if (adaptation.kind === "source-enrollment") return <div className="restore-adaptation" role="note">
    <strong>追加後のSkillを含めて準備</strong>
    <p>{sourceLabel}に保存された指示・Skillを戻し、後から登録した{adaptation.addedSourceIds.length}件のSkillは、
      保存済みNormalの状態にします。現在の共通設定を維持し、元の保存版はそのまま残します。</p>
  </div>;
  return (
    <div className="restore-adaptation" role="note">
      <strong>現在の共通設定を維持して準備</strong>
      <p>
        {sourceLabel}
        に保存された指示・Skillと、現在の共通設定を組み合わせます。この計画で準備したあとに保存すると新しいお気に入り版になります。
      </p>
    </div>
  );
}
