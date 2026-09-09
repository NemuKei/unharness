// Recovering a Claude registration must not need the settings transform, the
// frontmatter parser, YAML or any native catalog: the target bytes are already
// saved in the workspace.
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    if (
      /yaml|catalog\.mjs|config-editor\.mjs|skill-policy\.mjs|claude\/settings/.test(
        specifier
      )
    )
      throw Error('Non-Node restoration dependency');
    return next(specifier, context);
  }
});
const service = await import('../src/sources/service.mjs');
const [workspace] = process.argv.slice(2);
console.log(JSON.stringify(await service.recoverUserSources({ workspace })));
