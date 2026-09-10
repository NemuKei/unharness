import * as service from './service.mjs';
import { parseStrictJson } from '../core/strict-json.mjs';
export const SOURCES_USAGE =
  '  node bin/unharness.mjs sources <discover|locate|register|status|plan|plan-retained|accept-retained|apply|save|list|favorite|checkpoint|recover|observe|review|review-discovered|review-run|save-run|runs|run|run-output|compare-runs|run-favorite|review-start|save-start|start|starts|review-replay|prepare-replay|handoff-replay|open-replay|replay|replays|cancel-replay|observe-replay|save-replay-result|replay-result|compare-replays|replay-favorite> --json <object>\n';
const replayOperations = {
  'review-replay': service.reviewUserReplay,
  'prepare-replay': service.prepareUserReplay,
  'handoff-replay': service.handoffUserReplay,
  replay: service.readUserReplay,
  replays: service.listUserReplays,
  'cancel-replay': service.cancelUserReplay,
  'observe-replay': service.observeUserReplay,
  'save-replay-result': service.saveUserReplayResult,
  'replay-result': service.readUserReplayResult,
  'open-replay': service.openUserReplay,
  'compare-replays': service.compareUserReplayResults,
  'replay-favorite': service.saveUserReplayFavorite
};
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
  ...service.ENROLLMENT_OPERATIONS,
  ...service.SETUP_OPERATIONS,
  ...service.APPEARANCE_OPERATIONS,
  ...replayOperations,
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
    stdout.write(SOURCES_USAGE + '  Setup commands: ' + Object.keys(service.SETUP_OPERATIONS).join(', ') + '\n'
      + '  Enrollment commands: ' + Object.keys(service.ENROLLMENT_OPERATIONS).join(', ') + '\n'
      + '  Appearance commands: ' + Object.keys(service.APPEARANCE_OPERATIONS).join(', ') + '\n');
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
    const args = Object.hasOwn(comparisonOperations, argv[1]) || Object.hasOwn(startingOperations, argv[1]) || Object.hasOwn(replayOperations, argv[1]) || Object.hasOwn(service.APPEARANCE_OPERATIONS, argv[1]) || Object.hasOwn(service.SETUP_OPERATIONS, argv[1]) || Object.hasOwn(service.ENROLLMENT_OPERATIONS, argv[1]) ? parseStrictJson(argv[3]) : JSON.parse(argv[3]);
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
