import type { PluginObservation, PluginCoverage } from './sources';
const labels = { matched: '一致', 'not-matched': '不一致', unknown: '未確認' };
export function PluginObservationSummary({ evidence, names = [] }: { evidence: { plugins?: PluginObservation[]; coverage?: PluginCoverage };
  names?: Array<{ id: string; label: string }> }) {
  if (!evidence.plugins?.length || !evidence.coverage) return null;
  const byId = new Map(names.map(p => [p.id, p.label]));
  return <section className="plugin-observation-summary" aria-label="プラグインの確認範囲">
    <strong>記録された入力：{labels[evidence.coverage.inputStatus]}</strong>
    <p>プラグイン全体の稼働・停止は未確認です。このCodex版のタスク記録には、MCP・hook・app・予定タスクの状態が含まれません。</p>
    <ul>{evidence.plugins.map(p => <li key={p.pluginId}>
      {byId.get(p.pluginId) ?? p.pluginId}：保存した設定は{p.expectedEnabled === null ? '不明' : p.expectedEnabled ? '有効' : '無効'}
      <p>Skill入力 {labels[p.inputStatus]}{p.skillCatalog.available ? `（一覧に ${p.skillCatalog.matchedCount}件／登録 ${p.skillCatalog.expectedCount}件）` : '（一覧を取得できません）'}</p>
    </li>)}</ul>
    <p className="muted">入力の一致だけで、完全なモード反映や性能差を確認したとは扱いません。</p>
  </section>;
}
