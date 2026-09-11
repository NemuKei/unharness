import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pluginStateProfile,pluginStateSetup} from '../test-support/plugin-state-profile.mjs';
import {fixtureAiClient} from '../test-support/ai-client.mjs';
import {sourcesMain} from '../src/sources/cli.mjs';
import {startGuiServer} from '../src/gui/server.mjs';
import {AI_TOOLS} from '../src/ai/tools.mjs';
const mac={skip:process.platform!=='darwin'};
test('MCP plugin enrollment keeps a single receipt across scope change and uses the v3 proposal schema',mac,async t=>{
  const s=await pluginStateProfile(t,true,false),ai=await fixtureAiClient(t,s.workspace);
  const inventory=await ai.call('plugin_enrollment_inventory');
  const before=await readFile(s.configPath);
  const review=await ai.mutate('review_plugin_enrollment',{discoveryId:inventory.discoveryId,
    additions:[{pluginId:s.pluginId,origin:'external',reason:'User confirmed optional fixture.',optional:true}]});
  const connection=(await ai.call('status')).connectionId, requestId=randomUUID();
  const args={connectionId:connection,requestId,reviewId:review.reviewId};
  const first=(await ai.client.callTool({name:'apply_plugin_enrollment',arguments:args})).structuredContent;
  assert.equal(first.ok,true,JSON.stringify(first));
  assert.equal(first.operation.state,'completed');
  const duplicate=(await ai.client.callTool({name:'apply_plugin_enrollment',arguments:args})).structuredContent;
  assert.deepEqual(duplicate,first);
  assert.deepEqual(await readFile(s.configPath),before);
  const next=await fixtureAiClient(t,s.workspace);
  assert.equal((await next.call('operation_status',{requestId})).state,'completed');
  const read=await next.call('read_setup',{schemaVersion:3});
  assert.equal(read.scopeId,review.nextScopeId);assert.equal(read.inventory.plugins[0].id,s.pluginId);
  const {proposal}=await pluginStateSetup(s,{adopt:false});
  const setup=await next.mutate('review_setup',{proposal});
  await next.mutate('apply_setup',{reviewId:setup.reviewId});
  const plan=await next.mutate('plan_mode',{mode:'trueform'});
  assert.equal(plan.pluginStates[0].enabled,false);
  await next.mutate('apply_plan',{planId:plan.planId});
  assert.match(await readFile(s.configPath,'utf8'),/enabled = false/);
});
test('strict schemas reject injected plugin paths, capabilities and unsupported inventory formats',()=>{
  const review=AI_TOOLS.find(t=>t.definition.name==='review_plugin_enrollment');
  const args={connectionId:randomUUID(),requestId:randomUUID(),discoveryId:'a'.repeat(64),
    additions:[{pluginId:'fixture@openai-curated-remote',origin:'external',reason:'Confirmed optional.',optional:true}]};
  assert.equal(review.schema.safeParse(args).success,true);
  for(const extra of [{path:'/private/config'}, {wholePluginControl:true}, {eligibility:'official-confirmed'}, {optional:false}])
    assert.equal(review.schema.safeParse({...args,additions:[{...args.additions[0],...extra}]}).success,false);
  const read=AI_TOOLS.find(t=>t.definition.name==='read_setup');
  assert.equal(read.schema.safeParse({schemaVersion:3}).success,true);
  assert.equal(read.schema.safeParse({schemaVersion:4}).success,false);
  assert.equal(read.schema.safeParse({schemaVersion:3,workspace:'/other'}).success,false);
});
test('CLI and loopback HTTP expose plugin reviews without admitting caller-selected contexts',mac,async t=>{
  const s=await pluginStateProfile(t,true,false);
  async function cli(action,input){
    let stdout='',stderr='';const code=await sourcesMain(['sources',action,'--json',input],
      {stdout:{write:s=>{stdout+=s;}},stderr:{write:s=>{stderr+=s;}}});return{code,stdout,stderr};
  }
  const args=JSON.stringify({workspace:s.workspace});
  const read=await cli('plugin-enrollment-inventory',args);
  assert.equal(read.code,0);assert.equal(JSON.parse(read.stdout).candidates[0].id,s.pluginId);
  const duplicated=await cli('plugin-enrollment-inventory',args.replace('}',',"workspace":"/other"}'));
  assert.equal(duplicated.code,1);assert.equal(duplicated.stdout,'');
  const assets=join(s.parent,'assets');await mkdir(assets);await writeFile(join(assets,'index.html'),'<!doctype html>');
  const gui=await startGuiServer({manageSources:s.context,assetsDirectory:assets});t.after(()=>gui.close());
  const headers={Origin:gui.url,'X-Unharness-Client':'1','Content-Type':'application/json'};
  headers['X-Unharness-Token']=(await(await fetch(gui.url+'/api/bootstrap',{headers})).json()).token;
  const metadata=await(await fetch(gui.url+'/api/sources/metadata',{headers})).json();
  const body={requestId:randomUUID(),launchId:metadata.launchId,contextId:metadata.contextId};
  const post=(action,b)=>fetch(gui.url+'/api/sources/'+action,{method:'POST',headers,body:JSON.stringify(b)});
  assert.equal((await post('plugin-enrollment-inventory',body)).status,200);
  assert.equal((await post('plugin-enrollment-inventory',{...body,requestId:randomUUID(),context:s.context})).status,400);
  assert.equal((await post('setup',{...body,requestId:randomUUID(),schemaVersion:3})).status,200);
  assert.equal((await post('setup',{...body,requestId:randomUUID(),schemaVersion:4})).status,400);
});
