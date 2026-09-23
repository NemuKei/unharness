import { text as t } from '../locale.ts';

export function CheckInCard({ name, due, answered, ratio, onKeep, onRemove, onConsult }: {
  name: string; due: boolean; answered: boolean; ratio: number | null;
  onKeep: () => void; onRemove: () => void; onConsult: () => void;
}) {
  if (!due || answered) return null;
  return <section className="home-check-in" aria-label={t('追加したものを振り返る', 'Review what you added')}>
    <h2>{t(`${name}を残しますか？`, `Keep ${name}?`)}</h2>
    <p>{ratio !== null && Number.isFinite(ratio) && ratio > 0
      ? t(`同じアプリの零式と比べた使用量は約${ratio.toFixed(1)}倍です。仕事の内容が違うため、性能差を示すものではありません。`,
        `Recorded usage is about ${ratio.toFixed(1)} times TRUEFORM in this app. Different work can affect the comparison.`)
      : t('使用量はまだ目安がありません。', 'There is no usage estimate yet.')}</p>
    <div className="home-actions"><button className="secondary" onClick={onKeep}>{t('残す', 'Keep')}</button>
      <button className="secondary" onClick={onRemove}>{t('外す', 'Remove')}</button>
      <button className="secondary" onClick={onConsult}>{t('AIに相談', 'Ask AI')}</button></div>
  </section>;
}
