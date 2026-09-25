import { useEffect, useState } from 'react';
import { text as t } from '../locale.ts';
import { ApiError } from '../api.ts';
import type { useSourceController } from '../useSourceController.ts';
import type { SourceMode } from '../sources.ts';
import { FailureNotice } from './FailureNotice.tsx';
import { canApplyReplacement, replacedSourceHeadline, validReplacementReview } from './replaced-source-view.ts';
import type { ReplacedSourceReview } from './replaced-source-view.ts';

type Controller = ReturnType<typeof useSourceController>;

export function ReplacedSourceReviewSheet({ review, preparedMode, busy, uncertain = false, confirmedLocation, confirmedContent,
  onLocation, onContent, onApply, onClose }: { review: ReplacedSourceReview; preparedMode: SourceMode; busy: boolean; uncertain?: boolean;
  confirmedLocation: boolean; confirmedContent: boolean; onLocation: (value: boolean) => void;
  onContent: (value: boolean) => void; onApply: () => void; onClose: () => void }) {
  return <section className="replaced-source-sheet" aria-label={t('新しいSkillを確認', 'Review the new Skill')}>
    <h2>{t(`${review.label}の新しい中身`, `New contents of ${review.label}`)}</h2>
    <p>{review.bodyChanged ? t('中身が変わりました。', 'The contents changed.') : t('本文は前と同じです。', 'The body is unchanged.')}</p>
    {review.bodyChanged && <details><summary>{t('中身を見る', 'Read contents')}</summary><pre>{review.body}</pre></details>}
    {review.missingPreparedFiles.length > 0 && <><p>{t('前のフォルダーにあった設定ファイルが、新しいフォルダーにはありません',
      'Settings files from the previous folder are missing in the new folder.')}</p>
      <p>{preparedMode === 'trueform' && review.missingPreparedFiles.includes('policy')
        ? t('このSkillが自動で使われる状態に戻っています', 'This Skill can now be used automatically again.')
        : preparedMode === 'normal' ? t('通常装備の設定を確認し直す必要があります', 'Review the Normal settings again.')
          : t('このSkillの使われ方が変わっている可能性があります', 'How this Skill is used may have changed.')}</p></>}
    <label><input type="checkbox" checked={confirmedLocation} onChange={event => onLocation(event.target.checked)}/>
      {t('新しいフォルダーを登録し直すことを確認しました', 'I confirm this new folder should be registered')}</label>
    {review.bodyChanged && <label><input type="checkbox" checked={confirmedContent} onChange={event => onContent(event.target.checked)}/>
      {t('新しい中身を確認しました', 'I reviewed the new contents')}</label>}
    <div className="home-actions"><button type="button" className="primary"
      disabled={busy || uncertain || !canApplyReplacement(review, confirmedLocation, confirmedContent)} onClick={onApply}>{t('登録し直す', 'Register again')}</button>
      <button type="button" className="text-button" disabled={busy} onClick={onClose}>{t('閉じる', 'Close')}</button></div>
    <details><summary>{t('詳しく', 'Details')}</summary><dl>
      <div><dt>{t('場所', 'Location')}</dt><dd>{review.details.path}</dd></div>
      <div><dt>{t('以前の識別', 'Previous identity')}</dt><dd>{review.details.previousDirectory.ino}</dd></div>
      <div><dt>{t('新しい識別', 'New identity')}</dt><dd>{review.details.currentDirectory.ino}</dd></div>
      <div><dt>{t('登録ID', 'Registration ID')}</dt><dd>{review.details.nextSourceId}</dd></div>
      {review.missingPreparedFiles.map(part => <div key={part}><dt>{t('見つからないファイル', 'Missing file')}</dt>
        <dd>{part === 'policy' ? 'agents/openai.yaml' : 'SKILL.json'}</dd></div>)}
    </dl></details>
  </section>;
}

export function ReplacedSourcePanel({ controller: c, sourceId, label }: { controller: Controller; sourceId: string; label: string }) {
  const [review, setReview] = useState<ReplacedSourceReview | null>(null);
  const [confirmedLocation, setConfirmedLocation] = useState(false), [confirmedContent, setConfirmedContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => { setReview(null); setConfirmedLocation(false); setConfirmedContent(false); setError(null); setUncertain(false); }, [sourceId, c.view?.metadata.contextId]);
  async function inspect() {
    setError(null);
    const result = await c.executeAuxiliary<ReplacedSourceReview>('review-replaced-source', { sourceId });
    if (result.status !== 'completed' || !validReplacementReview(result.result, sourceId)) {
      setError(result.status === 'failed' && result.error instanceof ApiError ? result.error.kind : 'invalid-response'); return;
    }
    setReview(result.result); setConfirmedLocation(false); setConfirmedContent(false);
  }
  async function apply() {
    if (!review || uncertain || !canApplyReplacement(review, confirmedLocation, confirmedContent)) return;
    setError(null);
    const result = await c.executeReplacedSource<{ adopted: boolean }>(review.reviewId, review.nextScopeId, review.bodyChanged);
    if (result.status !== 'completed' || !result.result.adopted) {
      if (result.status === 'context-updated' || result.status === 'failed' && result.error instanceof ApiError
        && result.error.disposition === 'uncertain') setUncertain(true);
      setError(result.status === 'failed' && result.error instanceof ApiError ? result.error.kind : 'gui-source-context-changed'); return;
    }
    setReview(null);
    await c.refresh();
  }
  return <section className="replaced-source-panel" aria-label={t('更新されたSkill', 'Updated Skill')}>
    <p>{replacedSourceHeadline(label)}</p>
    {!review && <button type="button" className="secondary" disabled={c.busy || uncertain} onClick={() => void inspect()}>{t('確認する', 'Review')}</button>}
    {review && <ReplacedSourceReviewSheet review={review} preparedMode={c.view?.source?.preparedMode ?? 'normal'}
      busy={c.busy} uncertain={uncertain} confirmedLocation={confirmedLocation}
      confirmedContent={confirmedContent} onLocation={setConfirmedLocation} onContent={setConfirmedContent}
      onApply={() => void apply()} onClose={() => setReview(null)}/>}
    {uncertain && <button type="button" className="secondary" onClick={() => { void c.refresh().then(view => {
      if (view) { setReview(null); setUncertain(false); setError(null); }
    }); }}>
      {t('状態を再取得', 'Refresh state')}</button>}
    {error && <FailureNotice message={error === 'stale-review'
      ? t('状況が変わりました。新しい中身を読み直してください。', 'The contents changed. Review them again.')
      : uncertain ? t('登録の結果をまだ確かめられません。状態を再取得してください。', 'The registration result is unconfirmed. Refresh state before another action.')
      : t('新しい中身を確認できませんでした。', 'Could not review the new contents.')}
      detail={error} scopeId={c.view?.source?.registration.scopeId}/>}
  </section>;
}
