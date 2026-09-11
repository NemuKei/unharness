import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {pluginStateProfile,pluginStateSetup} from '../test-support/plugin-state-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import {openWorkspace,loadSnapshot} from '../src/sources/records.mjs';
import {parse} from '../src/vendor/smol-toml/parse.js';
import {setSourceTransactionTestHook} from '../src/sources/transaction.mjs';
const mac = {skip:process.platform!=='darwin'};
const config = async s=>parse(await readFile(s.configPath,'utf8'));
async function prepare(s,mode) {
  const p=await sources.planUserMode({workspace:s.workspace,mode});
  const result=await sources.applyUserPlan({workspace:s.workspace,planId:p.planId});
  return {...result,plan:p};
}
for (const selector of [true,false,null]) test('v3 whole-plugin OFF/Normal is independent of ordinary Skill invocation, selector '+selector,mac,async t=>{
  const s=await pluginStateProfile(t,selector),before=await openWorkspace(s.workspace);
  const originalNormal=await loadSnapshot(s.workspace,before.reg,before.reg.normalId);
  const {review}=await pluginStateSetup(s);
  assert.equal(review.presets.trueform.pluginStates[0].enabled,false);
  assert.equal(review.presets.unseal.pluginStates[0].enabled,selector!==false);
  const z=await prepare(s,'trueform');
  assert.equal((await config(s)).plugins[s.pluginId].enabled,false);
  assert.equal(z.plan.skillStates[0].manualOnly,true);
  assert.equal(z.plan.pluginStates[0].state,'disabled');
  const u=await prepare(s,'unseal');
  assert.equal((await config(s)).plugins?.[s.pluginId]?.enabled??null,selector);
  assert.equal(u.plan.skillStates[0].manualOnly,false);
  assert.equal(u.plan.pluginStates[0].enabled,selector!==false);
  const favorite=await sources.planUserFavorite({workspace:s.workspace,favoriteId:s.favoriteId});
  assert.equal(favorite.adaptation.kind,'source-enrollment');
  assert.deepEqual(favorite.adaptation.addedSourceIds,[]);
  assert.deepEqual(favorite.adaptation.addedPluginIds,[s.pluginId]);
  await sources.applyUserPlan({workspace:s.workspace,planId:favorite.planId});
  await prepare(s,'normal');
  assert.equal(await readFile(s.configPath,'utf8'),s.originalConfig);
  const after=await openWorkspace(s.workspace);
  assert.deepEqual(await loadSnapshot(s.workspace,after.reg,after.reg.normalId),originalNormal);
});
test('an explicitly retained official plugin is inherited by both modes',mac,async t=>{
  const s=await pluginStateProfile(t); const {review}=await pluginStateSetup(s,{retained:true});
  assert.deepEqual(review.inheritance.inheritedPluginIds,[s.pluginId]);
  for(const mode of ['trueform','unseal']){
    const result=await prepare(s,mode);
    assert.equal(result.plan.pluginStates[0].state,'normal');
    assert.equal((await config(s)).plugins[s.pluginId].enabled,true);
  }
});
test('unsupported remote enablement stops new OFF work before a journal and permits retained-plugin modes',mac,async t=>{
  const s=await pluginStateProfile(t);await pluginStateSetup(s);
  const plan=await sources.planUserMode({workspace:s.workspace,mode:'trueform'});
  const before=await readFile(s.configPath),state=await readFile(join(s.workspace,'state.json'));
  const fixtureFile=join(s.context.codexHome,'.fixture-plugins.json');
  await writeFile(fixtureFile,JSON.stringify({...JSON.parse(await readFile(fixtureFile,'utf8')),ignorePluginOverrides:true}));
  const setup=await sources.readUserSetup({workspace:s.workspace,schemaVersion:3});
  assert.deepEqual(setup.pluginControls,[{pluginId:s.pluginId,available:false,reason:'setup-plugin-control-unavailable'}]);
  await assert.rejects(sources.planUserMode({workspace:s.workspace,mode:'trueform'}),{kind:'setup-plugin-control-unavailable'});
  await assert.rejects(sources.applyUserPlan({workspace:s.workspace,planId:plan.planId}),{kind:'setup-plugin-control-unavailable'});
  await assert.rejects(readFile(join(s.workspace,'pending.json')),{code:'ENOENT'});
  assert.deepEqual(await readFile(s.configPath),before);assert.deepEqual(await readFile(join(s.workspace,'state.json')),state);
  await pluginStateSetup(s,{retained:true});
  for(const mode of ['trueform','unseal','normal'])await prepare(s,mode);
  assert.deepEqual(await readFile(s.configPath),before);
});
test('saved OFF, Normal and old favorites restore offline after retained settings, package removal and native removal',mac,async t=>{
  const s=await pluginStateProfile(t); await pluginStateSetup(s); const z=await prepare(s,'trueform');
  const favorite=await sources.saveUserFavorite({workspace:s.workspace,name:'Plugin disabled'});
  const earlier=await config(s);
  await writeFile(s.configPath,(await readFile(s.configPath,'utf8')).replace('model = "gpt-5"','model = "changed-model"'));
  assert.notDeepEqual(await config(s),earlier);
  const plan=await sources.planUserRetainedSettings({workspace:s.workspace});
  await sources.acceptUserRetainedSettings({workspace:s.workspace,planId:plan.planId});
  const expectedModel=(await config(s)).model;
  await rm(s.packageRoot,{recursive:true}); await rm(s.context.executable);
  const out=await promisify(execFile)(process.execPath,[resolve('test-support/user-source-node-only-recovery.mjs'),s.workspace,favorite.favoriteId,z.checkpointId]);
  assert.equal(JSON.parse(out.stdout).status,'frozen-restores-passed');
  assert.equal((await config(s)).model,expectedModel);
  const previous=await sources.planUserFavorite({workspace:s.workspace,favoriteId:s.favoriteId});
  await sources.applyUserPlan({workspace:s.workspace,planId:previous.planId});
  assert.equal((await config(s)).plugins[s.pluginId].enabled,true);
});
test('a plugin changed after the reviewed plan is refused before source preparation',mac,async t=>{
  const s=await pluginStateProfile(t); await pluginStateSetup(s);
  const p=await sources.planUserMode({workspace:s.workspace,mode:'trueform'}), before=await readFile(s.configPath);
  await writeFile(join(s.packageRoot,'added.txt'),'independent package update');
  await assert.rejects(sources.applyUserPlan({workspace:s.workspace,planId:p.planId}));
  assert.deepEqual(await readFile(s.configPath),before);
  const normal=await sources.planUserMode({workspace:s.workspace,mode:'normal'});
  await sources.applyUserPlan({workspace:s.workspace,planId:normal.planId});
});
for(const phase of ['journal','staged','write-0','before-completion']) test('package change at '+phase+' blocks completion and recovery restores only controls offline',mac,async t=>{
  const s=await pluginStateProfile(t); await pluginStateSetup(s);
  t.after(()=>setSourceTransactionTestHook(null));
  const p=await sources.planUserMode({workspace:s.workspace,mode:'trueform'}),before=await readFile(s.configPath);
  setSourceTransactionTestHook(async at=>{if(at===phase) await writeFile(join(s.packageRoot,'new-content.txt'),'independent package update');});
  await assert.rejects(sources.applyUserPlan({workspace:s.workspace,planId:p.planId}),{kind:'plugin-dependency-changed'});
  setSourceTransactionTestHook(null);
  if(['journal','staged'].includes(phase)) assert.deepEqual(await readFile(s.configPath),before);
  await rm(s.context.executable);
  const out=await promisify(execFile)(process.execPath,[resolve('test-support/user-source-node-only-recovery.mjs'),s.workspace]);
  const recovered=JSON.parse(out.stdout);
  assert.equal(recovered.status,'controls-restored-dependencies-changed');
  assert.ok(recovered.dependencyConflicts.includes(s.pluginId));
  assert.deepEqual(await readFile(s.configPath),before);
  assert.equal(await readFile(join(s.packageRoot,'new-content.txt'),'utf8'),'independent package update');
});
