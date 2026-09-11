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
  return `Skill ${f.skills}件 / MCP ${f.mcpServers}件 / hook ${f.hooks}件 / app ${f.apps}件 / appテンプレート ${f.appTemplates}件 / 予定タスク ${f.scheduledTasks === null ? '未確認' : f.scheduledTasks + '件'}`;
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
      ? 'このCodexではプラグインの個別OFFを確認できません。登録せず、現在の状態を保持します。'
      : unknown ? '登録結果は未確認です。「状態を再取得」で現在の登録を確認してください。'
      : `内容を確認できませんでした（${e instanceof ApiError ? e.kind : 'invalid-response'}）。候補を取得し直してください。`);
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
      pluginId: selected, origin, optional: true, reason: '利用者が自分で追加した任意のプラグインとして確認しました。' }] });
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
    <summary>プラグインの登録を確認する</summary>
    <p className="muted">このMac版では公式プラグインを現在の状態で保持します。個別OFFが未対応のため、追加指示と自作・外部Skillを切替対象にします。導入済みというだけでは任意の対象と判断しません。</p>
    {(source.registration.plugins?.length ?? 0) > 0 && <details><summary>登録済みのプラグイン {source.registration.plugins!.length}件</summary>
      <ul>{source.registration.plugins!.map(p => <li key={p.id}>{p.label} {p.sourceRevision}：保存Normalは{p.normalEnabled ? '有効' : '無効'}
        <p className="muted">{pluginFeaturesText(p.features)}</p></li>)}</ul>
    </details>}
    <button type="button" className="secondary" disabled={blocked} onClick={() => void inspect()}>導入済みプラグインを確認</button>
    {error && <p role="alert">{error}</p>}
    {inventory && <>
      <p>プラグイン登録済み {inventory.registeredCount}件 / 未登録 {inventory.candidates.length}件</p>
      {inventory.registeredCount >= inventory.limit ? <p>登録の上限は32件です。</p> : <div className="enrollment-form">
        <label htmlFor={prefix + '-plugin'}>登録するプラグイン</label>
        <select id={prefix + '-plugin'} value={selected} disabled={blocked || uncertain} onChange={e => { changed(); setSelected(e.target.value); setOrigin(''); setOptional(false); }}>
          <option value="">選択してください</option>{inventory.candidates.map(p => <option key={p.id} value={p.id} disabled={!p.available}>{p.label}{p.available ? '' : '（この版では対象外）'}</option>)}
        </select>
        {candidate && <>
          <label htmlFor={prefix + '-origin'}>このプラグインの由来</label>
          <select id={prefix + '-origin'} value={origin} disabled={blocked || uncertain} onChange={e => { changed(); setOrigin(e.target.value as typeof origin); }}>
            <option value="">未確認</option><option value="self">自分で作って追加した</option><option value="external">外部から追加した</option>
          </select>
          <label className="source-target"><input type="checkbox" checked={optional} disabled={blocked || uncertain}
            onChange={e => { changed(); setOptional(e.target.checked); }} />自分で追加した任意のプラグインです</label>
          <button type="button" className="secondary" disabled={blocked || uncertain || !origin || !optional} onClick={() => void propose()}>プラグインの登録内容を確認</button>
        </>}
      </div>}
      {inventory.candidates.some(p => !p.available) && <details><summary>この版では扱えないプラグイン</summary><ul>
        {inventory.candidates.filter(p => !p.available).map(p => <li key={p.id}>{p.label}：{p.reason}</li>)}</ul></details>}
    </>}
    {review && !blocked && <div className="enrollment-review" aria-label="プラグインの追加登録内容">
      <h3>{review.additions[0].label}を登録</h3>
      <p>導入版と公式掲載の対応を確認しました。保存Normal：{review.additions[0].enabled ? '有効' : '無効'}。</p>
      <p>{pluginFeaturesText(review.additions[0].features)}</p>
      <p>プラグイン全体の設定は、Skillに加えて上記の機能にも影響し得ます。現在のタスクでの全機能の状態は未確認です。</p>
      <p>この操作は登録だけを保存します。続けて両モードの構成を確認・保存し、使うモードを別に準備します。</p>
      <button type="button" className="primary" disabled={uncertain} onClick={() => void adopt()}>このプラグインを登録</button>
    </div>}
  </details>;
}
