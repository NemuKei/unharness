import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {PNG} from 'pngjs';
import {aiProfile} from '../test-support/ai-profile.mjs';
import {entityMotionSheet} from '../test-support/entity-pose-sheet.mjs';
import * as normalizer from '../src/appearances/entity-poses.mjs';
import * as profile from '../src/appearances/entity-profile.mjs';
import {getAppearanceTemplate,validateLayeredAppearance} from '../src/appearances/template.mjs';
import {reviewAppearanceImport,saveAppearanceImport} from '../src/appearances/import.mjs';
import {readUserAppearance,selectUserAppearance} from '../src/appearances/service.mjs';
import {validLayerManifest} from '../web/src/appearance-layers.ts';
import {matchesArtworkUpload} from '../web/src/artwork-review.ts';
import {projectArtworkReview} from '../src/gui/remote-artwork.mjs';
import {remoteRequestShape} from '../src/gui/remote-policy.mjs';

const input=(workspace,bytes=entityMotionSheet())=>({workspace,expectedStateId:null,requestId:randomUUID(),
  manifest:{templateId:getAppearanceTemplate().id,baseItemId:null,name:'Motion',author:'',parts:[{partId:'entity-motion',fileId:'sheet'}]},
  files:[{fileId:'sheet',bytes}]});

test('the fixed twelve-frame guide normalizes each cell in reading order at one common scale',()=>{
  assert.equal(typeof normalizer.normalizeEntityMotionSheet,'function');
  const result=normalizer.normalizeEntityMotionSheet(entityMotionSheet());
  assert.equal(result.poses.length,12);
  assert.deepEqual(result.poses.map(p=>p.frameId),['normal','unseal',...Array.from({length:9},(_,i)=>'unfold-'+i),'trueform']);
  const widths=[];
  for(const row of result.poses) {
    const png=PNG.sync.read(row.bytes);let left=724,right=-1;
    for(let y=0;y<724;y++)for(let x=0;x<724;x++) {
      const i=(y*724+x)*4;if(!png.data[i+3])continue;
      assert.ok(profile.entityPointFits(row.mode,x,y));
      if(png.data[i]===0){left=Math.min(left,x);right=Math.max(right,x);}
    }
    widths.push(right-left+1);
  }
  assert.equal(new Set(widths).size,1);
});
test('missing, opaque and crossing-cell motion inputs fail before any store write',async t=>{
  const p=await aiProfile(t),before=await readdir(p.workspace);
  for(const bad of [{opaque:true},{missing:true},{crossing:true}])await assert.rejects(reviewAppearanceImport(input(p.workspace,entityMotionSheet(bad))));
  assert.deepEqual(await readdir(p.workspace),before);
});
test('motion import fixes every frame reference and preserves review correspondence, retries and old versions',async t=>{
  const p=await aiProfile(t),args=input(p.workspace),review=await reviewAppearanceImport(args);
  assert.equal(review.manifest.layers.entity.profileId,'entity-awakening/v2');
  assert.equal(review.manifest.layers.entity.unfold.length,9);
  assert.equal(profile.entityAssetIds(review.manifest).length,12);
  assert.equal(validLayerManifest(review.manifest),true);
  assert.equal(matchesArtworkUpload(review,args),true);
  const publicReview=projectArtworkReview(review,{scopeId:review.scopeId,collectionScopeId:review.collectionScopeId});
  assert.deepEqual(publicReview,review);
  assert.equal(matchesArtworkUpload(publicReview,args),true);
  assert.doesNotThrow(()=>remoteRequestShape('review-appearance-import',{requestId:randomUUID(),importId:args.requestId,
    expectedStateId:null,manifest:args.manifest,files:args.files.map(file=>({fileId:file.fileId,base64:file.bytes.toString('base64')}))}));
  assert.deepEqual(await reviewAppearanceImport(args),review);
  for(const edit of [m=>m.layers.entity.unfold.pop(),m=>m.layers.entity.unfold.push(m.layers.entity.unfold[0]),
    m=>m.layers.entity.profileId='entity-awakening/v3',m=>m.layers.entity.unfold[0].script='run()']) {
    const malformed=structuredClone(review.manifest);edit(malformed);
    assert.equal(validLayerManifest(malformed),false);assert.throws(()=>validateLayeredAppearance(malformed));
  }
  const mismatched=structuredClone(review);mismatched.images[0].assetId=mismatched.images[1].assetId;
  assert.equal(matchesArtworkUpload(mismatched,args),false);
  const saved=await saveAppearanceImport({workspace:p.workspace,reviewId:review.reviewId,expectedStateId:null});
  const nextArgs=input(p.workspace);nextArgs.expectedStateId=saved.stateId;nextArgs.manifest.baseItemId=saved.savedItemId;nextArgs.manifest.name='Revision';
  const next=await reviewAppearanceImport(nextArgs),second=await saveAppearanceImport({workspace:p.workspace,reviewId:next.reviewId,expectedStateId:saved.stateId});
  await selectUserAppearance({workspace:p.workspace,expectedStateId:second.stateId,itemId:saved.savedItemId});
  assert.equal((await readUserAppearance({workspace:p.workspace})).state.selectedItemId,saved.savedItemId);
});
test('forward and reverse motion visit all intermediate frames without changing the legacy profile',()=>{
  assert.equal(typeof profile.entityFrameAtRelease,'function');
  const forward=Array.from({length:101},(_,i)=>profile.entityFrameAtRelease('entity-awakening/v2',1+i/100));
  const reverse=Array.from({length:101},(_,i)=>profile.entityFrameAtRelease('entity-awakening/v2',2-i/100));
  assert.equal(new Set(forward).size,11);assert.deepEqual(reverse,forward.toReversed());
  assert.equal(profile.entityFrameAtRelease('entity-awakening/v1',1.64),'unseal');
  assert.equal(profile.entityFrameAtRelease('entity-awakening/v1',1.65),'trueform');
});
test('the retained three-pose normalizer still reproduces both immutable v1 examples byte for byte',async()=>{
  for(const id of ['silver','amber']) {
    const root=new URL('../assets/appearance-examples/'+id+'-v1/',import.meta.url);
    const result=normalizer.normalizeEntityPoseSheet(await readFile(new URL('entity-poses.png',root)));
    for(const row of result.poses)assert.deepEqual(row.bytes,await readFile(new URL('entity-'+row.mode+'.png',root)));
  }
});
