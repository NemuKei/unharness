import { text as t } from '../locale.ts';
import { modePresentation } from '../sources.ts';
import type { HomeProposal } from './home-view.ts';

export function ProposalCard({ proposal, sourceNames = {}, onApprove, onDismiss, busy }: {
  proposal: HomeProposal; sourceNames?: Record<string, string>; onApprove: () => void; onDismiss: () => void; busy: boolean;
}) {
  const action = proposal.kind === 'initial' ? t('いつもの構成を保存して零式にする', 'Save Normal and use TRUEFORM')
    : proposal.kind === 'add' ? t('足して試す', 'Try adding it')
      : proposal.kind === 'remove' ? t('外す', 'Remove it') : t('元に戻す', 'Restore');
  return <section className="home-proposal" aria-label={t('AIからの提案', 'AI proposal')}>
    <h2>{t('AIからの提案', 'AI proposal')}</h2>
    <p>{modePresentation[proposal.mode].title}：{modePresentation[proposal.mode].description}</p>
    {proposal.items.length > 0 && <ul>{proposal.items.map(item => <li key={item.sourceId}>{sourceNames[item.sourceId] ?? t('登録済みの項目', 'Registered item')} — {item.reason}</li>)}</ul>}
    <div className="home-actions"><button type="button" className="primary" disabled={busy} onClick={onApprove}>{action}</button>
      <button type="button" className="secondary" disabled={busy} onClick={onDismiss}>{t('やめる', 'Dismiss')}</button></div>
  </section>;
}
