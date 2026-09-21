import { text as t } from '../locale.ts';

export function StatusOverview({ application, prepared, state, next } : {
  application: string;
  prepared: string;
  state: 'ready' | 'checking' | 'attention';
  next: string;
}) {
  const stateLabel = state === 'ready' ? t('準備済み', 'Prepared')
    : state === 'checking' ? t('確認中', 'Checking') : t('要確認', 'Review needed');
  return <section className={`status-overview ${state}`} aria-label={t('次のタスク用の準備', 'Preparation for the next task')}>
    <div><span>{t('対象', 'Target')}</span><strong>{application}</strong></div>
    <div><span>{t('準備したモード', 'Prepared mode')}</span><strong>{prepared}</strong></div>
    <div><span>{t('状態', 'State')}</span><strong>{stateLabel}</strong></div>
    <p>{next}</p>
  </section>;
}
