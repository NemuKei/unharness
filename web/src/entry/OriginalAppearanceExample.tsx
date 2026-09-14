import { getLocale, text as t } from '../locale.ts';
import {useState,useSyncExternalStore} from 'react';
import {Hangar} from '../Hangar';
import {preparedAppearances, preparedAppearanceLabel, preparedAppearanceDescription} from '../prepared-appearances';
import type {PreparedAppearanceId} from '../prepared-appearances';
import type {SourceMode} from '../sources';
import {publicModes,demoSources} from './public-modes';

const modes=[
  {get label() { return t("通常", "Normal"); },mode:'normal'},
  {get label() { return t("限定解除", "UNSEAL"); },mode:'unseal'},
  {get label() { return t("零式", "TRUEFORM"); },mode:'trueform'},
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
      <div><p className="eyebrow">{t("モードを選んで、装備を試着。", "TRY ON A DIFFERENT LOADOUT")}</p><h2 id="original-example-title">{t("装備を変える。", "Change your loadout.")}<br/><span>{t("姿も変わる。", "Watch it awaken.")}</span></h2></div>
      <div><p className="original-example-lead">{t("ハーネスの見直しを、", "Review your harness")}<br/>{t("ゲームの装備変更のように。", "like changing your gear.")}</p>
        <p>{t("通常・限定解除・零式を選ぶと、設定例と姿が一緒に変わります。ふだんの構成を残しながら、外す・戻す感覚を試してみてください。", "Choose Normal, UNSEAL or TRUEFORM to explore sample settings and artwork together. Keep your everyday setup while you try a different combination.")}</p></div>
    </div>
    <div className="original-example-controls">
      <div className="original-mode-buttons" role="group" aria-label={t("比較プレビューのモード", "Comparison preview mode")}>
        {modes.map(choice=><button type="button" key={choice.mode} aria-pressed={mode===choice.mode} onClick={()=>setMode(choice.mode)}>{choice.label}</button>)}
      </div>
      {!showAll && <div className="original-example-picker"><span>{t("擬人化の外観", "Character appearance")}</span><div className="original-mode-buttons" role="group" aria-label={t("擬人化の外観", "Character appearance")}>
        {humanoids.map(look=><button type="button" key={look.id} aria-pressed={appearance===look.id} onClick={()=>setAppearance(look.id)}>{preparedAppearanceLabel(look)}</button>)}
      </div></div>}
      <label className="original-example-effects"><input type="checkbox" checked={effects} onChange={event=>setEffects(event.target.checked)}/>{t("アニメーション", "Animation")}</label>
    </div>
    <section className="original-mode-summary" aria-label={t("このモードで試せること", "What this mode lets you try")} aria-live="polite">
      <p className="original-example-mode-note"><strong>{selected.title} ／ {selected.label}</strong><span>{selected.description}</span></p>
      <dl><div><dt>{t("グローバルAGENTS.mdの例", "Example global AGENTS.md")}</dt><dd>{sample.instructions}</dd></div><div><dt>{t("自作Skillの例", "Example authored Skill")}</dt><dd>{sample.authoredSkill}</dd></div><div><dt>{t("外部Skillの例", "Example third-party Skill")}</dt><dd>{sample.externalSkill}</dd></div></dl>
      <p className="original-scope-note">{t("リポジトリ内のAGENTS.mdは、各モードで保持します。", "Repository AGENTS.md requirements stay in every mode.")}</p>
    </section>
    <p className="original-example-note">{t("設定例と外観を体験するデモです。あなたのAI設定は変わりません。姿の変化はモードの演出で、性能の優劣を表しません。", "This demo shows sample settings and artwork. It does not change your AI settings. Appearance does not rank performance.")}</p>
    <div className="original-example-comparison" data-layout={showAll?'all':'selected'} role="region" aria-label={t("デフォルトと擬人化の比較", "Original and character appearance comparison")}>
      <figure aria-label={t("比較プレビュー：デフォルト", "Comparison preview: Original")}>
        <Hangar condition={selected.scene} effects={effects} locale={getLocale()}/>
        <figcaption><strong>{t("デフォルト", "Original")}</strong><span>{t("枝状の光を宿すコア", "A core of branching light")}</span></figcaption>
      </figure>
      {visibleHumanoids.map(look=><figure key={look.id} aria-label={t('比較プレビュー：', 'Comparison preview: ') + preparedAppearanceLabel(look)}>
        <Hangar condition={selected.scene} effects={effects} artwork={look.artwork} imageLoader={look.image} locale={getLocale()}/>
        <figcaption><strong>{preparedAppearanceLabel(look)}</strong><span>{preparedAppearanceDescription(look)}</span></figcaption>
      </figure>)}
    </div>
    <div className="original-example-footer">
      <div><h3>{t("次は、自分だけの姿で。", "Next, make it your own.")}</h3><p>{t("メカも、擬人化も。イメージをふだんのAIに伝えて、本体・拘束具・背景を自分仕様に。導入後は「見た目」から、同梱の白銀・琥珀を選んだり、新しい姿を作ったりできます。", "Mechanical or humanlike: share your idea with your own AI and create an entity, restraints and background. After installation, choose the bundled Silver or Amber look, or create your own in Appearance.")}</p></div>
      <button type="button" className="secondary" onClick={onInstall}>{t("自分のオリジナルを作る", "Create your own appearance")}</button>
    </div>
    <p className="original-example-note">{t("好きな姿は、性能の評価に関係なく自由に選べます。外観を選んでも設定は変わりません。同梱のキャラクターと光紋はUnharnessのオリジナルです。", "Choose any look independently of performance. Appearance selection leaves your settings unchanged. The bundled characters and light patterns are original Unharness artwork.")}</p>
  </section>;
}
