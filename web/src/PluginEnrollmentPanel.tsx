import { text as t } from './locale.ts';
import { useId, useState } from 'react';
import type { useSourceController } from './useSourceController';
import type { PluginFeatures } from './sources';
import { ApiError } from './api';

type Candidate = { id: string; label: string; enabled: boolean; available: boolean; reason: string | null };
type Inventory = { scopeId: string; discoveryId: string; registeredCount: number; limit: number; candidates: Candidate[]; enrollmentSchemaVersion: 3 };
type Review = { reviewId: string; scopeId: string; nextScopeId: string; schemaVersion: 3; sourceFilesChanged: 0; modeChangeRequired: true;
  setupRequired: true; additions: Array<{ pluginId: string; origin: 'self' | 'external'; optional: true; label: string; enabled: boolean; features: PluginFeatures }> };
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const pluginId = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}@[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(v);
export function pluginFeaturesText(f: PluginFeatures): string {
  return t(`Skill ${f.skills}件 / MCP ${f.mcpServers}件 / hook ${f.hooks}件 / app ${f.apps}件 / appテンプレート ${f.appTemplates}件 / 予定タスク ${f.scheduledTasks === null ? t("未確認", "Unconfirmed") : f.scheduledTasks + t("件", " items")}`, `Skills ${f.skills} / MCP ${f.mcpServers} / hooks ${f.hooks} / apps ${f.apps} / app templates ${f.appTemplates} / scheduled tasks ${f.scheduledTasks === null ? t('未確認', 'Unconfirmed') : f.scheduledTasks}`);
}
function validFeatures(f: PluginFeatures) {
  return !!f && ['skills', 'mcpServers', 'hooks', 'apps', 'appTemplates'].every(k => Number.isSafeInteger(f[k as keyof PluginFeatures])
    && (f[k as keyof PluginFeatures] as number) >= 0) && (f.scheduledTasks === null || Number.isSafeInteger(f.scheduledTasks) && f.scheduledTasks >= 0);
}
export function PluginEnrollmentPanel({ controller: c }: { controller: ReturnType<typeof useSourceController> }) {
  const prefix = useId(), source = c.view?.source;
  const [inventory, setInventory] = useState<Inventory | null>(null), [selected, setSelected] = useState('');
  const [origin, setOrigin] = useState<'self' | 'external' | ''>(''), [optional, setOptional] = useState(false);
  const [review, setReview] = useState<Review | null>(null), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const blocked = !source || !c.confirmed || !!source.conflict || source.recovery.pending || c.busy;
  const candidate = inventory?.candidates.find(p => p.id === selected);
  function changed() { setReview(null); setError(''); }
  function failed(e: unknown, applying = false) {
    const unknown = applying && (!(e instanceof ApiError) || e.disposition === 'uncertain');
    setUncertain(unknown);
    setError(e instanceof ApiError && e.kind === 'setup-plugin-control-unavailable'
      ? t("このCodexではプラグインの個別OFFを確認できません。登録せず、現在の状態を保持します。", "Individual plugin OFF is unverified in this Codex. Retain the current state without registration.")
      : unknown ? t("登録結果は未確認です。「状態を再取得」で現在の登録を確認してください。", "Registration is unconfirmed. Refresh the state to check.")
      : t(`内容を確認できませんでした（${e instanceof ApiError ? e.kind : 'invalid-response'}）。候補を取得し直してください。`, `Contents could not be verified (${e instanceof ApiError ? e.kind : 'invalid-response'}). Reload the candidates.`));
  }
  async function inspect() {
    changed(); setInventory(null); setUncertain(false);
    const response = await c.executeAuxiliary<Inventory>('plugin-enrollment-inventory', {});
    if (response.status === 'context-updated') return;
    if (response.status === 'failed') return failed(response.error);
    const d = response.result;
    if (d?.scopeId !== source?.registration.scopeId || !hash(d.discoveryId) || d.enrollmentSchemaVersion !== 3 || d.limit !== 32
      || !Number.isSafeInteger(d.registeredCount) || !Array.isArray(d.candidates) || !d.candidates.every(p => pluginId(p.id)
        && typeof p.label === 'string' && typeof p.enabled === 'boolean' && typeof p.available === 'boolean')) return failed(Error());
    setInventory(d); setSelected(''); setOrigin(''); setOptional(false);
  }
  async function propose() {
    if (!inventory || !candidate || !origin || !optional) return;
    const response = await c.executeAuxiliary<Review>('review-plugin-enrollment', { discoveryId: inventory.discoveryId, additions: [{
      pluginId: selected, origin, optional: true, reason: t("利用者が自分で追加した任意のプラグインとして確認しました。", "The user confirmed this as an optional plugin they added.") }] });
    if (response.status === 'context-updated') return;
    if (response.status === 'failed') return failed(response.error);
    const r = response.result, p = r?.additions?.[0];
    if (!hash(r?.reviewId) || !hash(r.nextScopeId) || r.scopeId !== inventory.scopeId || r.schemaVersion !== 3
      || r.sourceFilesChanged !== 0 || r.modeChangeRequired !== true || r.setupRequired !== true || r.additions.length !== 1
      || p.pluginId !== selected || p.origin !== origin || p.optional !== true || p.enabled !== candidate.enabled || !validFeatures(p.features)) return failed(Error());
    setReview(r);
  }
  async function adopt() {
    if (!review) return;
    const response = await c.executePluginEnrollment<{ adopted: boolean; nextScopeId: string }>(review.reviewId, review.nextScopeId);
    if (response.status === 'failed') return failed(response.error, true);
    if (response.status === 'context-updated') return;
    if (response.result?.adopted !== true || response.result.nextScopeId !== review.nextScopeId) failed(Error(), true);
  }
  if (!source || c.view?.metadata.application !== 'codex') return null;
  return <details className="control-section enrollment-panel plugin-enrollment-panel">
    <summary>{t("プラグインの登録を確認する", "Review plugin registration")}</summary>
    <p className="muted">{t("このMac版では公式プラグインを現在の状態で保持します。個別OFFが未対応のため、追加指示と自作・外部Skillを切替対象にします。導入済みというだけでは任意の対象と判断しません。", "This Mac version retains official plugins in their current state. Because individual OFF is unsupported, switching targets are optional instructions and authored/external Skills. Installation alone does not establish that a target is optional.")}</p>
    {(source.registration.plugins?.length ?? 0) > 0 && <details><summary>{t("登録済みのプラグイン ", "Registered plugins: ")}{source.registration.plugins!.length}{t("件", " items")}</summary>
      <ul>{source.registration.plugins!.map(p => <li key={p.id}>{p.label} {p.sourceRevision}{t("：保存Normalは", ": saved Normal is ")}{p.normalEnabled ? t("有効", "Enabled") : t("無効", "Disabled")}
        <p className="muted">{pluginFeaturesText(p.features)}</p></li>)}</ul>
    </details>}
    <button type="button" className="secondary" disabled={blocked} onClick={() => void inspect()}>{t("導入済みプラグインを確認", "Review installed plugins")}</button>
    {error && <p role="alert">{error}</p>}
    {inventory && <>
      <p>{t("プラグイン登録済み ", "Registered plugins: ")}{inventory.registeredCount}{t("件 / 未登録 ", " / Unregistered: ")}{inventory.candidates.length}{t("件", " items")}</p>
      {inventory.registeredCount >= inventory.limit ? <p>{t("登録の上限は32件です。", "The registration limit is 32.")}</p> : <div className="enrollment-form">
        <label htmlFor={prefix + '-plugin'}>{t("登録するプラグイン", "Plugin to register")}</label>
        <select id={prefix + '-plugin'} value={selected} disabled={blocked || uncertain} onChange={e => { changed(); setSelected(e.target.value); setOrigin(''); setOptional(false); }}>
          <option value="">{t("選択してください", "Select an option")}</option>{inventory.candidates.map(p => <option key={p.id} value={p.id} disabled={!p.available}>{p.label}{p.available ? '' : t("（この版では対象外）", " (unsupported in this version)")}</option>)}
        </select>
        {candidate && <>
          <label htmlFor={prefix + '-origin'}>{t("このプラグインの由来", "Plugin origin")}</label>
          <select id={prefix + '-origin'} value={origin} disabled={blocked || uncertain} onChange={e => { changed(); setOrigin(e.target.value as typeof origin); }}>
            <option value="">{t("未確認", "Unconfirmed")}</option><option value="self">{t("自分で作って追加した", "Authored and added by me")}</option><option value="external">{t("外部から追加した", "Added from an external source")}</option>
          </select>
          <label className="source-target"><input type="checkbox" checked={optional} disabled={blocked || uncertain}
            onChange={e => { changed(); setOptional(e.target.checked); }} />{t("自分で追加した任意のプラグインです", "This is an optional plugin I added")}</label>
          <button type="button" className="secondary" disabled={blocked || uncertain || !origin || !optional} onClick={() => void propose()}>{t("プラグインの登録内容を確認", "Review plugin registration")}</button>
        </>}
      </div>}
      {inventory.candidates.some(p => !p.available) && <details><summary>{t("この版では扱えないプラグイン", "Plugins unsupported in this version")}</summary><ul>
        {inventory.candidates.filter(p => !p.available).map(p => <li key={p.id}>{p.label}：{p.reason}</li>)}</ul></details>}
    </>}
    {review && !blocked && <div className="enrollment-review" aria-label={t("プラグインの追加登録内容", "Plugin registration details")}>
      <h3>{review.additions[0].label}{t("を登録", " will be registered")}</h3>
      <p>{t("導入版と公式掲載の対応を確認しました。保存Normal：", "The installed version matches the official listing. Saved Normal: ")}{review.additions[0].enabled ? t("有効", "Enabled") : t("無効", "Disabled")}。</p>
      <p>{pluginFeaturesText(review.additions[0].features)}</p>
      <p>{t("プラグイン全体の設定は、Skillに加えて上記の機能にも影響し得ます。現在のタスクでの全機能の状態は未確認です。", "Whole-plugin settings may affect these features as well as Skills. Their full state in the current task is unconfirmed.")}</p>
      <p>{t("この操作は登録だけを保存します。続けて両モードの構成を確認・保存し、使うモードを別に準備します。", "This operation only saves registration. Next review and save both modes, then prepare a mode separately.")}</p>
      <button type="button" className="primary" disabled={uncertain} onClick={() => void adopt()}>{t("このプラグインを登録", "Register this plugin")}</button>
    </div>}
  </details>;
}
