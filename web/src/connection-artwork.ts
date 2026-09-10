// Public wire validation, not the private API or an image decoder. Accepted
// metadata is copied; images are separately checked by the existing renderer.
import stock from '../../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };
import { connectionFields, connectionRecord, isConnectionHash as hash, isConnectionId as uuid } from './connection-contract.ts';
import { readPublicReceipt } from './connection-results.ts';
import type { PublicReceipt } from './connection-results.ts';
import type { ArtworkItem, ArtworkReceipt, ArtworkReview, ArtworkView, ArtworkAction } from './artwork';
import type { LayerAsset } from './appearance-layers';

export const ARTWORK_WRITES = ['review-appearance-import', 'save-appearance-import', 'select-appearance', 'name-appearance', 'recover-appearance'] as const;
export type ArtworkWrite = typeof ARTWORK_WRITES[number];
export type ArtworkRead = 'artwork' | 'artwork-item' | 'read-appearance-import';
export type ArtworkItemView = { scopeId: string; collectionScopeId: string; stateId: string; item: ArtworkItem };
export type ArtworkReadResult = ArtworkView | ArtworkReview | ArtworkItemView;
type Failed = { ok: false; error: { kind: string } };
export type PublicArtworkReceipt =
  | { requestId: string; operation: 'review-appearance-import'; state: 'completed'; result: { ok: true; data: ArtworkReview } }
  | { requestId: string; operation: Exclude<ArtworkWrite, 'review-appearance-import'>; state: 'completed'; result: { ok: true; data: ArtworkReceipt } }
  | { requestId: string; operation: ArtworkWrite; state: 'completed'; result: Failed }
  | { requestId: string; operation: ArtworkWrite; state: 'running' }
  | { requestId: string; operation: ArtworkWrite; state: 'unconfirmed' }
  | { requestId: string; operation: null; state: 'not-found' };
export type PublicOperationReceipt = PublicReceipt | PublicArtworkReceipt;
export class PublicArtworkError extends Error {
  kind: string;
  constructor(kind: string) { super(kind); this.kind = kind; }
}
function invalid(): never { throw new PublicArtworkError('remote-artwork-unconfirmed'); }
function reject(): never { throw new PublicArtworkError('remote-invalid-request'); }
const record = (v: unknown) => { try { return connectionRecord(v); } catch { return invalid(); } };
const fields = (v: Record<string, unknown>, keys: string[]) => { try { connectionFields(v, keys); } catch { invalid(); } };
const nullable = (v: unknown) => v === null || hash(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const label = (v: unknown, empty = true): v is string => typeof v === 'string' && v.length <= 80 && (empty || !!v.trim()) && !/[\u0000-\u001f\u007f-\u009f]/.test(v);
const fileId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v);
const parts = ['entity', 'background', ...stock.manifest.layers.restraints.map(p => p.partId)];
export const isArtworkWrite = (v: unknown): v is ArtworkWrite => typeof v === 'string' && (ARTWORK_WRITES as readonly string[]).includes(v);
export function readLayerAsset(value: unknown): LayerAsset {
  const v = record(value); fields(v, ['assetId', 'format', 'width', 'height', 'bytes']);
  if (!hash(v.assetId) || v.format !== 'png' || v.width !== 724 || v.height !== 724 || !count(v.bytes) || !v.bytes || v.bytes > 8*1024*1024) invalid();
  return { assetId: v.assetId, format: 'png', width: 724, height: 724, bytes: v.bytes };
}
function manifest(value: unknown) {
  const v = record(value); fields(v, ['kind','schemaVersion','templateId','assets','layers']);
  if (v.kind !== 'unharness-layered-appearance' || v.schemaVersion !== 1 || v.templateId !== stock.manifest.templateId || !Array.isArray(v.assets) || !v.assets.length || v.assets.length > 64) invalid();
  const assets = v.assets.map(readLayerAsset), ids = new Set(assets.map(a => a.assetId));
  if (ids.size !== assets.length || assets.reduce((sum,a) => sum+a.bytes,0) > 64*1024*1024) invalid();
  const l = record(v.layers); fields(l, ['entity','background','restraints']); const used = new Set<string>();
  for (const name of ['entity','background']) { const p = record(l[name]); fields(p,['assetId']); if (!hash(p.assetId) || !ids.has(p.assetId)) invalid(); used.add(p.assetId); }
  if (!Array.isArray(l.restraints) || l.restraints.length !== stock.manifest.layers.restraints.length) invalid();
  const seen = new Set();
  for (const part of l.restraints) { const p=record(part); fields(p,['partId','assetId']);
    if (!stock.manifest.layers.restraints.some(s=>s.partId===p.partId) || seen.has(p.partId) || !hash(p.assetId) || !ids.has(p.assetId)) invalid();
    seen.add(p.partId); used.add(p.assetId);
  }
  if (used.size !== ids.size) invalid();
}
function recipe(value: unknown) {
  const v=record(value); fields(v,['schemaVersion','selectorVersion','rendererVersion','seed','origin','artPack','body','palette','details','modes','treatments']);
  const art=record(v.artPack), palette=record(v.palette), colors=record(palette.colors);
  fields(art,['version','sourceSha256','backgroundSha256']); fields(palette,['id','colors']); fields(colors,['core','light','metal','dark']);
  if (v.schemaVersion!==1 || v.selectorVersion!=='weighted-sha256/v1' || v.rendererVersion!=='mechanical-appearance/v1' || !hash(v.seed)
    || !['prepared','original'].includes(String(v.origin)) || v.body!=='mechanical-lattice' || !['filament','forked-light','facet-light'].includes(String(v.details))
    || art.version!=='hangar-v4-mechanical-cels' || art.sourceSha256!=='c52d86961576963e0cfcec1bad915fa8510d622c7d3d83ddba35e6e44db224dc'
    || art.backgroundSha256!=='926a3ef15b4aa80c85571d6c1658719e30032b4fce95a9127e07cab91a90f062'
    || typeof palette.id!=='string' || !/^[a-z][a-z0-9-]{0,31}$/.test(palette.id) || Object.values(colors).some(c=>typeof c!=='string'||!/^#[a-f0-9]{6}$/.test(c))) invalid();
  for (const [values, allowed] of [[v.modes,['normal','unseal','trueform']],[v.treatments,['neutral','good','bad']]])
    if (!Array.isArray(values) || !values.length || values.length>3 || new Set(values).size!==values.length || values.some(m=>!(allowed as string[]).includes(m))) invalid();
}
function item(value: unknown) {
  const v=record(value); if (!hash(v.id) || !(v.name===null || label(v.name))) invalid();
  if (v.kind==='layered') { fields(v,['id','kind','name','author','parentItemId','manifest']); if (!label(v.author) || !nullable(v.parentItemId)) invalid(); manifest(v.manifest); }
  else { fields(v,['id','kind','name','recipe']); if (v.kind!=='recipe') invalid(); recipe(v.recipe); }
}
function binding(v: Record<string,unknown>, scopeId?: string, collectionId?: string) {
  if (!hash(v.scopeId) || !hash(v.collectionScopeId)) invalid();
  if (scopeId!==undefined && v.scopeId!==scopeId || collectionId!==undefined && v.collectionScopeId!==collectionId) throw new PublicArtworkError('remote-connection-changed');
}
export function readArtworkData(action: ArtworkRead | 'review-appearance-import', value: unknown, scopeId?: string, collectionId?: string): ArtworkReadResult {
  const v=record(value); binding(v,scopeId,collectionId);
  if (action==='artwork-item') {
    fields(v,['scopeId','collectionScopeId','stateId','item']); if (!hash(v.stateId)) invalid(); item(v.item);
  } else if (action==='artwork') {
    fields(v,['scopeId','collectionScopeId','collectionRevision','stateId','recoveryRequired','pendingStateId','selectedItem','itemCount','collection','nextCursor']);
    if (!count(v.collectionRevision) || !nullable(v.stateId) || typeof v.recoveryRequired!=='boolean' || !nullable(v.pendingStateId)
      || v.recoveryRequired!==(v.pendingStateId!==null) || !count(v.itemCount) || v.itemCount>128 || !Array.isArray(v.collection) || v.collection.length>20 || v.collection.length>v.itemCount || !nullable(v.nextCursor)) invalid();
    if (v.stateId===null) { if(v.collectionRevision!==0 || v.selectedItem!==null || v.itemCount!==0) invalid(); }
    else { if (!v.collectionRevision || !v.itemCount) invalid(); item(v.selectedItem); }
    const ids=new Set();
    for(const row of v.collection) { const r=record(row); fields(r,['id','kind','name','origin','paletteId','details','author','parentItemId']);
      if(!hash(r.id)||ids.has(r.id)||!(r.name===null||label(r.name))||!(r.author===null||label(r.author))||!nullable(r.parentItemId)) invalid(); ids.add(r.id);
      if(r.kind==='layered') { if(r.origin!=='imported'||r.paletteId!==null||r.details!==null) invalid(); }
      else if(r.kind!=='recipe'||!['prepared','original'].includes(String(r.origin))||!label(r.paletteId)||!['filament','forked-light','facet-light'].includes(String(r.details))) invalid();
    }
    if(v.nextCursor!==null && (!v.collection.length || record(v.collection.at(-1)).id!==v.nextCursor)) invalid();
  } else {
    fields(v,['scopeId','collectionScopeId','reviewId','expectedStateId','proposedItemId','baseItemId','name','author','manifest','replacedParts','images']);
    if(!hash(v.reviewId)||!hash(v.proposedItemId)||!nullable(v.expectedStateId)||!nullable(v.baseItemId)||!label(v.name,false)||!label(v.author)
      ||!Array.isArray(v.replacedParts)||!v.replacedParts.length||v.replacedParts.some(p=>!parts.includes(p))||new Set(v.replacedParts).size!==v.replacedParts.length
      ||!Array.isArray(v.images)||!v.images.length||v.images.length>64) invalid();
    manifest(v.manifest); const assets=(record(v.manifest).assets as LayerAsset[]), ids=new Set();
    for(const image of v.images) { const i=record(image); fields(i,['fileId','assetId','sourceWidth','sourceHeight','resized']);
      if(!fileId(i.fileId)||ids.has(i.fileId)||!assets.some(a=>a.assetId===i.assetId)||!count(i.sourceWidth)||!i.sourceWidth||i.sourceWidth>2048||i.sourceHeight!==i.sourceWidth||i.resized!==(i.sourceWidth!==724)) invalid(); ids.add(i.fileId);
    }
  }
  return structuredClone(v) as unknown as ArtworkReadResult;
}
function writeResult(value: unknown, operation: Exclude<ArtworkWrite,'review-appearance-import'>, scopeId?: string) {
  const v=record(value), saved=Object.hasOwn(v,'savedItemId')||Object.hasOwn(v,'reviewId');
  fields(v,['scopeId','collectionRevision','stateId','selectedItemId','recoveryRequired','pendingStateId',...(saved?['savedItemId','reviewId']:[])]);
  if(!hash(v.scopeId)||scopeId!==undefined&&v.scopeId!==scopeId) throw new PublicArtworkError('remote-connection-changed');
  if(!count(v.collectionRevision)||!nullable(v.stateId)||!nullable(v.selectedItemId)||typeof v.recoveryRequired!=='boolean'||!nullable(v.pendingStateId)||v.recoveryRequired!==(v.pendingStateId!==null)
    ||(v.stateId===null ? v.collectionRevision!==0||v.selectedItemId!==null : !v.collectionRevision||!hash(v.selectedItemId))
    ||(operation==='save-appearance-import' ? !saved||!hash(v.savedItemId)||!hash(v.reviewId) : saved)) invalid();
  return structuredClone(v) as unknown as ArtworkReceipt;
}
export function readArtworkReceipt(value: unknown, requestId: string, scopeId?: string, collectionId?: string): PublicArtworkReceipt {
  const v=record(value); if(!uuid(requestId)||v.requestId!==requestId) invalid();
  if(v.state==='not-found') { fields(v,['requestId','operation','state']); if(v.operation!==null) invalid(); return {requestId,operation:null,state:'not-found'}; }
  if(!isArtworkWrite(v.operation)) invalid(); const operation=v.operation;
  if(v.state==='running'||v.state==='unconfirmed') { fields(v,['requestId','operation','state']); return {requestId,operation,state:v.state}; }
  fields(v,['requestId','operation','state','result']); if(v.state!=='completed') invalid(); const r=record(v.result);
  if(r.ok===false) { fields(r,['ok','error']); const e=record(r.error); fields(e,['kind']); if(typeof e.kind!=='string'||!/^[-a-z]{1,64}$/.test(e.kind)) invalid(); return {requestId,operation,state:'completed',result:{ok:false,error:{kind:e.kind}}}; }
  fields(r,['ok','data']); if(r.ok!==true) invalid();
  return operation==='review-appearance-import'
    ? {requestId,operation,state:'completed',result:{ok:true,data:readArtworkData(operation,r.data,scopeId,collectionId) as ArtworkReview}}
    : {requestId,operation,state:'completed',result:{ok:true,data:writeResult(r.data,operation,scopeId)}};
}
export function readOperationReceipt(value: unknown, requestId: string, scopeId?: string, collectionId?: string): PublicOperationReceipt {
  const v=record(value);
  if(isArtworkWrite(v.operation)) return readArtworkReceipt(v,requestId,scopeId,collectionId);
  const historicScope=scopeId ?? (v.state==='completed' && record(v.result).ok===true ? record(record(v.result).data).scopeId : '0'.repeat(64));
  if(!hash(historicScope)) invalid();
  return readPublicReceipt(v,requestId,historicScope);
}

// Returns a copied, bounded JSON shape. No paths, URLs, arbitrary commands or
// model-side file reads are accepted. Byte decoding remains the core's job.
export function artworkInput(action: ArtworkAction | 'artwork-image', input: unknown): Record<string,unknown> {
  try {
    const v=connectionRecord(input);
    const keys: Record<string,string[]>={ artwork:['after'],'artwork-item':['itemId'],'artwork-image':['referenceId','assetId'],
      'read-appearance-import':['reviewId'],'review-appearance-import':['importId','expectedStateId','manifest','files'],
      'save-appearance-import':['reviewId','expectedStateId'],'select-appearance':['itemId','expectedStateId'],
      'name-appearance':['itemId','expectedStateId','name'],'recover-appearance':[] };
    if(!Object.hasOwn(keys,action)) reject(); connectionFields(v,keys[action]);
    for(const key of ['itemId','referenceId','assetId','reviewId']) if(Object.hasOwn(v,key)&&!hash(v[key])) reject();
    if(action==='artwork'&&!nullable(v.after)) reject();
    if(Object.hasOwn(v,'expectedStateId')&&!(hash(v.expectedStateId)||v.expectedStateId===null&&['review-appearance-import','save-appearance-import'].includes(action))) reject();
    if(action==='name-appearance'&&!label(v.name)) reject();
    if(action==='review-appearance-import') {
      if(!uuid(v.importId)) reject(); const m=connectionRecord(v.manifest); connectionFields(m,['templateId','baseItemId','name','author','parts']);
      if(m.templateId!==stock.manifest.templateId||!nullable(m.baseItemId)||!label(m.name,false)||!label(m.author)||!Array.isArray(m.parts)||!m.parts.length||m.parts.length>13||!Array.isArray(v.files)||!v.files.length||v.files.length>64) reject();
      const selected=new Set(), used=new Set(), seen=new Set(); let total=0;
      for(const part of m.parts) { const p=connectionRecord(part); connectionFields(p,['partId','fileId']); if(!parts.includes(String(p.partId))||selected.has(p.partId)||!fileId(p.fileId)) reject(); selected.add(p.partId); used.add(p.fileId); }
      for(const file of v.files) { const f=connectionRecord(file); connectionFields(f,['fileId','base64']);
        if(!fileId(f.fileId)||seen.has(f.fileId)||!used.has(f.fileId)||typeof f.base64!=='string'||!f.base64.length||f.base64.length>Math.ceil(8*1024*1024/3)*4||f.base64.length%4||/[^A-Za-z0-9+/=]/.test(f.base64)) reject();
        const bytes=atob(f.base64); total+=bytes.length; if(!bytes.length||bytes.length>8*1024*1024||total>64*1024*1024||btoa(bytes)!==f.base64) reject(); seen.add(f.fileId);
      }
      if(seen.size!==used.size) reject();
    }
    return structuredClone(v);
  } catch(error) { if(error instanceof PublicArtworkError) throw error; return reject(); }
}
const encode=new TextEncoder();
async function sha(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),b=>b.toString(16).padStart(2,'0')).join(''); }
function canonical(v: unknown): string { if(v===null||typeof v!=='object') return JSON.stringify(v); if(Array.isArray(v)) return '['+v.map(canonical).join(',')+']'; return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')+'}'; }
export async function artworkFingerprint(operation: ArtworkWrite, input: Record<string,unknown>, connectionId: string): Promise<string> {
  const {files,...small}=input;
  const compact: Array<{ fileId: string; bytes: number; sha256: string }> | undefined = Array.isArray(files) ? [] : undefined;
  if (Array.isArray(files)) for (const value of files) {
    const f=value as {fileId:string;base64:string}, raw=atob(f.base64), bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    compact!.push({fileId:f.fileId,bytes:bytes.length,sha256:await sha(bytes)});
  }
  return sha(encode.encode(canonical({connectionId,operation,input:{...small,...(compact?{files:compact}:{})}})));
}
export function artworkExpectation(operation: ArtworkWrite, input: Record<string,unknown>) {
  const {files,...small}=input;
  return structuredClone({...small,...(Array.isArray(files)?{files:files.map(f=>({fileId:(f as {fileId:string}).fileId}))}:{})});
}
export function checkArtworkResult(receipt: PublicArtworkReceipt, operation: ArtworkWrite, input: Record<string,unknown>) {
  if(receipt.state==='not-found') return;
  if(receipt.operation!==operation) invalid();
  if(receipt.state!=='completed'||!receipt.result.ok) return;
  if(receipt.operation==='review-appearance-import') {
    const d=receipt.result.data, m=input.manifest as {templateId:string;baseItemId:string|null;name:string;author:string;parts:{partId:string;fileId:string}[]};
    const same=(a:string[],b:string[])=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
    if(d.expectedStateId!==input.expectedStateId||d.baseItemId!==m.baseItemId||d.manifest.templateId!==m.templateId||d.name!==m.name.trim()||d.author!==m.author.trim()
      ||!same(d.replacedParts,m.parts.map(p=>p.partId))||!same(d.images.map(f=>f.fileId),(input.files as {fileId:string}[]).map(f=>f.fileId))) invalid();
  } else if(receipt.operation==='save-appearance-import' && receipt.result.data.reviewId!==input.reviewId
    ||receipt.operation==='select-appearance' && receipt.result.data.selectedItemId!==input.itemId) invalid();
}

export function artworkResultText(receipt: PublicArtworkReceipt | null): string {
  if (!receipt || receipt.state==='unconfirmed') return '作品操作の結果は未確認です。同じ操作IDで確認してください。';
  if (receipt.state==='running') return '作品を処理中です。完了はまだ確認できていません。';
  if (receipt.state==='not-found') return '作品操作の記録が見つかりません。未実行とは断定せず、ローカルで確認してください。';
  if (!receipt.result.ok) return '作品操作を完了できなかった記録があります。現在のコレクションと作品保存の復旧を確認してください。';
  return ({ 'review-appearance-import':'画像レビューを作成した記録があります。作品の保存はまだです。',
    'save-appearance-import':'作品を保存した記録があります。現在の選択とは別の記録です。',
    'select-appearance':'作品を選択した記録があります。装備の設定は変更していません。',
    'name-appearance':'作品名を保存した記録があります。装備の設定は変更していません。',
    'recover-appearance':'作品保存の復旧を処理した記録があります。現在のコレクションを確認してください。' })[receipt.operation];
}
