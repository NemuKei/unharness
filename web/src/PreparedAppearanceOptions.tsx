import {useEffect,useRef,useState} from 'react';
import {preparedAppearances,prepareAppearanceUpload} from './prepared-appearances';
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
  return <div className="art-prepared"><p className="art-prepared-label">用意された外観から選ぶ</p>
    <div className="art-prepared-options" role="group" aria-label="用意された外観">
      {preparedAppearances.map(look=>{const active=selectedKey===layerManifestKey(look.artwork.manifest) || !selected && look.id==='default';
        return <button type="button" key={look.id} className={'art-prepared-option '+look.id} aria-pressed={active} disabled={blocked || active}
          onClick={()=>void choose(look)}><strong>{look.label}</strong><span>{preparing===look.id?'選択中…':look.description}</span></button>;})}
    </div>
    <p className="muted">見た目を自由に選べます。利用するAIや装備の設定は変わりません。</p>
    {error && <p role="alert" className="art-error">{error}</p>}
  </div>;
}
