// Real public client + shared ArtworkPort + owned source profile + HTTP/core.
// Requires the complete checkout and locked dependencies; never a user profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import stock from '../assets/appearance-templates/hangar-layered-v1/stock.json' with { type: 'json' };
import { aiProfile } from '../test-support/ai-profile.mjs';
import { startGuiServer } from '../src/gui/server.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { setSourceTransactionTestHook } from '../src/sources/transaction.mjs';
import { PublicConnection, consumeConnectionHandoff } from '../web/src/connection.ts';
import { PUBLIC_WEB_ORIGIN } from '../web/src/connection-contract.ts';
import { createPublicArtworkPort } from '../web/src/connection-artwork-port.ts';

const options={timeout:60000};
async function fixture(t) {
  const cleanups=[],p=await aiProfile({after:fn=>cleanups.push(fn)}), assetsDirectory=join(p.parent,'public-artwork-test');
  await mkdir(assetsDirectory);await writeFile(join(assetsDirectory,'index.html'),'<!doctype html>');
  let time=Date.now(),intercept=null;const calls=[];
  const gui=await startGuiServer({manageSources:p.context,assetsDirectory},{remoteNow:()=>time});
  t.after(async()=>{await gui.close();for(const fn of cleanups)await fn();});
  const headers={Origin:gui.url,'X-Unharness-Client':'1','Content-Type':'application/json'};
  headers['X-Unharness-Token']=(await(await fetch(gui.url+'/api/bootstrap',{headers})).json()).token;
  const issued=await gui.requestPublicPairing();
  assert.equal((await fetch(gui.url+'/api/remote/approve',{method:'POST',headers,body:JSON.stringify({requestId:randomUUID(),pairingId:issued.pairingId})})).status,200);
  const handoff=consumeConnectionHandoff(PUBLIC_WEB_ORIGIN+'/#'+new URLSearchParams({unharness:'2',port:new URL(gui.url).port,launch:issued.launchId,ticket:issued.ticket}),()=>{});
  const client=new PublicConnection({pageOrigin:PUBLIC_WEB_ORIGIN,handoff,now:()=>time,fetcher:async(url,init)=>{
    calls.push({path:new URL(url).pathname,requestId:JSON.parse(init.body).requestId});
    const response=await fetch(url,{...init,headers:{...init.headers,Origin:PUBLIC_WEB_ORIGIN}});
    return intercept?intercept(url,init,response):response;
  }});
  await client.connect();
  return {...p,gui,client,calls,port:()=>createPublicArtworkPort(client),advance:ms=>{time+=ms;},intercept:fn=>{intercept=fn;}};
}
function upload(expectedStateId=null,baseItemId=null,name='Synthetic A',color=220) {
  const bytes=PNG.sync.write({width:724,height:724,data:Buffer.alloc(724*724*4,color)});
  return {importId:randomUUID(),expectedStateId,manifest:{templateId:stock.manifest.templateId,baseItemId,name,author:'',parts:[{partId:'entity',fileId:'entity'}]},files:[{fileId:'entity',base64:bytes.toString('base64')}]};
}
async function save(s,input) {
  const p=s.port(),review=await p.execute('review-appearance-import',input,randomUUID());
  const result=await p.execute('save-appearance-import',{reviewId:review.reviewId,expectedStateId:input.expectedStateId},randomUUID());
  return {review,result};
}

test('public ArtworkPort reviews/saves/reselects and resets a name without changing source configuration',options,async t=>{
  const s=await fixture(t), before=await readFile(join(s.workspace,'state.json'));
  const a=await save(s,upload()),b=await save(s,upload(a.result.stateId,a.result.savedItemId,'Synthetic B',140));
  const p=s.port(), selected=await p.execute('select-appearance',{itemId:a.result.savedItemId,expectedStateId:b.result.stateId},randomUUID());
  const named=await p.execute('name-appearance',{itemId:a.result.savedItemId,expectedStateId:selected.stateId,name:''},randomUUID());
  const view=await p.execute('artwork',{},randomUUID());
  assert.equal(view.itemCount,3);assert.equal(view.collection.filter(i=>i.kind==='layered').length,2);assert.equal(view.selectedItem.id,a.result.savedItemId);assert.equal(view.selectedItem.name,null);
  const item=await p.execute('artwork-item',{itemId:a.result.savedItemId},randomUUID());assert.equal(item.stateId,named.stateId);
  const asset=item.item.manifest.assets.find(a=>a.assetId===item.item.manifest.layers.entity.assetId);
  const image=await p.image(item.item.id,asset,new AbortController().signal);assert.equal(image.type,'image/png');assert.equal(image.size,asset.bytes);
  assert.equal(s.client.getSnapshot().state.preparedMode,'normal');assert.equal(s.calls.filter(c=>['/remote/v2/plan','/remote/v2/apply'].includes(c.path)).length,0);
  assert.deepEqual(await readFile(join(s.workspace,'state.json')),before);assert.deepEqual(await readSourceProfileFiles(s.context),s.originalFiles);
});

test('invalid image and other-scope references are refused without granting private readers',options,async t=>{
  const s=await fixture(t), other=await fixture(t), bad=upload();bad.files[0].base64=Buffer.from('PRIVATE_TEST not PNG').toString('base64');
  const denied=await s.client.artworkWrite('review-appearance-import',bad,randomUUID());
  assert.equal(denied.result.ok,false);assert.equal(s.client.getSnapshot().phase,'connected');
  const saved=await save(s,upload()),asset=saved.review.manifest.assets.find(a=>a.assetId===saved.review.manifest.layers.entity.assetId);
  await assert.rejects(other.port().image(saved.result.savedItemId,asset,new AbortController().signal));
  const count=s.calls.length;await assert.rejects(s.port().execute('artwork-item',{itemId:saved.result.savedItemId,path:'/PRIVATE_TEST'},randomUUID()));assert.equal(s.calls.length,count);
  assert.equal((await s.client.plan('normal')).result.ok,true);
  assert.ok(!JSON.stringify(s.client.getSnapshot()).includes('PRIVATE_TEST'));assert.deepEqual(await readSourceProfileFiles(s.context),s.originalFiles);
});

test('durable save lookup survives expiry before the original lost response, with one save POST',options,async t=>{
  const s=await fixture(t), review=await s.port().execute('review-appearance-import',upload(),randomUUID());
  const entered=Promise.withResolvers(),release=Promise.withResolvers();t.after(()=>release.resolve());
  s.intercept(async(url,init,response)=>{if(url.endsWith('/save-appearance-import')){entered.resolve();await release.promise;throw Error('lost after commit');}return response;});
  const id=randomUUID(),writing=s.client.artworkWrite('save-appearance-import',{reviewId:review.reviewId,expectedStateId:null},id);
  const observed=writing.then(value=>({value}),error=>({error}));await entered.promise;
  const terminal=await s.client.operationStatus(id);assert.equal(terminal.result.ok,true);
  s.advance(600000);s.client.tick();release.resolve();assert.deepEqual(await observed,{value:terminal});
  assert.equal(s.client.getSnapshot().phase,'expired');assert.deepEqual(s.client.getSnapshot().lastArtworkOperation.receipt,terminal);
  assert.equal(s.calls.filter(c=>c.path.endsWith('/save-appearance-import')).length,1);assert.deepEqual(await readSourceProfileFiles(s.context),s.originalFiles);
});

test('port retry after lost review uses operation-status and never reuploads under another ID',options,async t=>{
  const s=await fixture(t),input=upload(),id=randomUUID();
  s.intercept((url,init,response)=>{if(url.endsWith('/review-appearance-import'))throw Error('lost review');return response;});
  await assert.rejects(s.port().execute('review-appearance-import',input,id));s.intercept(null);await s.client.refresh();
  const review=await s.port().execute('review-appearance-import',input,id);assert.equal(typeof review.reviewId,'string');
  const saved=await s.port().execute('save-appearance-import',{reviewId:review.reviewId,expectedStateId:null},randomUUID());assert.equal(saved.savedItemId,review.proposedItemId);
  assert.equal(s.calls.filter(c=>c.path.endsWith('/review-appearance-import')).length,1);
});

test('saved appearance failure stays historical after explicit journal recovery',options,async t=>{
  const s=await fixture(t),review=await s.port().execute('review-appearance-import',upload(),randomUUID());
  t.after(()=>setSourceTransactionTestHook(null));setSourceTransactionTestHook(phase=>{if(phase==='appearance-journaled')throw Error('PRIVATE_TEST interrupt');});
  const id=randomUUID(),failed=await s.client.artworkWrite('save-appearance-import',{reviewId:review.reviewId,expectedStateId:null},id);assert.equal(failed.result.ok,false);
  setSourceTransactionTestHook(null);assert.equal((await s.client.artworkRead('artwork',{after:null})).recoveryRequired,true);
  const recovered=await s.port().execute('recover-appearance',{},randomUUID());assert.equal(recovered.recoveryRequired,false);assert.equal(recovered.selectedItemId,review.proposedItemId);
  assert.deepEqual(await s.client.operationStatus(id),failed);assert.ok(!JSON.stringify(failed).includes('PRIVATE_TEST'));
});
