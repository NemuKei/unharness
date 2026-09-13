import {useState} from 'react';
import {Hangar} from '../Hangar';
import {preparedAppearances} from '../prepared-appearances';
import type {PreparedAppearanceId} from '../prepared-appearances';
import type {FixtureCase} from '../types';

const modes=[
  {label:'Normal',condition:'baseline',description:'眠りを包む、いつもの装備。'},
  {label:'限定解除',condition:'manual-only',description:'外装がほどけ、半覚醒の姿へ。'},
  {label:'零式',condition:'fixed-only',description:'身体を開き、完全覚醒。'},
] as const;
export function OriginalAppearanceExample({onInstall}:{onInstall:()=>void}) {
  const [condition,setCondition]=useState<FixtureCase>('manual-only');
  const [appearance,setAppearance]=useState<PreparedAppearanceId>('silver');
  const [effects,setEffects]=useState(true);
  const selected=preparedAppearances.find(look=>look.id===appearance)!;
  return <section className="original-example" aria-labelledby="original-example-title">
    <div className="original-example-heading">
      <div><p className="eyebrow">ORIGINAL APPEARANCE</p><h2 id="original-example-title">同じ装備。<br/><span>違う、AIの姿。</span></h2></div>
      <div><p className="original-example-lead">デフォルトと擬人化を、並べて体験。</p>
        <p>モードを切り替えると、同じ拘束具の中でそれぞれの姿が目覚めます。好きな外観を選び、自分のAIと作り替えることもできます。</p></div>
    </div>
    <div className="original-example-controls">
      <div className="original-mode-buttons" role="group" aria-label="比較プレビューのモード">
        {modes.map(mode=><button type="button" key={mode.condition} aria-pressed={condition===mode.condition} onClick={()=>setCondition(mode.condition)}>{mode.label}</button>)}
      </div>
      <label className="original-example-picker">擬人化の外観<select aria-label="擬人化の外観" value={appearance} onChange={event=>setAppearance(event.target.value as PreparedAppearanceId)}>
        {preparedAppearances.filter(look=>look.id!=='default').map(look=><option value={look.id} key={look.id}>{look.label}</option>)}
      </select></label>
      <label className="original-example-effects"><input type="checkbox" checked={effects} onChange={event=>setEffects(event.target.checked)}/>アニメーション</label>
    </div>
    <p className="original-example-mode-note" aria-live="polite">{modes.find(mode=>mode.condition===condition)?.description}</p>
    <div className="original-example-comparison" role="region" aria-label="デフォルトと擬人化の比較">
      <figure aria-label="比較プレビュー：デフォルト">
        <Hangar condition={condition} effects={effects}/>
        <figcaption><strong>デフォルト</strong><span>枝状の光を宿すコア</span></figcaption>
      </figure>
      <figure aria-label={'比較プレビュー：'+selected.label}>
        <Hangar condition={condition} effects={effects} artwork={selected.artwork} imageLoader={selected.image}/>
        <figcaption><strong>{selected.label}</strong><span>{selected.description}</span></figcaption>
      </figure>
    </div>
    <div className="original-example-footer">
      <p>導入後は「見た目」から、この外観を選べます。ここでは外観だけをプレビューしています。AIの設定や利用モデルは変わりません。</p>
      <button type="button" className="secondary" onClick={onInstall}>この外観を使ってみる</button>
    </div>
    <p className="original-example-note">同梱のキャラクターと光紋はUnharnessのオリジナル。画像の読込・合成・保存は、手元のPCで行います。</p>
  </section>;
}
