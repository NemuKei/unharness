import * as service from './service.mjs';
export const SOURCES_USAGE =
  '  node bin/unharness.mjs sources <discover|locate|register|status|plan|apply|save|list|favorite|checkpoint|recover|review|review-discovered> --json <object>\n';
const operations = {
  discover: service.discoverUserSources,
  locate: service.locateUserSources,
  register: service.registerUserSources,
  status: service.userSourceState,
  plan: service.planUserMode,
  apply: service.applyUserPlan,
  save: service.saveUserFavorite,
  list: service.listUserFavorites,
  favorite: service.planUserFavorite,
  checkpoint: service.planUserCheckpoint,
  recover: service.recoverUserSources,
  review: service.reviewUserSource,
  'review-discovered': service.reviewDiscoveredUserSource
};
export async function sourcesMain(
  argv,
  { stdout = process.stdout, stderr = process.stderr } = {}
) {
  if (argv.length === 2 && argv[1] === '--help') {
    stdout.write(SOURCES_USAGE);
    return 0;
  }
  if (
    argv.length !== 4 ||
    !operations[argv[1]] ||
    argv[2] !== '--json' ||
    Buffer.byteLength(argv[3]) > 65536
  ) {
    stderr.write('{"error":{"kind":"invalid-request"}}\n');
    return 2;
  }
  try {
    const args = JSON.parse(argv[3]);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw Error();
    const result = await operations[argv[1]](args);
    stdout.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (e) {
    const kind = service.USER_SOURCE_ERROR_KINDS.includes(e?.kind)
      ? e.kind
      : 'invalid-request';
    stderr.write(JSON.stringify({ error: { kind } }) + '\n');
    return 1;
  }
}
