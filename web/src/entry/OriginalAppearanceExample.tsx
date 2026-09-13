import {useState,useSyncExternalStore} from 'react';
import {Hangar} from '../Hangar';
import {preparedAppearances} from '../prepared-appearances';
import type {PreparedAppearanceId} from '../prepared-appearances';
import type {SourceMode} from '../sources';
import {publicModes,demoSources} from './public-modes';

const modes=[
  {label:'通常',mode:'normal'},
  {label:'限定解除',mode:'unseal'},
  {label:'零式',mode:'trueform'},
] as const;
const desktopQuery='(min-width: 960px)';
const isDesktop=()=>matchMedia(desktopQuery).matches;
const subscribeViewport=(notify:()=>void)=>{
  const media=matchMedia(desktopQuery);media.addEventListener('change',notify);
  return ()=>media.removeEventListener('change',notify);
};
const humanoids=preparedAppearances.filter(look=>look.id!=='default');
export function OriginalAppearanceExample({onInstall}:{onInstall:()=>void}) {
  const [mode,setMode]=useState<SourceMode>('unseal');
  const [appearance,setAppearance]=useState<PreparedAppearanceId>('silver');
  const [effects,setEffects]=useState(true);
  const showAll=useSyncExternalStore(subscribeViewport,isDesktop,()=>false);
  const visibleHumanoids=showAll?humanoids:humanoids.filter(look=>look.id===appearance);
  const selected=publicModes[mode],sample=demoSources[mode];
  return <section className="original-example" aria-labelledby="original-example-title">
    <div className="original-example-heading">
      <div><p className="eyebrow">モードを選んで、装備を試着。</p><h2 id="original-example-title">装備を変える。<br/><span>姿も変わる。</span></h2></div>
      <div><p className="original-example-lead">ハーネスの見直しを、<br/>ゲームの装備変更のように。</p>
        <p>通常・限定解除・零式を選ぶと、設定例と姿が一緒に変わります。ふだんの構成を残しながら、外す・戻す感覚を試してみてください。</p></div>
    </div>
    <div className="original-example-controls">
      <div className="original-mode-buttons" role="group" aria-label="比較プレビューのモード">
        {modes.map(choice=><button type="button" key={choice.mode} aria-pressed={mode===choice.mode} onClick={()=>setMode(choice.mode)}>{choice.label}</button>)}
      </div>
      {!showAll && <div className="original-example-picker"><span>擬人化の外観</span><div className="original-mode-buttons" role="group" aria-label="擬人化の外観">
        {humanoids.map(look=><button type="button" key={look.id} aria-pressed={appearance===look.id} onClick={()=>setAppearance(look.id)}>{look.label}</button>)}
      </div></div>}
      <label className="original-example-effects"><input type="checkbox" checked={effects} onChange={event=>setEffects(event.target.checked)}/>アニメーション</label>
    </div>
    <section className="original-mode-summary" aria-label="このモードで試せること" aria-live="polite">
      <p className="original-example-mode-note"><strong>{selected.title} ／ {selected.label}</strong><span>{selected.description}</span></p>
      <dl><div><dt>追加指示の例</dt><dd>{sample.instructions}</dd></div><div><dt>自作Skillの例</dt><dd>{sample.authoredSkill}</dd></div><div><dt>外部Skillの例</dt><dd>{sample.externalSkill}</dd></div></dl>
    </section>
    <p className="original-example-note">設定例と外観を体験するデモです。あなたのAI設定は変わりません。姿の変化はモードの演出で、性能の優劣を表しません。</p>
    <div className="original-example-comparison" data-layout={showAll?'all':'selected'} role="region" aria-label="デフォルトと擬人化の比較">
      <figure aria-label="比較プレビュー：デフォルト">
        <Hangar condition={selected.scene} effects={effects}/>
        <figcaption><strong>デフォルト</strong><span>枝状の光を宿すコア</span></figcaption>
      </figure>
      {visibleHumanoids.map(look=><figure key={look.id} aria-label={'比較プレビュー：'+look.label}>
        <Hangar condition={selected.scene} effects={effects} artwork={look.artwork} imageLoader={look.image}/>
        <figcaption><strong>{look.label}</strong><span>{look.description}</span></figcaption>
      </figure>)}
    </div>
    <div className="original-example-footer">
      <div><h3>次は、自分だけの姿で。</h3><p>メカも、擬人化も。イメージをふだんのAIに伝えて、本体・拘束具・背景を自分仕様に。導入後は「見た目」から、同梱の白銀・琥珀を選んだり、新しい姿を作ったりできます。</p></div>
      <button type="button" className="secondary" onClick={onInstall}>自分のオリジナルを作る</button>
    </div>
    <p className="original-example-note">好きな姿は、性能の評価に関係なく自由に選べます。外観を選んでも設定は変わりません。同梱のキャラクターと光紋はUnharnessのオリジナルです。</p>
  </section>;
}
