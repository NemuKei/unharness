import { text as t } from '../locale.ts';
import type { RetainedPlan, SourcePlanAdaptation } from "../sources";
import { modePresentation } from '../sources';

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
    <section className="retained-review" aria-label={t("共通設定の変更確認", "Review shared settings changes")}>
      <h3>{t("共通設定だけを更新", "Update shared settings only")}</h3>
      <p>
        {t(`準備済みのモードは${modePresentation[plan.preparedMode].title}のままです。`, `The prepared mode stays ${modePresentation[plan.preparedMode].title}.`)}</p>
      <p>{t("モード以外の設定だけが変わったことを確認しました。現在の内容を記録し、どのモードでも引き継ぎます。管理対象ファイルは変更しません。", "Only settings outside the mode have changed. Record their current values to keep them across all modes. Managed files are unchanged.")}</p>
      <ul className="source-changes">
        {plan.changedCategories.map((category) => (
          <li key={category}>{category}</li>
        ))}
      </ul>
      <p className="muted">
        {t("選択した指示・Skillは登録済みの内容を維持し、古い保存版はそのまま残ります。", "Selected instructions and Skills retain their registered contents. Earlier saved versions remain.")}</p>
      <button className="primary" disabled={disabled} onClick={onAccept}>
        {t("共通設定だけを取り込む", "Keep shared settings")}</button>
    </section>
  );
}

export function RestoreAdaptationNotice({
  adaptation,
}: {
  adaptation: SourcePlanAdaptation;
}) {
  const sourceLabel =
    adaptation.sourceType === "favorite" ? t("お気に入り", "Favorite") : adaptation.sourceType === "setup" ? t("解除設定", "Release settings") : t("復帰点", "Checkpoint");
  if (adaptation.kind === "directory-rebind") return <div className="restore-adaptation" role="note">
    <strong>{t("再確認した場所へ保存内容を準備", "Prepare saved contents at the reviewed location")}</strong>
    <p>{sourceLabel}{t("の指示・Skillを、現在確認した場所へ戻します。現在の共通設定を維持し、\n      元の保存版と過去の確認記録はそのまま残します。", " instructions and Skills will be restored at the reviewed location. Keep current shared settings, original saved versions and earlier observations.")}</p>
  </div>;
  if (adaptation.kind === "source-enrollment") return <div className="restore-adaptation" role="note">
    <strong>{adaptation.addedPluginIds?.length ? t("追加後の登録範囲へ準備", "Prepare for the expanded scope") : t("追加後のSkillを含めて準備", "Prepare with added Skills")}</strong>
    <p>{sourceLabel}{t("に保存された設定を戻し、後から登録した通常Skill ", " settings will be restored. Newly registered ordinary Skills: ")}{adaptation.addedSourceIds.length}{t("件", " items")}{adaptation.addedPluginIds?.length ? t(`・プラグイン ${adaptation.addedPluginIds.length}件`, ` / ${adaptation.addedPluginIds.length} plugins`) : ''}{t("は、\n      保存済みNormalの状態にします。現在の共通設定を維持し、元の保存版はそのまま残します。", " will use saved Normal. Keep current shared settings and the original saved version.")}</p>
  </div>;
  return (
    <div className="restore-adaptation" role="note">
      <strong>{t("現在の共通設定を維持して準備", "Prepare while retaining current shared settings")}</strong>
      <p>
        {sourceLabel}
        {t("に保存された指示・Skillと、現在の共通設定を組み合わせます。この計画で準備したあとに保存すると新しいお気に入り版になります。", " instructions and Skills will be combined with current shared settings. Saving after this preparation creates a new favorite version.")}</p>
    </div>
  );
}
