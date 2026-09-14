import { text as t } from './locale.ts';
import amberUnfold8 from '../../assets/appearance-examples/amber-v2/entity-unfold-8.png';
import amberUnfold7 from '../../assets/appearance-examples/amber-v2/entity-unfold-7.png';
import amberUnfold6 from '../../assets/appearance-examples/amber-v2/entity-unfold-6.png';
import amberUnfold5 from '../../assets/appearance-examples/amber-v2/entity-unfold-5.png';
import amberUnfold4 from '../../assets/appearance-examples/amber-v2/entity-unfold-4.png';
import amberUnfold3 from '../../assets/appearance-examples/amber-v2/entity-unfold-3.png';
import amberUnfold2 from '../../assets/appearance-examples/amber-v2/entity-unfold-2.png';
import amberUnfold1 from '../../assets/appearance-examples/amber-v2/entity-unfold-1.png';
import amberUnfold0 from '../../assets/appearance-examples/amber-v2/entity-unfold-0.png';
import silverUnfold8 from '../../assets/appearance-examples/silver-v2/entity-unfold-8.png';
import silverUnfold7 from '../../assets/appearance-examples/silver-v2/entity-unfold-7.png';
import silverUnfold6 from '../../assets/appearance-examples/silver-v2/entity-unfold-6.png';
import silverUnfold5 from '../../assets/appearance-examples/silver-v2/entity-unfold-5.png';
import silverUnfold4 from '../../assets/appearance-examples/silver-v2/entity-unfold-4.png';
import silverUnfold3 from '../../assets/appearance-examples/silver-v2/entity-unfold-3.png';
import silverUnfold2 from '../../assets/appearance-examples/silver-v2/entity-unfold-2.png';
import silverUnfold1 from '../../assets/appearance-examples/silver-v2/entity-unfold-1.png';
import silverUnfold0 from '../../assets/appearance-examples/silver-v2/entity-unfold-0.png';
import standard from '../../assets/appearance-examples/default-v1/artwork.json' with {type:'json'};
import silver from '../../assets/appearance-examples/silver-v2/artwork.json' with {type:'json'};
import amber from '../../assets/appearance-examples/amber-v2/artwork.json' with {type:'json'};
import standardInput from '../../assets/appearance-templates/hangar-layered-v1/entity.png';
import silverInput from '../../assets/appearance-examples/silver-v2/entity-motion.png';
import silverNormal from '../../assets/appearance-examples/silver-v2/entity-normal.png';
import silverUnseal from '../../assets/appearance-examples/silver-v2/entity-unseal.png';
import silverTrueform from '../../assets/appearance-examples/silver-v2/entity-trueform.png';
import amberInput from '../../assets/appearance-examples/amber-v2/entity-motion.png';
import amberNormal from '../../assets/appearance-examples/amber-v2/entity-normal.png';
import amberUnseal from '../../assets/appearance-examples/amber-v2/entity-unseal.png';
import amberTrueform from '../../assets/appearance-examples/amber-v2/entity-trueform.png';
import {validArtworkItem} from './artwork';
import type {ArtworkItem,ArtworkImageLoader,ArtworkUpload} from './artwork';
import {entityAssetIds} from '../../src/appearances/entity-profile.mjs';
import {readArtworkBase64} from './artwork-upload';

export type PreparedAppearanceId='default'|'silver'|'amber';
export type PreparedAppearance={id:PreparedAppearanceId;label:string;description:string;artwork:Extract<ArtworkItem,{kind:'layered'}>;
  image:ArtworkImageLoader;inputUrl:string;partId:'entity'|'entity-poses'|'entity-motion'};
function make(id:PreparedAppearanceId,value:unknown,description:string,inputUrl:string,urls:string[]):PreparedAppearance {
  if(!validArtworkItem(value) || value.kind!=='layered')throw Error('appearance-example-invalid');
  const artwork=value,manifest=artwork.manifest;
  const ids=entityAssetIds(manifest);
  const images=new Map(ids.map((assetId,i)=>[assetId,urls[i]]));
  const image:ArtworkImageLoader=async(asset,signal)=>{
    const url=images.get(asset.assetId);if(!url)throw Error('appearance-example-invalid');
    const response=await fetch(url,{signal,credentials:'omit',cache:'force-cache'});
    if(!response.ok)throw Error('appearance-example-unavailable');return response.blob();
  };
  return {id,label:artwork.name!,description,artwork,image,inputUrl,partId:manifest.schemaVersion===2?(manifest.layers.entity.profileId==='entity-awakening/v2'?'entity-motion':'entity-poses'):'entity'};
}
export const preparedAppearances:readonly PreparedAppearance[]=[
  make('default',standard,'枝状の光を宿すコア',standardInput,[standardInput]),
  make('silver',silver,'白銀のショートヘアとシアンの光',silverInput,[silverNormal,silverUnseal,silverUnfold0,silverUnfold1,silverUnfold2,silverUnfold3,silverUnfold4,silverUnfold5,silverUnfold6,silverUnfold7,silverUnfold8,silverTrueform]),
  make('amber',amber,'栗色のロングヘアと琥珀色の光',amberInput,[amberNormal,amberUnseal,amberUnfold0,amberUnfold1,amberUnfold2,amberUnfold3,amberUnfold4,amberUnfold5,amberUnfold6,amberUnfold7,amberUnfold8,amberTrueform]),
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

// Localized display only; importing preserves each bundled artwork's original name.
export function preparedAppearanceLabel(look: PreparedAppearance) {
  return t(look.label, ({ default: 'Original', silver: 'Silver', amber: 'Amber' })[look.id]);
}
export function preparedAppearanceDescription(look: PreparedAppearance) {
  return t(look.description, ({ default: 'A core of branching light', silver: 'Silver hair and cyan light', amber: 'Chestnut hair and amber light' })[look.id]);
}
