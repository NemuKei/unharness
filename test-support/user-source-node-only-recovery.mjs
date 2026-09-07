import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    if (
      /yaml|catalog\.mjs|config-editor\.mjs|skill-policy\.mjs/.test(specifier)
    )
      throw Error('Non-Node restoration dependency');
    return next(specifier, context);
  }
});
const service = await import('../src/sources/service.mjs');
const [workspace, favoriteId, checkpointId] = process.argv.slice(2);
if (favoriteId) {
  for (const plan of [
    () => service.planUserMode({ workspace, mode: 'normal' }),
    () => service.planUserFavorite({ workspace, favoriteId }),
    () => service.planUserCheckpoint({ workspace, checkpointId })
  ]) {
    const prepared = await plan();
    await service.applyUserPlan({ workspace, planId: prepared.planId });
  }
  await service.saveUserFavorite({
    workspace,
    name: 'Saved without native dependencies'
  });
  console.log(JSON.stringify({ status: 'frozen-restores-passed' }));
} else
  console.log(JSON.stringify(await service.recoverUserSources({ workspace })));
