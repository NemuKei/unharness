import * as service from './service.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';
export const SOURCES_USAGE =
  '  node bin/unharness.mjs sources <discover|locate|register|status|plan|plan-retained|accept-retained|apply|save|list|favorite|checkpoint|recover|observe|review|review-discovered|review-run|save-run|runs|run|run-output|compare-runs|run-favorite|review-start|save-start|start|starts> --json <object>\n';
const startingOperations = {
  'review-start': service.reviewUserStart,
  'save-start': service.saveUserStart,
  start: service.readUserStart,
  starts: service.listUserStarts
};
const comparisonOperations = {
  'review-run': service.reviewUserRun,
  'save-run': service.saveUserRun,
  runs: service.listUserRuns,
  run: service.readUserRun,
  'run-output': service.readUserRunOutput,
  'compare-runs': service.compareUserRuns,
  'run-favorite': service.saveUserRunFavorite
};
const operations = {
  ...comparisonOperations,
  ...startingOperations,
  discover: service.discoverUserSources,
  locate: service.locateUserSources,
  register: service.registerUserSources,
  status: service.userSourceState,
  plan: service.planUserMode,
  'plan-retained': service.planUserRetainedSettings,
  'accept-retained': service.acceptUserRetainedSettings,
  apply: service.applyUserPlan,
  save: service.saveUserFavorite,
  list: service.listUserFavorites,
  favorite: service.planUserFavorite,
  checkpoint: service.planUserCheckpoint,
  recover: service.recoverUserSources,
  observe: service.observeUserTask,
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
    !Object.hasOwn(operations, argv[1]) ||
    argv[2] !== '--json' ||
    Buffer.byteLength(argv[3]) > (Object.hasOwn(startingOperations, argv[1]) ? 128 * 1024 : 65536)
  ) {
    stderr.write('{"error":{"kind":"invalid-request"}}\n');
    return 2;
  }
  try {
    const args = Object.hasOwn(comparisonOperations, argv[1]) || Object.hasOwn(startingOperations, argv[1]) ? parseStrictJson(argv[3]) : JSON.parse(argv[3]);
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
