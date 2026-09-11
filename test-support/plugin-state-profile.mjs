import { mkdtemp, realpath, mkdir, writeFile, readFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOwnedSourceProfile } from '../src/sources/owned-profile.mjs';
import * as sources from '../src/sources/service.mjs';
import { inspectPluginEnrollment, reviewPluginEnrollment, adoptPluginEnrollment } from '../src/setup/plugin-enrollment.mjs';
import { readSetup, reviewSetup, applySetup } from '../src/setup/service.mjs';
export async function pluginStateProfile(t, selector = true, enroll = true) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'unharness-plugin-state-')));
  t.after(() => rm(parent, {recursive:true,force:true}));
  const executable = join(parent, 'codex-fixture');
  await writeFile(executable, '#!' + process.execPath + '\nimport(' + JSON.stringify(new URL('../test/fixtures/plugin-enrollment-server.mjs', import.meta.url).href) + ');\n');
  await chmod(executable, 0o700);
  const owned = await createOwnedSourceProfile({parent,executable});
  const name = 'fixture-state', pluginId = name + '@openai-curated-remote';
  const home = owned.context.codexHome, configPath = join(home, 'config.toml');
  await writeFile(join(home,'.fixture-plugins.json'),JSON.stringify({names:[name]}));
  if (selector !== null) await writeFile(configPath, await readFile(configPath,'utf8') + '\n[plugins.' + JSON.stringify(pluginId) + ']\nenabled = ' + selector + '\n');
  const packageRoot = join(home,'plugins/cache/openai-curated-remote',name,'1.2.3');
  await mkdir(join(packageRoot,'.codex-plugin'),{recursive:true});
  await mkdir(join(packageRoot,'skills/fixture'),{recursive:true});
  await writeFile(join(packageRoot,'.codex-plugin/plugin.json'),JSON.stringify({name,version:'1.2.3',skills:'./skills/'}));
  await writeFile(join(packageRoot,'skills/fixture/SKILL.md'),'# Fixture\nA local fixture.\n');
  const d = await sources.discoverUserSources(owned.context);
  const reg = await sources.registerUserSources({context:owned.context, discoveryId:d.discoveryId,
    instructionsOptional:true,selectedSkillIds:d.skills.filter(s=>s.eligible).map(s=>s.id),userAddedOptional:true});
  const favorite = await sources.saveUserFavorite({workspace:reg.workspace,name:'Before plugin registration'});
  const originalConfig = await readFile(configPath,'utf8');
  if (enroll) {
    const inventory = await inspectPluginEnrollment({workspace:reg.workspace});
    const review = await reviewPluginEnrollment({workspace:reg.workspace,discoveryId:inventory.discoveryId,
      additions:[{pluginId,origin:'external',reason:'Owned optional fixture.',optional:true}]});
    await adoptPluginEnrollment({workspace:reg.workspace,reviewId:review.reviewId});
  }
  return {...owned,...reg,pluginId,packageRoot,configPath,originalConfig,favoriteId:favorite.favoriteId,parent};
}
export async function pluginStateSetup(s, { retained = false, additional = true, adopt = true } = {}) {
  const setup = await readSetup({workspace:s.workspace,schemaVersion:3});
  const ids = setup.inventory.skills.filter(s=>!s.requiredControl).map(s=>s.id);
  const proposal = {schemaVersion:3,scopeId:setup.scopeId,normalId:setup.normalId,inventoryId:setup.inventory.inventoryId,
    basis:{application:'codex',modelId:'synthetic-model',modelSource:'user-specified',desktopVersion:null,runtimeVersion:'0.153.4',
      references:[{url:'https://developers.openai.com/codex/skills',title:'Official fixture reference',checkedAt:'2026-09-11T00:00:00Z'}],rationale:'Synthetic state comparison.'},
    roles:ids.map(sourceId=>({sourceId,origin:'self',reason:'Owned optional Skill.'})),
    trueform:{skillStates:ids.map(sourceId=>({sourceId,state:'manual'})),retainedOfficialPluginIds:retained?[s.pluginId]:[]},
    unseal:{instructions:'minimal',skillElevations:ids.map(sourceId=>({sourceId,state:'automatic'})),additionalPluginIds:!retained&&additional?[s.pluginId]:[]}};
  const review = await reviewSetup({workspace:s.workspace,proposal});
  if (adopt) await applySetup({workspace:s.workspace,reviewId:review.reviewId});
  return {proposal,review};
}
