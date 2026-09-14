import { text as t } from './locale.ts';
import {useEffect,useRef,useState} from 'react';
import {preparedAppearances,prepareAppearanceUpload,preparedAppearanceLabel,preparedAppearanceDescription} from './prepared-appearances';
import type {PreparedAppearance} from './prepared-appearances';
import {layerManifestKey} from './appearance-layers';
import {appearanceErrorMessage} from './appearances';
import type {AppearanceController} from './useAppearanceController';

export function PreparedAppearanceOptions({controller:c}:{controller:AppearanceController}) {
  const [preparing,setPreparing]=useState<string|null>(null),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{setPreparing(null);setError('');return()=>controller.current?.abort();},[c.key]);
  const selected=c.view?.selectedItem;
  const selectedKey=selected?.kind==='layered'?layerManifestKey(selected.manifest):null;
  const blocked=!!preparing || !c.enabled || !c.confirmed || c.mutating || c.uncertain || c.view?.recoveryRequired;
  async function choose(look:PreparedAppearance) {
    if(blocked)return;
    const abort=new AbortController();controller.current?.abort();controller.current=abort;setPreparing(look.id);setError('');
    try{await c.choosePrepared(look.artwork.manifest,stateId=>prepareAppearanceUpload(look,stateId,abort.signal),abort.signal);}
    catch(e){if(!abort.signal.aborted)setError(appearanceErrorMessage(e));}
    finally{if(!abort.signal.aborted)setPreparing(null);}
  }
  return <div className="art-prepared"><p className="art-prepared-label">{t("用意された外観から選ぶ", "Choose a bundled appearance")}</p>
    <div className="art-prepared-options" role="group" aria-label={t("用意された外観", "Bundled appearances")}>
      {preparedAppearances.map(look=>{const active=selectedKey===layerManifestKey(look.artwork.manifest) || !selected && look.id==='default';
        return <button type="button" key={look.id} className={'art-prepared-option '+look.id} aria-pressed={active} disabled={blocked || active}
          onClick={()=>void choose(look)}><strong>{preparedAppearanceLabel(look)}</strong><span>{preparing===look.id?t("選択中…", "Selecting…"):preparedAppearanceDescription(look)}</span></button>;})}
    </div>
    <p className="muted">{t("見た目を自由に選べます。利用するAIや装備の設定は変わりません。", "Choose any look. Your AI and loadout settings stay unchanged.")}</p>
    {error && <p role="alert" className="art-error">{error}</p>}
  </div>;
}
