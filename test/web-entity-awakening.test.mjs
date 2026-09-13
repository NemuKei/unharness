import test from 'node:test';
import assert from 'node:assert/strict';
import {layerBrowser,layerBrowserCase} from '../test-support/layer-browser.mjs';
import {entityPoseSheet} from '../test-support/entity-pose-sheet.mjs';
import {normalizeEntityPoseSheet} from '../src/appearances/entity-poses.mjs';
import {readStockAppearance} from '../src/appearances/stock.mjs';
import {entityAssetIds,ENTITY_PROFILE_ID} from '../src/appearances/entity-profile.mjs';

async function payload() {
  const result=normalizeEntityPoseSheet(entityPoseSheet()),{manifest}=await readStockAppearance();
  manifest.schemaVersion=2;manifest.layers.entity={profileId:ENTITY_PROFILE_ID,poses:{}};
  for(const p of result.poses){manifest.layers.entity.poses[p.mode]={assetId:p.asset.assetId};manifest.assets.push(p.asset);}
  const used=new Set([...entityAssetIds(manifest),manifest.layers.background.assetId,...manifest.layers.restraints.map(p=>p.assetId)]);
  manifest.assets=manifest.assets.filter(a=>used.has(a.assetId));
  return {manifest,images:result.poses.map(p=>({assetId:p.asset.assetId,base64:p.bytes.toString('base64')}))};
}
test('real renderer preserves three poses, returns to static pixels and releases every pose after switching back',layerBrowserCase,async t=>{
  const {page,errors}=await layerBrowser(t);
  const result=await page.evaluate(async input=>{
    const f=window.layerFixture,blobs=new Map(input.images.map(i=>[i.assetId,new Blob([Uint8Array.from(atob(i.base64),c=>c.charCodeAt(0))],{type:'image/png'})]));
    f.scene.setCondition('fixed-only',true);const stock=await f.scene.snapshot();
    await f.scene.setLayers(input.manifest,async asset=>blobs.get(asset.assetId));
    const snapshots=[];
    for(const mode of ['baseline','manual-only','fixed-only']){f.scene.setCondition(mode,true);snapshots.push(await f.scene.snapshot());}
    f.scene.setEffects(true);
    await new Promise(resolve=>setTimeout(resolve,180));const moving=await f.scene.snapshot();
    f.scene.setEffects(false);const settled=await f.scene.snapshot();
    await f.scene.setLayers(null);const restored=await f.scene.snapshot();
    return {distinct:new Set(snapshots).size,changed:!await f.same(moving,settled),staticSame:await f.same(settled,snapshots[2]),
      stockSame:await f.same(restored,stock),counts:f.counts()};
  },await payload());
  assert.equal(result.distinct,3);assert.equal(result.changed,true);assert.equal(result.staticSame,true);assert.equal(result.stockSame,true);
  assert.equal(result.counts.length,3);for(const count of result.counts)assert.deepEqual(count,{bitmap:1,texture:1,source:1});
  assert.deepEqual(errors,[]);
});
test('reversal and retargeting keep the actual mechanical cels and recover the same endpoint',layerBrowserCase,async t=>{
  const {page,errors}=await layerBrowser(t);
  await page.evaluate(async input=>{
    const f=window.layerFixture,blobs=new Map(input.images.map(i=>[i.assetId,new Blob([Uint8Array.from(atob(i.base64),c=>c.charCodeAt(0))]) ]));
    await f.scene.setLayers(input.manifest,async a=>blobs.get(a.assetId));f.scene.setCondition('baseline',true);f.scene.setEffects(true);f.scene.setCondition('fixed-only');
  },await payload());
  await page.waitForFunction(()=>Number(window.layerFixture.host.dataset.release)>0.9);
  await page.evaluate(()=>window.layerFixture.scene.setCondition('baseline'));
  await page.waitForFunction(()=>window.layerFixture.host.dataset.cel==='0');
  await page.evaluate(()=>window.layerFixture.scene.setCondition('manual-only'));
  await page.waitForFunction(()=>window.layerFixture.host.dataset.cel==='24');
  const result=await page.evaluate(async()=>{
    const f=window.layerFixture;f.scene.setEffects(false);const settled=await f.scene.snapshot();
    f.scene.setCondition('manual-only',true);return {same:await f.same(settled,await f.scene.snapshot()),playback:f.host.dataset.playback};
  });
  assert.equal(result.same,true);assert.equal(result.playback,'stopped');assert.deepEqual(errors,[]);
});
