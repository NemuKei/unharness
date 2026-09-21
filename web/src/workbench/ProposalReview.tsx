import { text as t } from '../locale.ts';
import { SavedSetupSummary } from '../SavedSetupSummary';
import type { SetupRead } from '../SavedSetupSummary';
import type { RegisteredPlugin, SourceRow } from '../sources';

export function ProposalReview({ base, proposed, sources, plugins }: {
  base: SetupRead;
  proposed: NonNullable<SetupRead['review']>;
  sources: SourceRow[];
  plugins?: RegisteredPlugin[];
}) {
  return <section className="proposal-review" aria-label={t('変更内容を確認', 'Review changes')}>
    <p>{t('この確認を作った時点の保存版と提案です。後から変わった内容に置き換えません。', 'This compares the saved version used for this review with the proposal. It is not replaced by later changes.')}</p>
    <div className="proposal-review-grid">
      <section><h3>{t('保存済み', 'Saved')}</h3><SavedSetupSummary data={base} sources={sources} plugins={plugins}/></section>
      <section><h3>{t('提案', 'Proposal')}</h3><SavedSetupSummary data={{ ...base, review: proposed }} sources={sources} plugins={plugins}/></section>
    </div>
  </section>;
}
