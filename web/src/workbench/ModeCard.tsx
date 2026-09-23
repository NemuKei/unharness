import { text as t } from '../locale.ts';

export function ModeCard({ title, label, description, selected, prepared, disabled, onSelect }: {
  title: string;
  label: string;
  description: string;
  selected: boolean;
  prepared: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return <article className={`mode-card${selected ? ' selected' : ''}${prepared ? ' prepared' : ''}`}>
    <button type="button" aria-pressed={selected} disabled={disabled} onClick={onSelect}>
      <span className="mode-card-heading"><strong>{title}</strong><small>{label}</small></span>
      <span className="mode-card-description">{description}</span>
      <span className="mode-card-state">{prepared ? t('次の新しいタスクから、この構成です', 'Used from your next new task')
        : selected ? t('選択中（まだ切り替えていません）', 'Selected — not switched yet') : t('中身を見る', 'See what is inside')}</span>
    </button>
  </article>;
}
