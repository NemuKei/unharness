import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {layerBrowser,layerBrowserCase} from '../test-support/layer-browser.mjs';
import {entityFrameAssets,ENTITY_MOTION_FRAMES} from '../src/appearances/entity-profile.mjs';

async function payload(id) {
  const root=new URL('../assets/appearance-examples/'+id+'-v2/',import.meta.url);
  const {manifest}=JSON.parse(await readFile(new URL('artwork.json',root),'utf8'));
  const images=await Promise.all(entityFrameAssets(manifest).map(async row=>({assetId:row.assetId,
    base64:(await readFile(new URL('entity-'+row.frameId+'.png',root))).toString('base64')})));
  return {manifest,images};
}
for(const id of ['silver','amber'])test('real '+id+' motion visits every drawn intermediate frame in both directions and frees all twelve images',layerBrowserCase,async t=>{
  const {page,errors}=await layerBrowser(t);
  const result=await page.evaluate(async input=>{
    const f=window.layerFixture,blobs=new Map(input.images.map(i=>[i.assetId,new Blob([Uint8Array.from(atob(i.base64),c=>c.charCodeAt(0))],{type:'image/png'})]));
    f.scene.setCondition('fixed-only',true);const stock=await f.scene.snapshot();
    await f.scene.setLayers(input.manifest,async a=>blobs.get(a.assetId));
    f.scene.setCondition('manual-only',true);const unseal=await f.scene.snapshot();
    const run=async condition=>{
      const frames=[f.host.dataset.entityFrame],cels=[];f.scene.setCondition(condition);
      for(let attempt=0;attempt<600;attempt++) {
        await new Promise(resolve=>requestAnimationFrame(resolve));
        const next=f.host.dataset.entityFrame;if(frames.at(-1)!==next)frames.push(next);
        cels.push(Number(f.host.dataset.cel));if(f.host.dataset.motion==='idle')return {frames,cels};
      }
      throw Error('animation did not settle');
    };
    f.scene.setEffects(true);const forward=await run('fixed-only');
    const glowing=await f.scene.snapshot();f.scene.setEffects(false);const awake=await f.scene.snapshot();
    f.scene.setEffects(true);const reverse=await run('manual-only');f.scene.setEffects(false);
    const restoredUnseal=await f.scene.snapshot();f.scene.setCondition('fixed-only',true);
    const sameAwake=await f.same(awake,await f.scene.snapshot());
    await f.scene.setLayers(null);const restoredStock=await f.scene.snapshot();
    return {forward,reverse,staticSame:await f.same(unseal,restoredUnseal),sameAwake,
      lightsChanged:!await f.same(glowing,awake),stockSame:await f.same(stock,restoredStock),counts:f.counts()};
  },await payload(id));
  assert.deepEqual(result.forward.frames,ENTITY_MOTION_FRAMES.slice(1));
  assert.deepEqual(result.reverse.frames,ENTITY_MOTION_FRAMES.slice(1).toReversed());
  assert.equal(result.forward.cels.at(-1),48);assert.equal(result.reverse.cels.at(-1),24);
  assert.ok(new Set(result.forward.cels).size>10);assert.equal(result.staticSame,true);
  assert.equal(result.sameAwake,true);assert.equal(result.lightsChanged,true);assert.equal(result.stockSame,true);
  assert.equal(result.counts.length,12);for(const count of result.counts)assert.deepEqual(count,{bitmap:1,texture:1,source:1});
  assert.deepEqual(errors,[]);
});
