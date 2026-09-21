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
      <span className="mode-card-state">{prepared ? t('次のタスク用に準備済み', 'Prepared for the next task')
        : selected ? t('表示中（まだ変更していません）', 'Previewing; not changed yet') : t('保存内容を見る', 'View saved contents')}</span>
    </button>
  </article>;
}
