import { text as t } from '../locale.ts';
import { modePresentation } from '../sources.ts';
import type { SourceMode } from '../sources.ts';
import { switchSheetText } from './home-view.ts';

export function SwitchSheet({ mode, removed, onConfirm, onCancel, busy }: {
  mode: SourceMode; removed: number; onConfirm: () => void; onCancel: () => void; busy: boolean;
}) {
  return <section className="home-switch-sheet" role="dialog" aria-modal="false" aria-label={t('切替の確認', 'Confirm switch')}>
    <h2>{modePresentation[mode].title}</h2>
    <p>{switchSheetText(mode, removed)}</p>
    <p className="muted">{t('今開いているタスクの読み込みは変わりません。', 'The current task does not reload its settings.')}</p>
    <div className="home-actions"><button type="button" className="primary" disabled={busy} onClick={onConfirm}>{t('切り替える', 'Switch')}</button>
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>{t('やめる', 'Cancel')}</button></div>
  </section>;
}
