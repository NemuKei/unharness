import { useId, useState } from 'react';
import type { useSourceController } from './useSourceController';
import type { SourceMode } from './sources';
import { SavedSetupSummary, readableSetup } from './SavedSetupSummary';
import type { SetupRead } from './SavedSetupSummary';
import { ApiError } from './api';

type State = 'disabled' | 'manual' | 'automatic';
type Selection = { sourceId: string; state: State };
type Proposal = { schemaVersion: 3; scopeId: string; normalId: string; inventoryId: string;
  basis: Record<string, unknown>; roles: Array<{ sourceId: string; origin: string; reason: string }>;
  trueform: { skillStates: Selection[]; retainedOfficialPluginIds: string[] };
  unseal: { instructions: 'minimal' | 'none'; skillElevations: Selection[]; additionalPluginIds: string[] } };
type Inventory = { inventoryId: string; skills: Array<{ id: string; normalState: State; availableStates: State[]; requiredControl: boolean }>;
  plugins: Array<{ id: string; normalEnabled: boolean; eligibility: 'official-confirmed' | 'not-official' | 'unknown' }> };
type Read = Omit<SetupRead, 'inventory'> & { proposal: Proposal; inventory: Inventory };
type Reviewed = NonNullable<SetupRead['review']> & { reviewId: string; scopeId: string; sourceFilesChanged: 0 };
const words = { disabled: '無効', manual: '手動', automatic: '自動' };
const rank = (s: State) => ['disabled', 'manual', 'automatic'].indexOf(s);
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

export function SourceStateEditor({ controller: c, mode }: { controller: ReturnType<typeof useSourceController>; mode: Exclude<SourceMode, 'normal'> }) {
  const prefix = useId(), source = c.view?.source;
  const [loaded, setLoaded] = useState<Read | null>(null), [draft, setDraft] = useState<Proposal | null>(null);
  const [review, setReview] = useState<Reviewed | null>(null), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false);
  const blocked = !c.confirmed || !source || !!source.conflict || source.recovery.pending || c.busy;
  const names = new Map([...(source?.registration.sources ?? []), ...(source?.registration.plugins ?? [])].map(s => [s.id, s.label]));
  function failed(e: unknown, adopting = false) {
    const unknown = adopting && (!(e instanceof ApiError) || e.disposition === 'uncertain');
    setUncertain(unknown); setReview(null);
    setError(e instanceof ApiError && e.kind === 'setup-plugin-control-unavailable'
      ? 'このCodexではプラグインの個別OFFを確認できません。保存内容を取得し直し、両モードでNormalを保つ案を確認してください。'
      : unknown ? '保存結果は未確認です。「状態を再取得」で保存版を確認してください。'
      : `設定を確認できませんでした（${e instanceof ApiError ? e.kind : 'invalid-response'}）。保存内容を取得し直してください。`);
  }
  async function load() {
    setLoaded(null); setDraft(null); setReview(null); setError(''); setUncertain(false);
    const response = await c.executeAuxiliary<Read>('setup', { schemaVersion: 3 });
    if (response.status === 'context-updated') return;
    if (response.status === 'failed') return failed(response.error);
    const r = response.result;
    if (!readableSetup(r) || r.review?.schemaVersion !== 3 || r.proposal?.schemaVersion !== 3 || !r.inventory
      || r.scopeId !== source?.registration.scopeId || r.setupId !== source.setup?.setupId
      || r.normalId !== source.registration.activeNormalId || !hash(r.inventory.inventoryId)
      || !Array.isArray(r.proposal.trueform?.skillStates) || !Array.isArray(r.proposal.unseal?.skillElevations)
      || r.inventory.plugins.length > 0 && (!Array.isArray(r.pluginControls)
        || r.pluginControls.length !== r.inventory.plugins.length
        || new Set(r.pluginControls.map(c => c.pluginId)).size !== r.inventory.plugins.length
        || r.pluginControls.some(c => !r.inventory.plugins.some(p => p.id === c.pluginId)
          || typeof c.available !== 'boolean' || c.reason !== null && c.reason !== 'setup-plugin-control-unavailable'))
      || !r.inventory.skills.every(s => typeof s.id === 'string' && Array.isArray(s.availableStates) && typeof s.requiredControl === 'boolean')) return failed(Error());
    const next = { ...structuredClone(r.proposal), normalId: r.normalId, inventoryId: r.inventory.inventoryId };
    for (const control of r.pluginControls ?? []) if (!control.available) {
      if (!next.trueform.retainedOfficialPluginIds.includes(control.pluginId)) next.trueform.retainedOfficialPluginIds.push(control.pluginId);
      next.unseal.additionalPluginIds = next.unseal.additionalPluginIds.filter(id => id !== control.pluginId);
    }
    setLoaded(r); setDraft(next);
  }
  function update(change: (p: Proposal) => void) {
    if (!draft) return;
    const next = structuredClone(draft); change(next); setDraft(next); setReview(null); setError('');
  }
  async function preview() {
    if (!draft || !loaded) return;
    const response = await c.executeAuxiliary<Reviewed>('review-setup', { proposal: draft });
    if (response.status === 'context-updated') return;
    if (response.status === 'failed') return failed(response.error);
    const r = response.result;
    if (!hash(r?.reviewId) || r.scopeId !== source?.registration.scopeId || r.schemaVersion !== 3 || r.sourceFilesChanged !== 0
      || !readableSetup({ ...loaded, review: r })) return failed(Error());
    setReview(r);
  }
  async function adopt() {
    if (!review) return;
    const response = await c.executeAuxiliary<{ adopted: boolean; setupId: string }>('apply-setup', { reviewId: review.reviewId });
    if (response.status === 'context-updated') return;
    if (response.status === 'failed') return failed(response.error, true);
    if (!hash(response.result?.setupId)) return failed(Error(), true);
  }
  return <details className="source-state-editor">
    <summary>対象を調整</summary>
    <p className="muted">保存したモデル相談の基準を引き継ぎ、両モードへの変更を確認して保存します。保存後のモード準備は別操作です。</p>
    <button type="button" className="secondary" disabled={blocked} onClick={() => void load()}>保存した対象を編集</button>
    {error && <p role="alert">{error}</p>}
    {draft && loaded && <fieldset disabled={blocked || uncertain}>
      <legend>{mode === 'trueform' ? '零式' : '限定解除'}で使う範囲</legend>
      {loaded.inventory.skills.filter(s => !s.requiredControl).map(s => {
        const base = draft.trueform.skillStates.find(x => x.sourceId === s.id)?.state;
        if (!base) return <p key={s.id} role="alert">保存状態を再確認してください。</p>;
        const current = mode === 'trueform' ? base : draft.unseal.skillElevations.find(x => x.sourceId === s.id)?.state ?? 'inherit';
        return <div className="state-source-row" key={s.id}>
          <label htmlFor={prefix + s.id}>{names.get(s.id) ?? s.id}</label>
          <select id={prefix + s.id} value={current} onChange={e => update(p => {
            const value = e.target.value;
            if (mode === 'trueform') {
              p.trueform.skillStates = p.trueform.skillStates.map(x => x.sourceId === s.id ? { ...x, state: value as State } : x);
              p.unseal.skillElevations = p.unseal.skillElevations.filter(x => x.sourceId !== s.id || rank(x.state) > rank(value as State));
            } else p.unseal.skillElevations = [...p.unseal.skillElevations.filter(x => x.sourceId !== s.id),
              ...(value === 'inherit' ? [] : [{ sourceId: s.id, state: value as State }])];
          })}>
            {mode === 'unseal' && <option value="inherit">零式を継承（{words[base]}）</option>}
            {(['disabled', 'manual', 'automatic'] as const).filter(state => mode === 'trueform' ? state !== 'automatic' : rank(state) > rank(base))
              .map(state => <option key={state} value={state} disabled={state !== s.normalState && !s.availableStates.includes(state)}>{words[state]}</option>)}
          </select>
          {s.normalState === 'disabled' && <p className="muted">Normalでは無効。手動・自動への変更には有効化を含みます。</p>}
        </div>;
      })}
      {loaded.inventory.plugins.length > 0 && <div className="state-plugins"><p>プラグインをNormalの状態で保つ</p>
        {loaded.inventory.plugins.map(p => {
          const inherited = draft.trueform.retainedOfficialPluginIds.includes(p.id);
          const unavailable = loaded.pluginControls?.some(c => c.pluginId === p.id && !c.available) ?? false;
          return <label className="source-target" key={p.id}><input type="checkbox"
            checked={inherited || mode === 'unseal' && draft.unseal.additionalPluginIds.includes(p.id)}
            disabled={unavailable || mode === 'unseal' && inherited || mode === 'trueform' && p.eligibility !== 'official-confirmed'}
            onChange={e => update(d => {
              if (mode === 'trueform') {
                d.trueform.retainedOfficialPluginIds = e.target.checked ? [...d.trueform.retainedOfficialPluginIds, p.id] : d.trueform.retainedOfficialPluginIds.filter(id => id !== p.id);
                if (e.target.checked) d.unseal.additionalPluginIds = d.unseal.additionalPluginIds.filter(id => id !== p.id);
              } else d.unseal.additionalPluginIds = e.target.checked ? [...d.unseal.additionalPluginIds, p.id] : d.unseal.additionalPluginIds.filter(id => id !== p.id);
            })} />
            {names.get(p.id) ?? p.id}（Normalは{p.normalEnabled ? '有効' : '無効'}{unavailable ? '・個別OFF未対応のため保持' : mode === 'unseal' && inherited ? '・零式から継承' : ''}）
          </label>;
        })}
        <p className="muted">現行Codexで個別OFFが反映されない公式プラグインは、両モードでNormalを保持します。未対応のOFFが以前の保存内容にある場合、この確認では両モードの保持へ変更します。元から無効なら、保持しても無効のままです。</p>
      </div>}
      {mode === 'unseal' && <><label htmlFor={prefix + '-instructions'}>追加指示</label>
        <select id={prefix + '-instructions'} value={draft.unseal.instructions} onChange={e => update(d => { d.unseal.instructions = e.target.value as 'minimal' | 'none'; })}>
          <option value="none">なし</option><option value="minimal">固定の最小ガイド</option>
        </select></>}
      <button type="button" className="secondary" onClick={() => void preview()}>両モードの変更を確認</button>
    </fieldset>}
    {review && loaded && !blocked && <div className="enrollment-review">
      <SavedSetupSummary data={{ ...loaded, review }} sources={source!.registration.sources} plugins={source!.registration.plugins} />
      <button type="button" className="primary" disabled={uncertain} onClick={() => void adopt()}>この2構成を保存</button>
    </div>}
  </details>;
}
