import standard from '../../assets/appearance-examples/default-v1/artwork.json' with {type:'json'};
import silver from '../../assets/appearance-examples/silver-v1/artwork.json' with {type:'json'};
import amber from '../../assets/appearance-examples/amber-v1/artwork.json' with {type:'json'};
import standardInput from '../../assets/appearance-templates/hangar-layered-v1/entity.png';
import silverInput from '../../assets/appearance-examples/silver-v1/entity-poses.png';
import silverNormal from '../../assets/appearance-examples/silver-v1/entity-normal.png';
import silverUnseal from '../../assets/appearance-examples/silver-v1/entity-unseal.png';
import silverTrueform from '../../assets/appearance-examples/silver-v1/entity-trueform.png';
import amberInput from '../../assets/appearance-examples/amber-v1/entity-poses.png';
import amberNormal from '../../assets/appearance-examples/amber-v1/entity-normal.png';
import amberUnseal from '../../assets/appearance-examples/amber-v1/entity-unseal.png';
import amberTrueform from '../../assets/appearance-examples/amber-v1/entity-trueform.png';
import {validArtworkItem} from './artwork';
import type {ArtworkItem,ArtworkImageLoader,ArtworkUpload} from './artwork';
import {ENTITY_MODES} from '../../src/appearances/entity-profile.mjs';
import {readArtworkBase64} from './artwork-upload';

export type PreparedAppearanceId='default'|'silver'|'amber';
export type PreparedAppearance={id:PreparedAppearanceId;label:string;description:string;artwork:Extract<ArtworkItem,{kind:'layered'}>;
  image:ArtworkImageLoader;inputUrl:string;partId:'entity'|'entity-poses'};
function make(id:PreparedAppearanceId,value:unknown,description:string,inputUrl:string,urls:string[]):PreparedAppearance {
  if(!validArtworkItem(value) || value.kind!=='layered')throw Error('appearance-example-invalid');
  const artwork=value,manifest=artwork.manifest;
  const ids=manifest.schemaVersion===2 ? ENTITY_MODES.map(mode=>manifest.layers.entity.poses[mode].assetId):[manifest.layers.entity.assetId];
  const images=new Map(ids.map((assetId,i)=>[assetId,urls[i]]));
  const image:ArtworkImageLoader=async(asset,signal)=>{
    const url=images.get(asset.assetId);if(!url)throw Error('appearance-example-invalid');
    const response=await fetch(url,{signal,credentials:'omit',cache:'force-cache'});
    if(!response.ok)throw Error('appearance-example-unavailable');return response.blob();
  };
  return {id,label:artwork.name!,description,artwork,image,inputUrl,partId:manifest.schemaVersion===2?'entity-poses':'entity'};
}
export const preparedAppearances:readonly PreparedAppearance[]=[
  make('default',standard,'枝状の光を宿すコア',standardInput,[standardInput]),
  make('silver',silver,'白銀のショートヘアとシアンの光',silverInput,[silverNormal,silverUnseal,silverTrueform]),
  make('amber',amber,'栗色のロングヘアと琥珀色の光',amberInput,[amberNormal,amberUnseal,amberTrueform]),
];
export async function prepareAppearanceUpload(look:PreparedAppearance,expectedStateId:string|null,signal:AbortSignal):Promise<ArtworkUpload> {
  if(!preparedAppearances.includes(look))throw Error('appearance-example-invalid');
  const response=await fetch(look.inputUrl,{signal,credentials:'omit',cache:'force-cache'});
  if(!response.ok)throw Error('appearance-example-unavailable');
  const blob=await response.blob();if(blob.size>8*1024*1024)throw Error('appearance-image-invalid');
  const base64=await readArtworkBase64(blob,signal);
  return {importId:crypto.randomUUID(),expectedStateId,manifest:{templateId:look.artwork.manifest.templateId,baseItemId:null,
    name:look.label,author:look.artwork.author,parts:[{partId:look.partId,fileId:look.partId}]},files:[{fileId:look.partId,base64}]};
}
