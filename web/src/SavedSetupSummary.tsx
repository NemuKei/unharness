import type { SourceRow } from './sources';

type SkillState = { id: string; enabled: boolean; manualOnly: boolean };
type Preset = { instructionStyle: 'minimal' | 'none'; skillStates: SkillState[] };
export type SetupRead = {
  scopeId: string; normalId: string; setupId: string | null;
  review: null | { schemaVersion: 1 | 2; presets: Record<'unseal' | 'trueform', Preset>;
    inheritance?: { inheritedSkillIds: string[]; additionalSkillIds: string[] } };
  inventory: null | { skills: Array<{ requiredControl: boolean }>;
    plugins: Array<{ id: string; eligibility: 'official-confirmed' | 'not-official' | 'unknown' }> };
  inventoryError: string | null;
};

export function readableSetup(data: SetupRead) {
  if (!data?.review || ![1, 2].includes(data.review.schemaVersion)) return false;
  if (data.review.schemaVersion === 1) return true;
  const lists = data.review.inheritance;
  return !!lists && [lists.inheritedSkillIds, lists.additionalSkillIds].every(ids => Array.isArray(ids) && ids.every(id => typeof id === 'string'))
    && ['unseal', 'trueform'].every(mode => {
      const preset = data.review!.presets?.[mode as 'unseal' | 'trueform'];
      return preset && ['minimal', 'none'].includes(preset.instructionStyle) && Array.isArray(preset.skillStates)
        && preset.skillStates.every(s => s && typeof s.enabled === 'boolean' && typeof s.manualOnly === 'boolean');
    }) && (data.inventory === null || (Array.isArray(data.inventory?.skills) && Array.isArray(data.inventory?.plugins)
      && data.inventory.skills.every(s => s && typeof s.requiredControl === 'boolean')
      && data.inventory.plugins.every(p => p && typeof p.id === 'string' && ['official-confirmed', 'not-official', 'unknown'].includes(p.eligibility))));
}

export function SavedSetupSummary({ data, sources }: { data: SetupRead; sources: SourceRow[] }) {
  const review = data.review!;
  const names = new Map(sources.map(s => [s.id, s.label]));
  const skillList = (ids: string[]) => <><p>{ids.length}件</p>{ids.length ? <ul>{ids.map(id => <li key={id}>{names.get(id) ?? '登録情報を再確認してください'}</li>)}</ul>
    : <p className="muted">自動使用する対象はありません。</p>}</>;
  return <section className="saved-setup-summary" aria-label="保存した2構成">
    {review.schemaVersion === 1 ? <p>旧規則の保存版です。零式と限定解除の選択は独立しています。新しい継承規則への変更は、AIと両モードを確認して別の版として保存します。</p>
      : <>
        <div className="setup-inheritance-lists">
          <div><h3>零式から引き継ぐもの</h3>{skillList(review.inheritance!.inheritedSkillIds)}</div>
          <div><h3>限定解除で追加するもの</h3>{skillList(review.inheritance!.additionalSkillIds)}</div>
        </div>
        <p className="muted">限定解除は零式の全対象を引き継ぎます。変更するときはAIと両モードを確認し、新しい版として保存します。</p>
        <dl className="setup-skill-counts">{(['trueform', 'unseal'] as const).map(mode => {
          const preset = review.presets[mode], states = preset.skillStates;
          return <div key={mode}><dt>{mode === 'trueform' ? '零式' : '限定解除'}の保存内容</dt><dd>
            追加指示：{preset.instructionStyle === 'none' ? 'なし' : '固定の最小ガイド'}<br />
            自動 {states.filter(s => s.enabled && !s.manualOnly).length}件 / 明示呼び出し {states.filter(s => s.enabled && s.manualOnly).length}件 / 無効のまま {states.filter(s => !s.enabled).length}件
          </dd></div>;
        })}</dl>
        <p className="muted">上の件数は保存時の任意Skillです。Unharnessの管理機能と接続、メモリ、作業継続、権限、必須条件は共通で保持します。</p>
        <details className="setup-eligibility"><summary>現在の候補確認</summary>
          {data.inventory ? <>
            <p>登録範囲内のプラグイン {data.inventory.plugins.length}件 / 共通で保持する管理Skill {data.inventory.skills.filter(s => s.requiredControl).length}件</p>
            {data.inventory.plugins.length > 0 && <ul>{data.inventory.plugins.map(p => <li key={p.id}>{p.id}：{p.eligibility === 'official-confirmed'
              ? '公式由来を確認済み。選択・制御の確認は別です。' : p.eligibility === 'not-official' ? '公式候補の対象外。零式には選べません。' : '公式由来は未確認。零式には選べません。'}</li>)}</ul>}
          </> : <p role="status">現在の由来・制御情報を確認できませんでした。保存内容だけを表示しています。状態を確認し、現在の構成から相談してください。</p>}
          <p className="muted">未登録・この版では対象外のSkillは、下の「未登録のSkillを確認する」で確認できます。</p>
        </details>
      </>}
  </section>;
}
