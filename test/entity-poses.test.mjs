import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { aiProfile } from '../test-support/ai-profile.mjs';
import { getAppearanceTemplate } from '../src/appearances/template.mjs';
import { reviewAppearanceImport, saveAppearanceImport } from '../src/appearances/import.mjs';
import { readUserAppearance, selectUserAppearance } from '../src/appearances/service.mjs';
import {validLayerManifest} from '../web/src/appearance-layers.ts';

const module = await import('../src/appearances/entity-poses.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
const profile = await import('../src/appearances/entity-profile.mjs').catch(e => { if (e.code === 'ERR_MODULE_NOT_FOUND') return {}; throw e; });
import {entityPoseSheet as sheet} from '../test-support/entity-pose-sheet.mjs';

const args = (workspace, bytes=sheet(), expectedStateId=null, baseItemId=null) => ({ workspace, expectedStateId, requestId: randomUUID(),
  manifest: { templateId:getAppearanceTemplate().id, baseItemId,name:'Awakening',author:'',parts:[{partId:'entity-poses',fileId:'poses'}] },
  files:[{fileId:'poses',bytes}] });
test('three poses retain one scale, fit their mechanical envelopes and keep physical head width', () => {
  assert.equal(typeof module.normalizeEntityPoseSheet, 'function');
  const result=module.normalizeEntityPoseSheet(sheet());
  assert.equal(result.poses.length,3);
  const widths=[];
  for(const pose of result.poses) {
    const p=PNG.sync.read(pose.bytes);
    assert.equal(p.width,724); assert.equal(p.height,724);
    let min=724,max=-1;
    for(let y=0;y<724;y++)for(let x=0;x<724;x++)if(p.data[(y*724+x)*4+3]) {
      assert.ok(profile.entityPointFits(pose.mode,x,y));
      if(p.data[(y*724+x)*4]===0) { min=Math.min(min,x);max=Math.max(max,x); }
    }
    widths.push(max-min+1);
  }
  assert.equal(new Set(widths).size,1);
  assert.deepEqual(module.normalizeEntityPoseSheet(sheet()),result);
});
test('separate silhouettes can have overlapping column bounds without leaking pixels into another pose',()=>{
  const png=PNG.sync.read(sheet());
  // The upright pose reaches left above the curled pose. Their rectangles
  // overlap, but the characters themselves remain separate.
  for(let y=80;y<96;y++)for(let x=315;x<490;x++)png.data.set([240,100,0,255],(y*600+x)*4);
  const result=module.normalizeEntityPoseSheet(PNG.sync.write(png));
  for(const pose of result.poses) {
    const p=PNG.sync.read(pose.bytes);let orange=0;
    for(let i=0;i<p.data.length;i+=4)if(p.data[i]===240 && p.data[i+1]===100 && p.data[i+3])orange++;
    assert.equal(orange>0,pose.mode==='trueform');
  }
});
test('unusable pose sheets are rejected before a review or image is stored', async t => {
  const p=await aiProfile(t), before=await readdir(p.workspace);
  for(const options of [{opaque:true},{missing:true},{touching:true}]) await assert.rejects(reviewAppearanceImport(args(p.workspace,sheet(options))));
  assert.deepEqual(await readdir(p.workspace),before);
});
test('pose import/save/retry and an older version remain independently selectable', async t => {
  const p=await aiProfile(t), input=args(p.workspace), first=await reviewAppearanceImport(input);
  assert.equal(first.manifest.schemaVersion,2);
  assert.equal(first.manifest.layers.entity.profileId,'entity-awakening/v1');
  assert.equal(Object.keys(first.manifest.layers.entity.poses).length,3);
  assert.deepEqual(await reviewAppearanceImport(input),first);
  const saved=await saveAppearanceImport({workspace:p.workspace,reviewId:first.reviewId,expectedStateId:null});
  const next=await reviewAppearanceImport({...args(p.workspace,sheet(),saved.stateId,saved.savedItemId),manifest:{...input.manifest,baseItemId:saved.savedItemId,name:'Revision'}});
  const second=await saveAppearanceImport({workspace:p.workspace,reviewId:next.reviewId,expectedStateId:saved.stateId});
  await selectUserAppearance({workspace:p.workspace,expectedStateId:second.stateId,itemId:saved.savedItemId});
  assert.equal((await readUserAppearance({workspace:p.workspace})).state.selectedItemId,saved.savedItemId);
  assert.deepEqual((await saveAppearanceImport({workspace:p.workspace,reviewId:next.reviewId,expectedStateId:saved.stateId})).savedItemId,second.savedItemId);
});
test('a pose manifest rejects executable fields, missing modes and an unknown presentation profile',async t=>{
  const p=await aiProfile(t),review=await reviewAppearanceImport(args(p.workspace));
  assert.equal(validLayerManifest(review.manifest),true);
  for(const edit of [m=>{m.layers.entity.profileId='custom-code';},m=>{delete m.layers.entity.poses.normal;},
    m=>{m.layers.entity.poses.normal.url='https://example.invalid/';},m=>{m.layers.entity.motion='run()';},m=>{m.schemaVersion=1;}]) {
    const candidate=structuredClone(review.manifest);edit(candidate);assert.equal(validLayerManifest(candidate),false);
  }
});
