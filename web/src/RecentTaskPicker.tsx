import { useEffect, useRef, useState } from 'react';
import { text as t } from './locale.ts';
import { comparisonContextKey } from './useComparisonController';
import type { useSourceController } from './useSourceController';

export type RecentTask = { taskId: string; title: string | null; createdAt: number; updatedAt: number };
type RecentTasks = { available: boolean; tasks: RecentTask[]; nextCursor: string | null };

export function RecentTaskPicker({ controller, visible, recordedTaskIds, onChoose }: {
  controller: ReturnType<typeof useSourceController>; visible: boolean;
  recordedTaskIds: Set<string>; onChoose: (task: RecentTask) => void;
}) {
  const [page, setPage] = useState<RecentTasks | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const latest = useRef(controller), generation = useRef(0);
  latest.current = controller;
  const contextKey = comparisonContextKey(controller.view);
  async function load(taskCursor?: string) {
    const request = ++generation.current, context = comparisonContextKey(latest.current.view);
    setLoading(true); setError('');
    const response = await latest.current.executeAuxiliary<RecentTasks>('recent-tasks', taskCursor ? { taskCursor } : {});
    if (request !== generation.current || context !== comparisonContextKey(latest.current.view)) return;
    setLoading(false);
    if (response.status !== 'completed') {
      setError(t('最近のタスクを読み込めませんでした。読み直すか、下の方法で記録できます。', 'Recent tasks could not be loaded. Try again or use another recording method below.'));
      return;
    }
    setPage(previous => ({ ...response.result, tasks: taskCursor && previous
      ? [...previous.tasks, ...response.result.tasks.filter(task => !previous.tasks.some(old => old.taskId === task.taskId))]
      : response.result.tasks }));
  }
  useEffect(() => {
    if (visible) { setPage(null); void load(); }
    return () => { ++generation.current; };
  }, [visible, contextKey]);
  return <div className="recent-task-picker" hidden={!visible}>
    <div className="comparison-heading"><h3>{t('最近のタスクから選ぶ', 'Choose a recent task')}</h3>
      <button className="text-button" disabled={loading || controller.busy} onClick={() => void load()}>{t('読み直す', 'Refresh')}</button></div>
    <p className="muted">{t('このプロジェクトのタスク名と日時です。選んだタスクの完了済みの範囲を確認します。', 'Names and dates from this project. Select a task to inspect its completed work.')}</p>
    {loading && <p role="status">{t('最近のタスクを確認しています…', 'Loading recent tasks…')}</p>}
    {error && <p role="alert">{error}</p>}
    {page && !page.available && <p>{t('この環境ではタスク一覧を取得できません。下の方法で記録できます。', 'Task listing is unavailable in this environment. Use another recording method below.')}</p>}
    {page?.available && !loading && !page.tasks.length && <p>{t('このプロジェクトの最近のタスクは見つかりませんでした。', 'No recent tasks were found for this project.')}</p>}
    <ul className="recent-task-list">{page?.tasks.map(task => <li key={task.taskId}>
      <button type="button" disabled={loading || controller.busy} onClick={() => onChoose(task)}>
        <strong>{task.title ?? t('名称のないタスク', 'Untitled task')}</strong>
        <span>{new Date(task.updatedAt * 1000).toLocaleString(t('ja-JP', 'en-US'))}
          {recordedTaskIds.has(task.taskId) && t(' · 記録済み', ' · Already recorded')}</span>
      </button></li>)}</ul>
    {page?.nextCursor && <button className="secondary" disabled={loading || controller.busy} onClick={() => void load(page.nextCursor!)}>{t('以前のタスクも見る', 'Load older tasks')}</button>}
  </div>;
}
