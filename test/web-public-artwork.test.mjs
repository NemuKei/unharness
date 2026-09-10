import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PNG } from 'pngjs';
import { publicBrowser, publicBrowserCase } from '../test-support/public-browser.mjs';
import { readSourceProfileFiles } from '../src/sources/owned-profile.mjs';
import { readUserArtwork, renameUserAppearance, discoverUserAppearance } from '../src/sources/service.mjs';

// The HTTPS origin and WebMCP registry are the existing routed test doubles.
// Rendering, shared ArtworkPort/AppearancePanel, local HTTP/core are real.
// These tests never publish a site, post externally, or use personal settings.
async function connect(s) {
  await s.page.goto(await s.approveLink());
  await s.page.getByRole('button',{name:'このMacに接続',exact:true}).click();
  await s.page.locator('.prepared-mode').filter({hasText:/^Normal$/}).waitFor();
}
async function review(s,name,shade=230) {
  const page=s.page;
  await page.getByRole('button',{name:'作品を読み込む',exact:true}).click();
  await page.getByLabel('作品名',{exact:true}).fill(name);
  await page.getByLabel('本体のPNG',{exact:true}).setInputFiles({name:'synthetic-entity.png',mimeType:'image/png',
    buffer:PNG.sync.write({width:724,height:724,data:Buffer.alloc(724*724*4,shade)})});
  await page.getByRole('button',{name:'画像を確認',exact:true}).click();
  for(const mode of ['Normal','UNSEAL','TRUEFORM']) {
    const image=page.getByAltText(mode+'の合成プレビュー',{exact:true});await image.waitFor();
    await image.evaluate(img=>img.decode());assert.equal(await image.evaluate(img=>img.naturalWidth),724);
  }
}
async function save(s,name,shade) {
  await review(s,name,shade);await s.page.getByRole('button',{name:'この作品を保存',exact:true}).click();
  await s.page.locator('.artwork-panel-heading strong').filter({hasText:name}).waitFor();
}

test('public shared panels review three poses, save versions and reselect an old work without preparing source modes',publicBrowserCase,async t=>{
  const s=await publicBrowser(t),before=await readFile(join(s.workspace,'state.json'));await connect(s);
  await save(s,'Public version A',230);await save(s,'Public version B',150);
  await s.page.getByRole('button',{name:'コレクション',exact:true}).click();
  const first=s.page.locator('.art-collection-grid article').filter({has:s.page.getByRole('heading',{name:'Public version A',exact:true})});
  await first.getByRole('button',{name:'この作品を選ぶ',exact:true}).click();
  await s.page.locator('.artwork-panel-heading strong').filter({hasText:'Public version A'}).waitFor();
  const tools=await s.callPageTool('unharness_artwork',{after:null});assert.equal(tools.ok,true);assert.equal(tools.result.itemCount,3);
  assert.equal(tools.result.selectedItem.name,'Public version A');
  assert.equal(s.posts.filter(p=>['/remote/v2/plan','/remote/v2/apply'].includes(p.path)).length,0);
  assert.deepEqual(await readFile(join(s.workspace,'state.json')),before);assert.deepEqual(await readSourceProfileFiles(s.context),s.originalFiles);
  await s.page.locator('.artwork-panel').scrollIntoViewIfNeeded();
  await s.screenshot('public-artwork-desktop.png');
  await s.page.setViewportSize({width:390,height:844});
  assert.equal(await s.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await s.screenshot('public-artwork-mobile.png');
  await s.assertNoSecrets();assert.deepEqual(s.errors,[],JSON.stringify(s.httpErrors));
});

test('lost public artwork save is confirmed by its same ID and remains historical after expiry',publicBrowserCase,async t=>{
  const s=await publicBrowser(t);await connect(s);await review(s,'Durable public artwork');let sends=0;
  await s.page.route(s.gui.url+'/remote/v2/save-appearance-import',async route=>{sends++;await route.fetch();await route.abort();});
  await s.page.getByRole('button',{name:'この作品を保存',exact:true}).click();
  await s.page.getByRole('heading',{name:'接続状態は未確認',exact:true}).waitFor();
  const id=await s.page.getByLabel('作品の操作ID',{exact:true}).inputValue();
  await s.page.getByRole('button',{name:'作品操作の保存された結果を確認',exact:true}).click();
  await s.page.getByText('作品を保存した記録があります。現在の選択とは別の記録です。',{exact:true}).waitFor();
  await s.page.getByRole('button',{name:'状態を再取得',exact:true}).click();
  await s.page.locator('.artwork-panel-heading strong').filter({hasText:'Durable public artwork'}).waitFor();
  assert.equal(sends,1);
  s.advance(600000);await s.callPageTool('unharness_status',{});
  await s.page.getByRole('heading',{name:'接続期限切れ',exact:true}).waitFor();
  assert.equal(await s.page.getByLabel('作品の操作ID',{exact:true}).inputValue(),id);
  await s.page.getByText('作品を保存した記録があります。現在の選択とは別の記録です。',{exact:true}).waitFor();
  assert.equal((await readUserArtwork({workspace:s.workspace})).itemCount,2);assert.equal(sends,1);await s.assertNoSecrets();
});

test('private-core artwork update is re-read; card composition and page tools do not prepare modes or expose upload paths',publicBrowserCase,async t=>{
  const s=await publicBrowser(t),before=await readFile(join(s.workspace,'state.json'));await connect(s);await save(s,'Before local update',210);
  const current=await readUserArtwork({workspace:s.workspace});
  await renameUserAppearance({workspace:s.workspace,itemId:current.selectedItem.id,expectedStateId:current.stateId,name:'After local update'});
  await s.page.locator('.artwork-panel-heading strong').filter({hasText:'After local update'}).waitFor();
  const denied=await s.callPageTool('unharness_artwork_item',{itemId:current.selectedItem.id,path:'/PRIVATE_TEST'});assert.equal(denied.ok,false);
  const names=await s.page.evaluate(()=>[...window.__unharnessTestTools.keys()]);
  assert.ok(!names.includes('unharness_review_appearance_import'));assert.ok(!names.includes('unharness_prepare_appearance_authoring'));
  const view=(await s.callPageTool('unharness_artwork',{after:null})).result;
  const renamed=await s.callPageTool('unharness_name_appearance',{requestId:randomUUID(),itemId:view.selectedItem.id,expectedStateId:view.stateId,name:''});
  assert.equal(renamed.result.result.ok,true);
  await s.page.locator('.artwork-panel-heading strong').filter({hasText:/^オリジナル$/}).waitFor();
  await s.page.getByRole('button',{name:'画像カード',exact:true}).click();
  const card=s.page.getByAltText('公開する外観カードのプレビュー',{exact:true});await card.waitFor();await card.evaluate(img=>img.decode());
  assert.ok((await card.getAttribute('src')).startsWith('blob:'));
  // Do not invoke clipboard, external posting, or download actions here.
  assert.equal(s.posts.filter(p=>['/remote/v2/plan','/remote/v2/apply'].includes(p.path)).length,0);
  assert.deepEqual(await readFile(join(s.workspace,'state.json')),before);assert.deepEqual(await readSourceProfileFiles(s.context),s.originalFiles);
  await s.assertNoSecrets();
});

test('unchanged public polling preserves expanded collection pages and still observes a private update',publicBrowserCase,async t=>{
  const s=await publicBrowser(t), before=await readFile(join(s.workspace,'state.json'));
  let current=await discoverUserAppearance({workspace:s.workspace});
  for(let index=1;index<21;index++) current=await discoverUserAppearance({workspace:s.workspace,expectedStateId:current.stateId});
  await connect(s);
  await s.page.getByRole('button',{name:'コレクション',exact:true}).click();
  await s.page.waitForFunction(()=>document.querySelectorAll('.art-collection-grid article').length===20);
  await s.page.getByRole('button',{name:'続きを表示',exact:true}).click();
  await s.page.waitForFunction(()=>document.querySelectorAll('.art-collection-grid article').length===21);
  const unchanged=(await readUserArtwork({workspace:s.workspace})).stateId;
  for(let index=0;index<2;index++) {
    await s.page.waitForResponse(response=>response.url()===s.gui.url+'/remote/v2/artwork'
      && response.request().method()==='POST' && response.request().postDataJSON().after===null);
    await s.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await s.page.locator('.art-collection-grid article').count(),21);
    assert.equal((await readUserArtwork({workspace:s.workspace})).stateId,unchanged);
  }
  const selected=await readUserArtwork({workspace:s.workspace});
  await renameUserAppearance({workspace:s.workspace,itemId:selected.selectedItem.id,expectedStateId:selected.stateId,name:'Updated outside this page'});
  await s.page.locator('.artwork-panel-heading strong').filter({hasText:'Updated outside this page'}).waitFor();
  assert.deepEqual(await readFile(join(s.workspace,'state.json')),before);
  assert.equal(s.posts.filter(p=>['/remote/v2/plan','/remote/v2/apply'].includes(p.path)).length,0);
  await s.assertNoSecrets();assert.deepEqual(s.errors,[],JSON.stringify(s.httpErrors));
});

test('public artwork polling reports collection read failures and recovers without clearing sound mode state',publicBrowserCase,async t=>{
  const s=await publicBrowser(t), before=await readFile(join(s.workspace,'state.json'));await connect(s);
  await s.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='作品を読み込む'&&!button.disabled));
  await s.page.route(s.gui.url+'/remote/v2/artwork',route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{kind:'appearance-record-invalid'}})}));
  await s.page.locator('.art-error').waitFor();
  assert.match(await s.page.locator('.public-connection-status').innerText(),/接続中/);
  assert.equal(await s.page.locator('.prepared-mode').innerText(),'Normal');
  assert.equal(await s.page.getByRole('button',{name:'変更計画を確認',exact:true}).isEnabled(),true);
  await s.page.unroute(s.gui.url+'/remote/v2/artwork');
  await s.page.locator('.art-error').waitFor({state:'hidden'});
  assert.deepEqual(await readFile(join(s.workspace,'state.json')),before);
  assert.equal(s.posts.filter(p=>['/remote/v2/plan','/remote/v2/apply'].includes(p.path)).length,0);
  assert.ok(s.httpErrors.length>0);
  assert.ok(s.httpErrors.every(error=>error.path==='/remote/v2/artwork'&&error.status===400&&error.kind==='appearance-record-invalid'),JSON.stringify(s.httpErrors));
  assert.ok(s.errors.every(error=>error.includes('400')),JSON.stringify(s.errors));
  await s.assertNoSecrets();
});
