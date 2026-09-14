import { text as t } from './locale.ts';
import type { PluginObservation, PluginCoverage } from './sources';
const labels = { get matched() { return t("一致", "Matched"); }, get 'not-matched'() { return t("不一致", "Not matched"); }, get unknown() { return t("未確認", "Unconfirmed"); } };
export function PluginObservationSummary({ evidence, names = [] }: { evidence: { plugins?: PluginObservation[]; coverage?: PluginCoverage };
  names?: Array<{ id: string; label: string }> }) {
  if (!evidence.plugins?.length || !evidence.coverage) return null;
  const byId = new Map(names.map(p => [p.id, p.label]));
  return <section className="plugin-observation-summary" aria-label={t("プラグインの確認範囲", "Plugin verification scope")}>
    <strong>{t("記録された入力：", "Recorded inputs: ")}{labels[evidence.coverage.inputStatus]}</strong>
    <p>{t("プラグイン全体の稼働・停止は未確認です。このCodex版のタスク記録には、MCP・hook・app・予定タスクの状態が含まれません。", "Whole-plugin runtime is unconfirmed. Task records in this Codex version do not include MCP, hook, app or scheduled-task state.")}</p>
    <ul>{evidence.plugins.map(p => <li key={p.pluginId}>
      {byId.get(p.pluginId) ?? p.pluginId}{t("：保存した設定は", ": saved setting is ")}{p.expectedEnabled === null ? t("不明", "Unknown") : p.expectedEnabled ? t("有効", "Enabled") : t("無効", "Disabled")}
      <p>{t("Skill入力 ", "Skill inputs ")}{labels[p.inputStatus]}{p.skillCatalog.available ? t(`（一覧に ${p.skillCatalog.matchedCount}件／登録 ${p.skillCatalog.expectedCount}件）`, ` (${p.skillCatalog.matchedCount} in catalog / ${p.skillCatalog.expectedCount} registered)`) : t("（一覧を取得できません）", " (catalog unavailable)")}</p>
    </li>)}</ul>
    <p className="muted">{t("入力の一致だけで、完全なモード反映や性能差を確認したとは扱いません。", "Matching inputs alone do not verify complete mode loading or performance differences.")}</p>
  </section>;
}
